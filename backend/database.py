# """
# database.py - SQLite persistence
# FIX 2: zones/cameras stored persistently, manually editable
# FIX 5: emergency contacts stored persistently
# """
# import sqlite3, time, json
# from contextlib import contextmanager
# from typing import Optional

# DB_PATH = "crowdsense.db"

# SCHEMA = """
# CREATE TABLE IF NOT EXISTS crowd_counts (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     camera_id TEXT NOT NULL, zone_id TEXT NOT NULL,
#     count INTEGER NOT NULL, density REAL NOT NULL,
#     status TEXT NOT NULL, timestamp REAL NOT NULL
# );
# CREATE TABLE IF NOT EXISTS alerts (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     level TEXT NOT NULL, zone_id TEXT NOT NULL, camera_id TEXT NOT NULL,
#     message TEXT NOT NULL, count INTEGER NOT NULL, threshold INTEGER NOT NULL,
#     resolved INTEGER DEFAULT 0, timestamp REAL NOT NULL
# );
# CREATE TABLE IF NOT EXISTS zones (
#     id TEXT PRIMARY KEY, name TEXT NOT NULL,
#     area_m2 REAL NOT NULL, threshold INTEGER NOT NULL,
#     camera_ids TEXT NOT NULL, created_at REAL NOT NULL
# );
# CREATE TABLE IF NOT EXISTS cameras (
#     id TEXT PRIMARY KEY, url TEXT NOT NULL,
#     zone_id TEXT NOT NULL, fps INTEGER DEFAULT 2,
#     active INTEGER DEFAULT 0, created_at REAL NOT NULL
# );
# CREATE TABLE IF NOT EXISTS emergency_contacts (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     name TEXT NOT NULL, phone TEXT NOT NULL,
#     role TEXT NOT NULL, notify_on TEXT NOT NULL,
#     created_at REAL NOT NULL
# );
# CREATE TABLE IF NOT EXISTS settings (
#     key TEXT PRIMARY KEY, value TEXT NOT NULL
# );
# CREATE INDEX IF NOT EXISTS idx_counts_ts   ON crowd_counts(timestamp);
# CREATE INDEX IF NOT EXISTS idx_counts_zone ON crowd_counts(zone_id);
# CREATE INDEX IF NOT EXISTS idx_alerts_ts   ON alerts(timestamp);
# """

# @contextmanager
# def get_conn():
#     conn = sqlite3.connect(DB_PATH)
#     conn.row_factory = sqlite3.Row
#     conn.execute("PRAGMA journal_mode=WAL")
#     try:
#         yield conn; conn.commit()
#     except Exception:
#         conn.rollback(); raise
#     finally:
#         conn.close()

# def init_db():
#     with get_conn() as conn:
#         conn.executescript(SCHEMA)
#         cur = conn.execute("SELECT COUNT(*) FROM zones")
#         if cur.fetchone()[0] == 0:
#             _seed_defaults(conn)
#     print("[database] Ready:", DB_PATH)

# def _seed_defaults(conn):
#     now = time.time()
#     zones = [
#         ("zone-main-entry", "Main Entry",   40,  80,  ["cam-01"]),
#         ("zone-hall-a",     "Hall A",        120, 150, ["cam-02"]),
#         ("zone-hall-b",     "Hall B",        120, 150, ["cam-03"]),
#         ("zone-exit-gate",  "Exit Gate",     30,  60,  ["cam-04"]),
#     ]
#     for zid, name, area, thresh, cams in zones:
#         conn.execute("INSERT OR IGNORE INTO zones VALUES (?,?,?,?,?,?)",
#                      (zid, name, area, thresh, json.dumps(cams), now))

# # ── Crowd counts ──────────────────────────────────────────────────────
# def insert_count(camera_id, zone_id, count, density, status):
#     with get_conn() as conn:
#         conn.execute(
#             "INSERT INTO crowd_counts (camera_id,zone_id,count,density,status,timestamp) VALUES (?,?,?,?,?,?)",
#             (camera_id, zone_id, count, density, status, time.time()))

# def get_counts(zone_id, minutes=60):
#     cutoff = time.time() - minutes*60
#     with get_conn() as conn:
#         rows = conn.execute(
#             "SELECT * FROM crowd_counts WHERE zone_id=? AND timestamp>? ORDER BY timestamp ASC",
#             (zone_id, cutoff)).fetchall()
#     return [dict(r) for r in rows]

