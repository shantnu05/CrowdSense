"""
alerts.py - Alert engine with persistent emergency contacts
FIX 5: Emergency contacts loaded from DB, manually configurable
"""
import time, asyncio, os
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict

try:
    from twilio.rest import Client as TwilioClient
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

WARNING_PCT   = 0.80
CRITICAL_PCT  = 0.95
EMERGENCY_PCT = 1.10

ALERT_COOLDOWN = {"warning": 60, "critical": 30, "emergency": 15}

@dataclass
class AlertEvent:
    level: str
    zone_id: str
    zone_name: str
    camera_id: str
    count: int
    threshold: int
    message: str
    timestamp: float = field(default_factory=time.time)
    sms_sent: bool = False
    call_placed: bool = False

class AlertEngine:
    def __init__(self):
        self._last_alert: dict = defaultdict(lambda: defaultdict(float))
        self._current_levels: dict = {}
        self._twilio = None
        self._callbacks: list = []
        self._init_twilio()

    def _init_twilio(self):
        if TWILIO_AVAILABLE and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            try:
                self._twilio = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                print("[alerts] Twilio ready")
            except Exception as e:
                print(f"[alerts] Twilio init failed: {e}")

    def register_callback(self, coro):
        self._callbacks.append(coro)

    def evaluate(self, zone_id, zone_name, camera_id, count, threshold) -> Optional[AlertEvent]:
        ratio = count / max(1, threshold)
        level = self._classify(ratio)
        self._current_levels[zone_id] = level
        if level == "safe":
            return None
        last = self._last_alert[zone_id][level]
        if time.time() - last < ALERT_COOLDOWN.get(level, 60):
            return None
        self._last_alert[zone_id][level] = time.time()
        message = self._build_message(level, zone_name, count, threshold)
        event = AlertEvent(level=level, zone_id=zone_id, zone_name=zone_name,
                           camera_id=camera_id, count=count, threshold=threshold, message=message)
        asyncio.ensure_future(self._dispatch(event))
        return event

    def get_zone_status(self, zone_id):
        return self._current_levels.get(zone_id, "safe")

    @staticmethod
    def _classify(ratio):
        if ratio >= EMERGENCY_PCT: return "emergency"
        if ratio >= CRITICAL_PCT:  return "critical"
        if ratio >= WARNING_PCT:   return "warning"
        return "safe"

    @staticmethod
    def _build_message(level, zone_name, count, threshold):
        pct = round(count / threshold * 100)
        return {
            "warning":   f"WARNING — {zone_name}: {count} people ({pct}% of {threshold}). Slow entry.",
            "critical":  f"CRITICAL — {zone_name}: {count} people ({pct}%). STOP ENTRY NOW.",
            "emergency": f"EMERGENCY — {zone_name}: {count} people ({pct}%). STAMPEDE RISK. Evacuate.",
        }.get(level, f"Alert: {zone_name} has {count} people")

    async def _dispatch(self, event: AlertEvent):
        import database as db
        for cb in self._callbacks:
            try: await cb(event)
            except Exception as e: print(f"[alerts] callback error: {e}")

        contacts = db.get_emergency_contacts()

        if event.level in ("critical", "emergency"):
            # SMS to contacts who want critical+ alerts
            sms_contacts = [c for c in contacts if event.level in c["notify_on"]]
            if sms_contacts:
                await asyncio.to_thread(self._send_sms, event, sms_contacts)

        if event.level == "emergency":
            # Call ALL emergency contacts on emergency
            call_contacts = [c for c in contacts if "emergency" in c["notify_on"]]
            if call_contacts:
                await asyncio.to_thread(self._place_calls, event, call_contacts)

        print(f"[alerts] [{event.level.upper()}] {event.message}")

    def _send_sms(self, event: AlertEvent, contacts: list):
        body = f"CrowdSense Alert\n{event.message}"
        for contact in contacts:
            phone = contact["phone"].strip()
            if not phone:
                continue
            if self._twilio and TWILIO_FROM_NUMBER:
                try:
                    msg = self._twilio.messages.create(to=phone, from_=TWILIO_FROM_NUMBER, body=body)
                    print(f"[alerts] SMS sent to {contact['name']} ({phone}): {msg.sid}")
                    event.sms_sent = True
                except Exception as e:
                    print(f"[alerts] SMS failed to {phone}: {e}")
            else:
                print(f"[alerts] SMS (mock) to {contact['name']} {phone}: {body}")

    def _place_calls(self, event: AlertEvent, contacts: list):
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">Emergency alert from CrowdSense. {event.message}. Please respond immediately.</Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-IN">This is an automated emergency. Please take immediate action.</Say>
</Response>"""
        for contact in contacts:
            phone = contact["phone"].strip()
            if not phone: continue
            if self._twilio and TWILIO_FROM_NUMBER:
                try:
                    call = self._twilio.calls.create(to=phone, from_=TWILIO_FROM_NUMBER, twiml=twiml)
                    print(f"[alerts] Call placed to {contact['name']} ({phone}): {call.sid}")
                    event.call_placed = True
                except Exception as e:
                    print(f"[alerts] Call failed to {phone}: {e}")
            else:
                print(f"[alerts] CALL (mock) to {contact['name']} {phone} — {event.message}")

alert_engine = AlertEngine()
