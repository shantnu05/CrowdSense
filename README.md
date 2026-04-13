# CrowdSense — AI-Powered Crowd Management & Stampede Prevention System

> Real-time crowd monitoring using YOLOv8 people detection, WebSocket live streaming,
> automated alert escalation, and a React dashboard.

---

## Project Structure

```
crowdsense/
├── backend/
│   ├── main.py          # FastAPI server — REST + WebSocket
│   ├── detector.py      # YOLOv8 detection + optical flow + heatmap
│   ├── alerts.py        # Alert engine — WARNING / CRITICAL / EMERGENCY
│   ├── database.py      # SQLite — counts, alerts, zones, events
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx           # React entry point
│   │   ├── App.jsx            # Router + sidebar layout
│   │   ├── useCrowdSense.js   # WebSocket + API hook (shared state)
│   │   └── pages/
│   │       ├── Dashboard.jsx  # Live overview — metrics, charts, alerts
│   │       ├── CameraFeed.jsx # Camera grid + add/remove cameras
│   │       ├── Analytics.jsx  # Historical charts and zone stats
│   │       ├── ZoneConfig.jsx # Zone threshold management
│   │       └── UploadPage.jsx # Upload image/video for offline analysis
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
└── README.md
```

---

## Quick Start

### 1. Backend setup

```bash
cd crowdsense/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Set Twilio credentials for SMS/call alerts
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_AUTH_TOKEN=your_auth_token
export TWILIO_FROM_NUMBER=+1XXXXXXXXXX
export EMERGENCY_NUMBERS=+91XXXXXXXXXX,+91XXXXXXXXXX
export AMBULANCE_NUMBER=+91108

# Start the server
python main.py
# Server runs at http://localhost:8000
```

> **YOLOv8 model**: On first run, `yolov8n.pt` is auto-downloaded (~6MB).
> Use `yolov8s.pt` or `yolov8m.pt` for better accuracy at the cost of speed.

---

### 2. Frontend setup

```bash
cd crowdsense/frontend

npm install
npm run dev
# Dashboard at http://localhost:3000
```

---

### 3. Connect a camera

#### Option A — IP Webcam (Android phone, free)
1. Install **IP Webcam** from Google Play Store
2. Open the app → scroll down → tap **Start server**
3. Note the URL shown (e.g. `http://192.168.1.5:8080`)
4. In the dashboard → Cameras → **Add Camera**
5. Enter URL as `http://192.168.1.5:8080/video`

#### Option B — RTSP camera / webcam
```
rtsp://username:password@192.168.1.x:554/stream
# Or for a local webcam:
0    (just the integer 0 for default webcam)
```

#### Option C — Register via API directly
```bash
curl -X POST http://localhost:8000/cameras/cam-01/start \
  -H "Content-Type: application/json" \
  -d '{"url": "http://192.168.1.5:8080/video", "zone_id": "zone-main-entry", "fps": 2}'
```

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/health` | Server health + active cameras |
| GET    | `/zones` | List all zones |
| POST   | `/zones/{id}` | Create or update a zone |
| DELETE | `/zones/{id}` | Delete a zone |
| GET    | `/alerts` | Recent alerts (optional: `?unresolved=true`) |
| POST   | `/alerts/{id}/resolve` | Mark alert resolved |
| GET    | `/analytics` | Hourly stats (optional: `?zone_id=&hours=24`) |
| GET    | `/analytics/counts/{zone_id}` | Raw count history |
| GET    | `/analytics/latest` | Latest count per zone |
| POST   | `/cameras/{id}/start` | Start streaming a camera |
| POST   | `/cameras/{id}/stop` | Stop a camera |
| GET    | `/cameras` | List cameras and status |
| POST   | `/upload/frame/{cam_id}` | Analyse a single image |
| POST   | `/upload/video/{cam_id}` | Analyse a video (async job) |
| GET    | `/upload/status/{job_id}` | Poll video analysis job |
| GET    | `/events` | List events |
| POST   | `/events` | Create event |
| POST   | `/events/{id}/close` | Close event (logs peak count) |

### WebSocket Endpoints

| Path | Description |
|------|-------------|
| `ws://localhost:8000/ws/dashboard` | Aggregated live feed — all cameras |
| `ws://localhost:8000/ws/camera/{id}` | Subscribe to a specific camera |

