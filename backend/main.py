
"""
main.py - CrowdSense FastAPI server
FIX 1: Real continuous MJPEG streaming (not snapshot)
FIX 2: Zones/cameras fully CRUD with persistence
FIX 3: Upload results pushed to dashboard via WebSocket
FIX 5: Emergency contacts full CRUD API
"""
import asyncio, base64, json, time, cv2, numpy as np
from contextlib import asynccontextmanager
from typing import Optional

# 🔥 FIX: PyTorch 2.6 'weights_only' breaking change workaround
# This monkey-patch forces PyTorch to load YOLOv8 weights without throwing the Unpickler error.
# It must be applied before importing the detector.
try:
    import torch
    _original_torch_load = torch.load
    def _patched_torch_load(*args, **kwargs):
        kwargs['weights_only'] = False
        return _original_torch_load(*args, **kwargs)
    torch.load = _patched_torch_load
except ImportError:
    pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import database as db
from detector import CrowdDetector
from alerts import alert_engine, AlertEvent

# ── Startup ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    alert_engine.register_callback(broadcast_alert)
    print("[main] CrowdSense started on http://0.0.0.0:8000")
    yield

app = FastAPI(title="CrowdSense API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── State ─────────────────────────────────────────────────────────────
detectors: dict[str, CrowdDetector] = {}
camera_tasks: dict[str, asyncio.Task] = {}
latest_snapshots: dict[str, dict] = {}
dashboard_clients: set[WebSocket] = set()
camera_clients: dict[str, set[WebSocket]] = {}

def get_detector(camera_id: str, zone_area_m2=100.0) -> CrowdDetector:
    if camera_id not in detectors:
        detectors[camera_id] = CrowdDetector(zone_area_m2=zone_area_m2)
    return detectors[camera_id]

def _status_label(count, threshold):
    r = count / max(1, threshold)
    if r >= 1.10: return "EMERGENCY"
    if r >= 0.95: return "CRITICAL"
    if r >= 0.80: return "WARNING"
    return "SAFE"

# ── WebSocket broadcast ───────────────────────────────────────────────
async def broadcast_alert(event: AlertEvent):
    payload = json.dumps({"type": "alert", "level": event.level,
        "zone_id": event.zone_id, "zone_name": event.zone_name,
        "camera_id": event.camera_id, "count": event.count,
        "threshold": event.threshold, "message": event.message,
        "timestamp": event.timestamp})
    await _broadcast_to(dashboard_clients, payload)

async def broadcast_snapshot(camera_id: str, snap: dict):
    # 🔥 FIX: Completely strip huge base64 from ALL websocket broadcasts 
    # This prevents Vite from crashing with ECONNABORTED when uploading large images.
    safe_snap = snap.copy()
    safe_snap.pop("frame_b64", None)
    safe_snap.pop("heatmap_b64", None)

    full_payload = json.dumps({
        "type": "snapshot",
        "camera_id": camera_id,
        **safe_snap
    })

    await _broadcast_to(camera_clients.get(camera_id, set()), full_payload)

    # lightweight dashboard update (unchanged)
    summary = json.dumps({
        "type": "count_update",
        "camera_id": camera_id,
        "zone_id": snap.get("zone_id",""),
        "zone_name": snap.get("zone_name",""),
        "count": snap.get("count", 0),
        "density": snap.get("density", 0),
        "status": snap.get("status","SAFE"),
        "threshold": snap.get("threshold",100),
        "predicted_count": snap.get("predicted_count"),
        "timestamp": snap.get("timestamp"),
        "cumulative_count": snap.get("cumulative_count", 0)
    })

    await _broadcast_to(dashboard_clients, summary)

async def _broadcast_to(clients: set, payload: str):
    dead = set()
    for ws in list(clients):
        try: await ws.send_text(payload)
        except Exception: dead.add(ws)
    clients -= dead

# ── WebSocket endpoints ───────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_stream(ws: WebSocket):
    await ws.accept()
    dashboard_clients.add(ws)
    
    # Strip huge base64 strings from initial dashboard sync
    safe_snapshots = []
    for s in latest_snapshots.values():
        safe_s = s.copy()
        safe_s.pop("frame_b64", None)
        safe_s.pop("heatmap_b64", None)
        safe_snapshots.append(safe_s)

    # Send current state immediately
    await ws.send_text(json.dumps({"type": "init",
        "snapshots": safe_snapshots,
        "zones": db.get_zones(),
        "cameras": db.get_cameras(),
        "alerts": db.get_alerts(limit=30),
        "contacts": db.get_emergency_contacts(),
    }))
    try:
        while True: await asyncio.sleep(30)
    except WebSocketDisconnect:
        dashboard_clients.discard(ws)

@app.websocket("/ws/camera/{camera_id}")
async def camera_ws(ws: WebSocket, camera_id: str):
    """Subscribe to full frame data from a specific camera."""
    await ws.accept()
    camera_clients.setdefault(camera_id, set()).add(ws)
    try:
        while True: await asyncio.sleep(30)
    except WebSocketDisconnect:
        camera_clients.get(camera_id, set()).discard(ws)

# ── FIX 1: MJPEG stream endpoint (real continuous video) ──────────────
@app.get("/stream/{camera_id}")
async def mjpeg_stream(camera_id: str):
    """
    Returns a real MJPEG stream from the camera.
    Use this as <img src="/stream/cam-01"> in the frontend for live video.
    """
    async def generate():
        while True:
            snap = latest_snapshots.get(camera_id)
            if snap and snap.get("frame_b64"):
                try:
                    frame_bytes = base64.b64decode(snap["frame_b64"])
                    yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
                except Exception:
                    pass
            await asyncio.sleep(0.1)  # ~10fps for stream

    return StreamingResponse(generate(),
        media_type="multipart/x-mixed-replace;boundary=frame",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── Camera management ─────────────────────────────────────────────────
class CameraRequest(BaseModel):
    url: str
    zone_id: str
    fps: int = 2

@app.post("/cameras/{camera_id}/start")
async def start_camera(camera_id: str, req: CameraRequest):
    # Save to DB
    db.upsert_camera(camera_id, req.url, req.zone_id, req.fps)

    # Stop existing task if any
    existing = camera_tasks.get(camera_id)
    if existing and not existing.done():
        existing.cancel()
        await asyncio.sleep(0.2)

    task = asyncio.create_task(_stream_camera(camera_id, req.url, req.zone_id, req.fps))
    camera_tasks[camera_id] = task
    db.set_camera_active(camera_id, True)
    return {"status": "started", "camera_id": camera_id}

@app.post("/cameras/{camera_id}/stop")
async def stop_camera(camera_id: str):
    task = camera_tasks.get(camera_id)
    if task and not task.done():
        task.cancel()
    db.set_camera_active(camera_id, False)
    latest_snapshots.pop(camera_id, None)
    return {"status": "stopped"}

@app.delete("/cameras/{camera_id}")
async def delete_camera(camera_id: str):
    task = camera_tasks.get(camera_id)
    if task and not task.done():
        task.cancel()
    db.delete_camera(camera_id)
    latest_snapshots.pop(camera_id, None)
    detectors.pop(camera_id, None)
    return {"status": "deleted"}

@app.get("/cameras")
async def list_cameras():
    cams = db.get_cameras()
    for c in cams:
        c["running"] = camera_id_running(c["id"])
        
        # Strip huge base64 strings from REST API so polling doesn't crash Vite proxy
        snap = latest_snapshots.get(c["id"])
        if snap:
            safe_s = snap.copy()
            safe_s.pop("frame_b64", None)
            safe_s.pop("heatmap_b64", None)
            c["latest"] = safe_s
        else:
            c["latest"] = None
            
    return cams

def camera_id_running(camera_id):
    t = camera_tasks.get(camera_id)
    return t is not None and not t.done()

# ── FIX 1: Continuous streaming loop ─────────────────────────────────
cumulative_counts = {}

async def _stream_camera(camera_id: str, url: str, zone_id: str, fps: int):
    """
    FIX 1: Runs continuously. Never stops after one frame.
    Reconnects automatically on disconnect.
    """
    zones_map = {z["id"]: z for z in db.get_zones()}
    zone = zones_map.get(zone_id, {})
    threshold = zone.get("threshold", 100)
    zone_name  = zone.get("name", zone_id)
    area_m2    = zone.get("area_m2", 100)

    detector = get_detector(camera_id, area_m2)
    interval = 1.0 / max(1, fps)
    retry_count = 0
    MAX_RETRIES = 10

    print(f"[stream] Starting {camera_id} → {url}")

    while retry_count < MAX_RETRIES:
        cap = None
        try:
            # FIX 1: use FFMPEG backend with timeout for IP Webcam
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # minimal buffer = most recent frame
            cap.set(cv2.CAP_PROP_FPS, fps)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)

            if not cap.isOpened():
                print(f"[stream] Cannot open {url}, retry {retry_count+1}/{MAX_RETRIES}")
                retry_count += 1
                await asyncio.sleep(3)
                continue

            retry_count = 0  # reset on success
            print(f"[stream] {camera_id} connected")
            consecutive_failures = 0

            while True:
                t0 = time.time()

                # FIX 1: grab() discards buffered frames, retrieve() gets latest
                # This ensures we always process the NEWEST frame, not stale ones
                cap.grab()
                ret, frame = cap.retrieve()

                if not ret or frame is None:
                    consecutive_failures += 1
                    if consecutive_failures > 10:
                        print(f"[stream] {camera_id} lost feed")
                        break
                    await asyncio.sleep(0.2)
                    continue

                consecutive_failures = 0

                # Re-read zone config in case it changed
                zones_map = {z["id"]: z for z in db.get_zones()}
                zone = zones_map.get(zone_id, {})
                threshold = zone.get("threshold", 100)
                zone_name = zone.get("name", zone_id)
                detector.set_zone_area(zone.get("area_m2", 100))

                result = await asyncio.to_thread(detector.process_frame, frame)
                status = _status_label(result.count, threshold)
                predicted = detector.predict_count(10)
                prev = cumulative_counts.get(camera_id, 0)
                cumulative_counts[camera_id] = prev + result.count



                snap = {
                    "camera_id": camera_id, "zone_id": zone_id, "zone_name": zone_name,
                    "count": result.count, "density": result.density,
                    "status": status, "threshold": threshold,
                    "predicted_count": predicted,
                    "bounding_boxes": result.bounding_boxes[:20],
                    "frame_b64": result.annotated_frame_b64,
                    "heatmap_b64": result.heatmap_b64,
                    "inference_ms": result.inference_ms,
                    "timestamp": result.timestamp,
                    "cumulative_count": cumulative_counts[camera_id] 
                }
                latest_snapshots[camera_id] = snap
                await broadcast_snapshot(camera_id, snap)

                await asyncio.to_thread(db.insert_count,camera_id, zone_id, result.count, result.density, status, cumulative_counts[camera_id])

                alert = alert_engine.evaluate(zone_id, zone_name, camera_id, result.count, threshold)
                if alert:
                    await asyncio.to_thread(db.insert_alert, alert.level, zone_id, camera_id,
                                            alert.message, alert.count, threshold, result.cumulative_count)

                elapsed = time.time() - t0
                await asyncio.sleep(max(0, interval - elapsed))

        except asyncio.CancelledError:
            print(f"[stream] {camera_id} stopped")
            return
        except Exception as e:
            print(f"[stream] {camera_id} error: {e}")
            retry_count += 1
        finally:
            if cap: cap.release()

        if retry_count < MAX_RETRIES:
            print(f"[stream] {camera_id} reconnecting in 3s...")
            await asyncio.sleep(3)

    print(f"[stream] {camera_id} max retries reached, giving up")
    db.set_camera_active(camera_id, False)

# ── Upload ────────────────────────────────────────────────────────────
cumulative_counts = {}

@app.post("/upload/frame/{camera_id}")
async def upload_frame(camera_id: str, zone_id: str = "zone-main-entry", file: UploadFile = File(...)):
    data = await file.read()
    detector = get_detector(camera_id)
    try:
        result = await asyncio.to_thread(detector.process_frame_bytes, data)
    except ValueError as e:
        raise HTTPException(400, str(e))

    zones_map = {z["id"]: z for z in db.get_zones()}
    threshold = zones_map.get(zone_id, {}).get("threshold", 100)
    zone_name = zones_map.get(zone_id, {}).get("name", zone_id)
    status = _status_label(result.count, threshold)
    prev = cumulative_counts.get(camera_id, 0)
    cumulative_counts[camera_id] = prev + result.count


    # Push result to dashboard
    snap = {
        "camera_id": camera_id, "zone_id": zone_id, "zone_name": zone_name,
        "count": result.count, "density": result.density,
        "status": status, "threshold": threshold,
        "frame_b64": result.annotated_frame_b64,
        "heatmap_b64": result.heatmap_b64,
        "inference_ms": result.inference_ms,
        "timestamp": result.timestamp,
        "cumulative_count": cumulative_counts[camera_id]

        
    }
    latest_snapshots[camera_id] = snap
    await broadcast_snapshot(camera_id, snap)
    await asyncio.to_thread(
        db.insert_count,
        camera_id, zone_id, result.count, result.density, status, cumulative_counts[camera_id]
    )


    return {**snap, "bounding_boxes": result.bounding_boxes}

video_jobs: dict = {}

@app.post("/upload/video/{camera_id}")
async def upload_video(camera_id: str, zone_id: str = "zone-main-entry",
                       file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    data = await file.read()
    job_id = f"job-{int(time.time())}-{camera_id}"
    video_jobs[job_id] = {"status": "processing", "results": [], "started": time.time()}
    background_tasks.add_task(_process_video, job_id, camera_id, zone_id, data)
    return {"job_id": job_id}

async def _process_video(job_id, camera_id, zone_id, data):
    detector = get_detector(camera_id)
    zones_map = {z["id"]: z for z in db.get_zones()}
    threshold = zones_map.get(zone_id, {}).get("threshold", 100)
    zone_name = zones_map.get(zone_id, {}).get("name", zone_id)

    tmp = f"/tmp/{job_id}.mp4"
    with open(tmp, "wb") as f: f.write(data)
    cap = cv2.VideoCapture(tmp)
    results, frame_num = [], 0
    while True:
        ret, frame = cap.read()
        if not ret: break
        if frame_num % 10 == 0:
            result = await asyncio.to_thread(detector.process_frame, frame)
            status = _status_label(result.count, threshold)
            results.append({"frame": frame_num, "count": result.count, "status": status})
            # push each keyframe to dashboard
            snap = {"camera_id": camera_id, "zone_id": zone_id, "zone_name": zone_name,
                    "count": result.count, "density": result.density, "status": status,
                    "threshold": threshold, "frame_b64": result.annotated_frame_b64,
                    "timestamp": result.timestamp}
            latest_snapshots[camera_id] = snap
            await broadcast_snapshot(camera_id, snap)
        frame_num += 1
    cap.release()
    peak = max((r["count"] for r in results), default=0)
    video_jobs[job_id] = {"status": "complete", "peak_count": peak,
                          "frames_analysed": len(results), "results": results}

@app.get("/upload/status/{job_id}")
async def upload_status(job_id: str):
    job = video_jobs.get(job_id)
    if not job: raise HTTPException(404, "Job not found")
    return job

# ── Zones CRUD ────────────────────────────────────────────────────────
class ZoneRequest(BaseModel):
    name: str; area_m2: float; threshold: int; camera_ids: list[str]

@app.get("/zones")
async def list_zones(): return db.get_zones()

@app.post("/zones/{zone_id}")
async def upsert_zone(zone_id: str, req: ZoneRequest):
    db.upsert_zone(zone_id, req.name, req.area_m2, req.threshold, req.camera_ids)
    # Broadcast updated zones to dashboard
    await _broadcast_to(dashboard_clients, json.dumps({"type": "zones_updated", "zones": db.get_zones()}))
    return {"status": "ok"}

@app.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str):
    db.delete_zone(zone_id)
    return {"status": "deleted"}

# ── Alerts ────────────────────────────────────────────────────────────
@app.get("/alerts")
async def get_alerts(limit: int = 50, unresolved: bool = False):
    return db.get_alerts(limit=limit, unresolved_only=unresolved)

@app.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int):
    db.resolve_alert(alert_id); return {"status": "resolved"}