# def get_latest_counts():
#     with get_conn() as conn:
#         rows = conn.execute("""
#             SELECT c.* FROM crowd_counts c
#             INNER JOIN (SELECT zone_id, MAX(timestamp) mt FROM crowd_counts GROUP BY zone_id) l
#             ON c.zone_id=l.zone_id AND c.timestamp=l.mt""").fetchall()
#     return [dict(r) for r in rows]

# def get_analytics(zone_id=None, hours=24):
#     cutoff = time.time() - hours*3600
#     with get_conn() as conn:
#         base = "FROM crowd_counts WHERE timestamp>?"
#         params = [cutoff]
#         if zone_id:
#             base += " AND zone_id=?"; params.append(zone_id)
#         stats = conn.execute(f"SELECT AVG(count) avg_count, MAX(count) peak_count, COUNT(*) samples {base}", params).fetchone()
#         hourly = conn.execute(
#             f"SELECT CAST((timestamp-{cutoff})/3600 AS INT) hour, AVG(count) avg_c, MAX(count) max_c {base} GROUP BY hour ORDER BY hour", params).fetchall()
#         alert_counts = conn.execute(
#             f"SELECT level, COUNT(*) cnt FROM alerts WHERE timestamp>?" + (" AND zone_id=?" if zone_id else "") + " GROUP BY level",
#             [cutoff] + ([zone_id] if zone_id else [])).fetchall()
#     return {
#         "stats": dict(stats) if stats else {},
#         "hourly": [dict(r) for r in hourly],
#         "alert_summary": {r["level"]: r["cnt"] for r in alert_counts},
#     }

# # ── Alerts ────────────────────────────────────────────────────────────
# def insert_alert(level, zone_id, camera_id, message, count, threshold):
#     with get_conn() as conn:
#         cur = conn.execute(
#             "INSERT INTO alerts (level,zone_id,camera_id,message,count,threshold,timestamp) VALUES (?,?,?,?,?,?,?)",
#             (level, zone_id, camera_id, message, count, threshold, time.time()))
#         return cur.lastrowid

# def get_alerts(limit=50, unresolved_only=False):
#     with get_conn() as conn:
#         q = "SELECT * FROM alerts" + (" WHERE resolved=0" if unresolved_only else "") + " ORDER BY timestamp DESC LIMIT ?"
#         rows = conn.execute(q, (limit,)).fetchall()
#     return [dict(r) for r in rows]

# def resolve_alert(alert_id):
#     with get_conn() as conn:
#         conn.execute("UPDATE alerts SET resolved=1 WHERE id=?", (alert_id,))

# # ── Zones ─────────────────────────────────────────────────────────────
# def get_zones():
#     with get_conn() as conn:
#         rows = conn.execute("SELECT * FROM zones").fetchall()
#     result = []
#     for r in rows:
#         d = dict(r); d["camera_ids"] = json.loads(d["camera_ids"]); result.append(d)
#     return result

# def upsert_zone(zone_id, name, area_m2, threshold, camera_ids):
#     with get_conn() as conn:
#         conn.execute(
#             "INSERT INTO zones (id,name,area_m2,threshold,camera_ids,created_at) VALUES (?,?,?,?,?,?) "
#             "ON CONFLICT(id) DO UPDATE SET name=excluded.name, area_m2=excluded.area_m2, "
#             "threshold=excluded.threshold, camera_ids=excluded.camera_ids",
#             (zone_id, name, area_m2, threshold, json.dumps(camera_ids), time.time()))

# def delete_zone(zone_id):
#     with get_conn() as conn:
#         conn.execute("DELETE FROM zones WHERE id=?", (zone_id,))

# # ── Cameras ───────────────────────────────────────────────────────────
# def get_cameras():
#     with get_conn() as conn:
#         rows = conn.execute("SELECT * FROM cameras").fetchall()
#     return [dict(r) for r in rows]

# def upsert_camera(camera_id, url, zone_id, fps=2):
#     with get_conn() as conn:
#         conn.execute(
#             "INSERT INTO cameras (id,url,zone_id,fps,active,created_at) VALUES (?,?,?,?,0,?) "
#             "ON CONFLICT(id) DO UPDATE SET url=excluded.url, zone_id=excluded.zone_id, fps=excluded.fps",
#             (camera_id, url, zone_id, fps, time.time()))

# def set_camera_active(camera_id, active: bool):
#     with get_conn() as conn:
#         conn.execute("UPDATE cameras SET active=? WHERE id=?", (1 if active else 0, camera_id))

# def delete_camera(camera_id):
#     with get_conn() as conn:
#         conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))