#### WebSocket message types (server → client)

```jsonc
// Initial state on connect
{ "type": "init", "snapshots": [...], "zones": [...], "alerts": [...] }

// Count update (every detection tick)
{
  "type": "count_update",
  "camera_id": "cam-01",
  "zone_id": "zone-main-entry",
  "count": 67,
  "density": 1.67,
  "status": "WARNING",
  "threshold": 80,
  "predicted_count": 74,
  "timestamp": 1719000000.0
}

// Alert fired
{
  "type": "alert",
  "level": "critical",
  "zone_id": "zone-main-entry",
  "zone_name": "Main Entry",
  "count": 78,
  "threshold": 80,
  "message": "CRITICAL — Main Entry: 78 people (97% capacity)...",
  "timestamp": 1719000000.0
}
```

---

## Alert Escalation System

```
Count / Threshold   Level       Action
─────────────────   ─────────   ──────────────────────────────────────────
< 80%               SAFE        Green indicator, no action
≥ 80%               WARNING     Yellow alert, security notified on dashboard
≥ 95%               CRITICAL    Red alert + SMS to emergency contacts (Twilio)
≥ 110%              EMERGENCY   Alarm + automated voice call to ambulance
```

Alerts have per-level cooldowns to prevent spam:
- WARNING: 60 seconds
- CRITICAL: 30 seconds
- EMERGENCY: 15 seconds

---

## Detection Features

| Feature | Implementation |
|---------|----------------|
| People counting | YOLOv8n (class 0 = person) |
| Density calculation | count ÷ zone area (m²) |
| Crowd heatmap | Cumulative Gaussian kernel + COLORMAP_JET overlay |
| Movement flow | Lucas-Kanade optical flow (cv2.calcOpticalFlowPyrLK) |
| Count prediction | Linear regression on last 30 frames |
| Mock mode | Auto-activates when ultralytics not installed |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | `YOUR_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | `YOUR_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | `+1XXXXXXXXXX` | Twilio sender number |
| `EMERGENCY_NUMBERS` | `+91XXXXXXXXXX` | Comma-separated recipient numbers |
| `AMBULANCE_NUMBER` | `+91XXXXXXXXXX` | Ambulance/emergency services number |

---

## Capstone Demo Script

1. **Start backend** — `python main.py`
2. **Start frontend** — `npm run dev`
3. **Open dashboard** — `http://localhost:3000` — runs in demo mode automatically
4. **Connect IP Webcam** — Cameras → Add Camera → paste your phone's URL
5. **Show Upload feature** — upload a crowd image, show annotated output + heatmap
6. **Trigger alert** — lower a zone's threshold below current count in Zones tab
7. **Show analytics** — switch to Analytics, explain hourly trend and zone comparison
8. **Explain escalation** — show the alert log filling up; describe the SMS/call flow

### Key talking points for judges
- Stampedes are preventable — they need **30 seconds of warning**
- System works with **any IP camera** — no proprietary hardware
- **Three-tier escalation** — not just a count, but a response protocol
- **Predictive alert** — warns before threshold is breached using trend extrapolation
- **Heatmap + optical flow** — detects dangerous crowd compression and directional panic
- Fully **open-source stack** — deployable on a Raspberry Pi 5 for under ₹5,000

---

## Advanced Extensions (post-capstone)

- **Panic detection** — sudden optical flow spike in one direction = evacuation signal
- **Face mask / PPE detection** — add class filters for event safety compliance
- **Gate IoT control** — Raspberry Pi + relay to physically lock entry gates
- **WhatsApp alerts** — Twilio WhatsApp API instead of SMS
- **Multi-floor support** — stacked zone maps with floor selector
- **Edge deployment** — run YOLOv8n on Jetson Nano for on-device inference
- **Crowd age/gender estimation** — crowd demographics for event planning

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Detection | YOLOv8 (Ultralytics) + OpenCV |
| Backend | Python 3.11, FastAPI, WebSockets, SQLite |
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Alerts | Twilio SMS + Voice API |
| Deployment | uvicorn (backend), Vite preview (frontend) |