# ── Analytics ─────────────────────────────────────────────────────────
@app.get("/analytics")
async def analytics(zone_id: Optional[str] = None, hours: int = 24):
    return db.get_analytics(zone_id=zone_id, hours=hours)

@app.get("/analytics/counts/{zone_id}")
async def count_history(zone_id: str, minutes: int = 60):
    return db.get_counts(zone_id, minutes=minutes)

# ── FIX 5: Emergency Contacts CRUD ───────────────────────────────────
class ContactRequest(BaseModel):
    name: str
    phone: str
    role: str
    notify_on: str   # comma-separated: "warning,critical,emergency"

@app.get("/contacts")
async def list_contacts(): return db.get_emergency_contacts()

@app.post("/contacts")
async def add_contact(req: ContactRequest):
    cid = db.add_emergency_contact(req.name, req.phone, req.role, req.notify_on)
    await _broadcast_to(dashboard_clients, json.dumps({"type": "contacts_updated", "contacts": db.get_emergency_contacts()}))
    return {"id": cid}

@app.put("/contacts/{contact_id}")
async def update_contact(contact_id: int, req: ContactRequest):
    db.update_emergency_contact(contact_id, req.name, req.phone, req.role, req.notify_on)
    await _broadcast_to(dashboard_clients, json.dumps({"type": "contacts_updated", "contacts": db.get_emergency_contacts()}))
    return {"status": "ok"}

@app.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: int):
    db.delete_emergency_contact(contact_id)
    return {"status": "deleted"}

# ── Settings ─────────────────────────────────────────────────────────
class TwilioSettings(BaseModel):
    account_sid: str; auth_token: str; from_number: str

@app.post("/settings/twilio")
async def save_twilio(req: TwilioSettings):
    import os, alerts as al
    os.environ["TWILIO_ACCOUNT_SID"]  = req.account_sid
    os.environ["TWILIO_AUTH_TOKEN"]   = req.auth_token
    os.environ["TWILIO_FROM_NUMBER"]  = req.from_number
    db.set_setting("twilio_sid",  req.account_sid)
    db.set_setting("twilio_token", req.auth_token)
    db.set_setting("twilio_from",  req.from_number)
    al.TWILIO_ACCOUNT_SID  = req.account_sid
    al.TWILIO_AUTH_TOKEN   = req.auth_token
    al.TWILIO_FROM_NUMBER  = req.from_number
    alert_engine._init_twilio()
    return {"status": "saved"}

# ── Health ────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "cameras_running": sum(1 for t in camera_tasks.values() if not t.done()),
            "dashboard_clients": len(dashboard_clients), "timestamp": time.time()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)