# # ── Emergency Contacts ────────────────────────────────────────────────
# def get_emergency_contacts():
#     with get_conn() as conn:
#         rows = conn.execute("SELECT * FROM emergency_contacts ORDER BY created_at").fetchall()
#     return [dict(r) for r in rows]

# def add_emergency_contact(name, phone, role, notify_on):
#     with get_conn() as conn:
#         cur = conn.execute(
#             "INSERT INTO emergency_contacts (name,phone,role,notify_on,created_at) VALUES (?,?,?,?,?)",
#             (name, phone, role, notify_on, time.time()))
#         return cur.lastrowid

# def update_emergency_contact(contact_id, name, phone, role, notify_on):
#     with get_conn() as conn:
#         conn.execute(
#             "UPDATE emergency_contacts SET name=?,phone=?,role=?,notify_on=? WHERE id=?",
#             (name, phone, role, notify_on, contact_id))

# def delete_emergency_contact(contact_id):
#     with get_conn() as conn:
#         conn.execute("DELETE FROM emergency_contacts WHERE id=?", (contact_id,))

# # ── Settings ──────────────────────────────────────────────────────────
# def get_setting(key, default=None):
#     with get_conn() as conn:
#         row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
#     return row["value"] if row else default

# def set_setting(key, value):
#     with get_conn() as conn:
#         conn.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
#                      (key, str(value)))
#________________________________________________





"""
database.py - SQLite persistence
FIX 2: zones/cameras stored persistently, manually editable
FIX 5: emergency contacts stored persistently
"""
import sqlite3, time, json
from contextlib import contextmanager
from typing import Optional

DB_PATH = "crowdsense.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS crowd_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL, zone_id TEXT NOT NULL,
    count INTEGER NOT NULL, density REAL NOT NULL,
    status TEXT NOT NULL, timestamp REAL NOT NULL,
    cumulative_count INTEGER DEFAULT 0   -- NEW FIELD
);
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, zone_id TEXT NOT NULL, camera_id TEXT NOT NULL,
    message TEXT NOT NULL, count INTEGER NOT NULL, threshold INTEGER NOT NULL,
    resolved INTEGER DEFAULT 0, timestamp REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    area_m2 REAL NOT NULL, threshold INTEGER NOT NULL,
    camera_ids TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY, url TEXT NOT NULL,
    zone_id TEXT NOT NULL, fps INTEGER DEFAULT 2,
    active INTEGER DEFAULT 0, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT NOT NULL,
    role TEXT NOT NULL, notify_on TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_counts_ts   ON crowd_counts(timestamp);
CREATE INDEX IF NOT EXISTS idx_counts_zone ON crowd_counts(zone_id);
CREATE INDEX IF NOT EXISTS idx_alerts_ts   ON alerts(timestamp);
"""

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn; conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        cur = conn.execute("SELECT COUNT(*) FROM zones")
        if cur.fetchone()[0] == 0:
            _seed_defaults(conn)
    print("[database] Ready:", DB_PATH)

def _seed_defaults(conn):
    now = time.time()
    zones = [
        ("zone-main-entry", "Main Entry",   40,  80,  ["cam-01"]),
        ("zone-hall-a",     "Hall A",        120, 150, ["cam-02"]),
        ("zone-hall-b",     "Hall B",        120, 150, ["cam-03"]),
        ("zone-exit-gate",  "Exit Gate",     30,  60,  ["cam-04"]),
    ]
    for zid, name, area, thresh, cams in zones:
        conn.execute("INSERT OR IGNORE INTO zones VALUES (?,?,?,?,?,?)",
                     (zid, name, area, thresh, json.dumps(cams), now))

# ── Crowd counts ──────────────────────────────────────────────────────
def insert_count(camera_id, zone_id, count, density, status, cumulative_count=0):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO crowd_counts (camera_id, zone_id, count, density, status, timestamp, cumulative_count) VALUES (?,?,?,?,?,?,?)",
            (camera_id, zone_id, count, density, status, time.time(), cumulative_count)
        )

def get_counts(zone_id, minutes=60):
    cutoff = time.time() - minutes*60
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM crowd_counts WHERE zone_id=? AND timestamp>? ORDER BY timestamp ASC",
            (zone_id, cutoff)).fetchall()
    return [dict(r) for r in rows]

def get_latest_counts():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT c.* FROM crowd_counts c
            INNER JOIN (SELECT zone_id, MAX(timestamp) mt FROM crowd_counts GROUP BY zone_id) l
            ON c.zone_id=l.zone_id AND c.timestamp=l.mt""").fetchall()
    return [dict(r) for r in rows]

def get_analytics(zone_id=None, hours=24):
    cutoff = time.time() - hours*3600
    with get_conn() as conn:
        base = "FROM crowd_counts WHERE timestamp>?"
        params = [cutoff]
        if zone_id:
            base += " AND zone_id=?"; params.append(zone_id)
        stats = conn.execute(f"SELECT AVG(count) avg_count, MAX(count) peak_count, COUNT(*) samples, MAX(cumulative_count) total_entered {base}", params).fetchone()
        hourly = conn.execute(
            f"SELECT CAST((timestamp-{cutoff})/3600 AS INT) hour, AVG(count) avg_c, MAX(count) max_c, MAX(cumulative_count) total_c {base} GROUP BY hour ORDER BY hour", params).fetchall()
        alert_counts = conn.execute(
            f"SELECT level, COUNT(*) cnt FROM alerts WHERE timestamp>?" + (" AND zone_id=?" if zone_id else "") + " GROUP BY level",
            [cutoff] + ([zone_id] if zone_id else [])).fetchall()
    return {
        "stats": dict(stats) if stats else {},
        "hourly": [dict(r) for r in hourly],
        "alert_summary": {r["level"]: r["cnt"] for r in alert_counts},
    }

# ── Alerts ────────────────────────────────────────────────────────────
def insert_alert(level, zone_id, camera_id, message, count, threshold):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO alerts (level,zone_id,camera_id,message,count,threshold,timestamp) VALUES (?,?,?,?,?,?,?)",
            (level, zone_id, camera_id, message, count, threshold, time.time()))
        return cur.lastrowid

def get_alerts(limit=50, unresolved_only=False):
    with get_conn() as conn:
        q = "SELECT * FROM alerts" + (" WHERE resolved=0" if unresolved_only else "") + " ORDER BY timestamp DESC LIMIT ?"
        rows = conn.execute(q, (limit,)).fetchall()
    return [dict(r) for r in rows]

def resolve_alert(alert_id):
    with get_conn() as conn:
        conn.execute("UPDATE alerts SET resolved=1 WHERE id=?", (alert_id,))

# ── Zones ─────────────────────────────────────────────────────────────
def get_zones():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM zones").fetchall()
    result = []
    for r in rows:
        d = dict(r); d["camera_ids"] = json.loads(d["camera_ids"]); result.append(d)
    return result

def upsert_zone(zone_id, name, area_m2, threshold, camera_ids):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO zones (id,name,area_m2,threshold,camera_ids,created_at) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, area_m2=excluded.area_m2, "
            "threshold=excluded.threshold, camera_ids=excluded.camera_ids",
            (zone_id, name, area_m2, threshold, json.dumps(camera_ids), time.time()))

def delete_zone(zone_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM zones WHERE id=?", (zone_id,))

# ── Cameras ───────────────────────────────────────────────────────────
def get_cameras():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM cameras").fetchall()
    return [dict(r) for r in rows]

def upsert_camera(camera_id, url, zone_id, fps=2):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO cameras (id,url,zone_id,fps,active,created_at) VALUES (?,?,?,?,0,?) "
            "ON CONFLICT(id) DO UPDATE SET url=excluded.url, zone_id=excluded.zone_id, fps=excluded.fps",
            (camera_id, url, zone_id, fps, time.time()))

def set_camera_active(camera_id, active: bool):
    with get_conn() as conn:
        conn.execute("UPDATE cameras SET active=? WHERE id=?", (1 if active else 0, camera_id))

def delete_camera(camera_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))

# ── Emergency Contacts ────────────────────────────────────────────────
def get_emergency_contacts():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM emergency_contacts ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]

def add_emergency_contact(name, phone, role, notify_on):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO emergency_contacts (name,phone,role,notify_on,created_at) VALUES (?,?,?,?,?)",
            (name, phone, role, notify_on, time.time()))
        return cur.lastrowid

def update_emergency_contact(contact_id, name, phone, role, notify_on):
    with get_conn() as conn:
        conn.execute(
            "UPDATE emergency_contacts SET name=?,phone=?,role=?,notify_on=? WHERE id=?",
            (name, phone, role, notify_on, contact_id))

def delete_emergency_contact(contact_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM emergency_contacts WHERE id=?", (contact_id,))

# ── Settings ──────────────────────────────────────────────────────────
def get_setting(key, default=None):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default

def set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key,value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)))