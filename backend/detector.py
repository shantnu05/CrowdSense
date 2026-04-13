# """
# detector.py - YOLOv8 People Detection Engine
# Fixed: higher confidence, person-only class, proper frame streaming
# """
# import cv2, numpy as np, base64, time
# from dataclasses import dataclass, field
# from typing import Optional
# from collections import deque

# try:
#     from ultralytics import YOLO
#     YOLO_AVAILABLE = True
# except ImportError:
#     YOLO_AVAILABLE = False

# @dataclass
# class DetectionResult:
#     count: int
#     density: float
#     bounding_boxes: list
#     annotated_frame_b64: Optional[str]
#     heatmap_b64: Optional[str]
#     flow_vectors: list
#     timestamp: float = field(default_factory=time.time)
#     inference_ms: float = 0.0

# class CrowdDetector:
#     def __init__(self, model_path="yolov8n.pt", confidence=0.25, zone_area_m2=100.0):
#         # FIX 4: confidence raised to 0.55 (was 0.4) — reduces false positives heavily
#         self.confidence = confidence
#         self.zone_area_m2 = zone_area_m2
#         self.model = None
#         self._prev_gray = None
#         self._prev_points = None
#         self._heatmap_acc = None
#         self._count_history = deque(maxlen=30)

#         if YOLO_AVAILABLE:
#             try:
#                 self.model = YOLO(model_path)
#                 # Warm up model
#                 dummy = np.zeros((640, 640, 3), dtype=np.uint8)
#                 self.model(dummy, classes=[0], conf=self.confidence, verbose=False)
#                 print(f"[detector] YOLO loaded & warmed up: {model_path}")
#             except Exception as e:
#                 print(f"[detector] Could not load model: {e}")
#         else:
#             print("[detector] Running MOCK mode")

#     def process_frame(self, frame: np.ndarray) -> DetectionResult:
#         t0 = time.time()
#         if frame is None or frame.size == 0:
#             return DetectionResult(0, 0.0, [], None, None, [])
#         # Resize for speed while keeping aspect ratio
#         h, w = frame.shape[:2]
#         if w > 1280:
#             scale = 1280 / w
#             frame = cv2.resize(frame, (1280, int(h * scale)))

#         result = self._yolo_detect(frame) if self.model else self._mock_detect(frame)
#         result.inference_ms = round((time.time() - t0) * 1000, 1)
#         self._count_history.append(result.count)
#         return result

#     def process_frame_bytes(self, data: bytes) -> DetectionResult:
#         arr = np.frombuffer(data, np.uint8)
#         frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
#         if frame is None:
#             raise ValueError("Cannot decode image")
#         return self.process_frame(frame)

#     def predict_count(self, seconds_ahead=10) -> Optional[int]:
#         if len(self._count_history) < 5:
#             return None
#         h = list(self._count_history)
#         coeffs = np.polyfit(range(len(h)), h, 1)
#         predicted = int(coeffs[0] * (len(h) + seconds_ahead) + coeffs[1])
#         return max(0, predicted)

#     def set_zone_area(self, area_m2: float):
#         self.zone_area_m2 = max(1.0, area_m2)

#     def _yolo_detect(self, frame: np.ndarray) -> DetectionResult:
#         # FIX 4: classes=[0] = person ONLY, iou=0.45 reduces duplicate boxes
#         results = self.model(
#             frame, classes=[0], conf=self.confidence,
#             iou=0.45, verbose=False, agnostic_nms=True
#         )
#         boxes_raw = results[0].boxes
#         count = len(boxes_raw) if boxes_raw is not None else 0
#         bboxes, centers = [], []

#         for box in boxes_raw:
#             x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
#             conf = round(float(box.conf[0]), 2)
#             bboxes.append({"x": x1, "y": y1, "w": x2-x1, "h": y2-y1, "conf": conf})
#             centers.append(((x1+x2)//2, (y1+y2)//2))

#         annotated = results[0].plot()
#         self._update_heatmap(frame, centers)
#         flow = self._compute_flow(frame)

#         return DetectionResult(
#             count=count,
#             density=round(count / self.zone_area_m2, 3),
#             bounding_boxes=bboxes,
#             annotated_frame_b64=self._encode(annotated),
#             heatmap_b64=self._encode(self._render_heatmap(frame)),
#             flow_vectors=flow,
#         )

#     def _mock_detect(self, frame: np.ndarray) -> DetectionResult:
#         # Mock mode: returns 0 people — be honest in demo
#         annotated = frame.copy()
#         cv2.putText(annotated, "MOCK MODE - Install ultralytics for real detection",
#                     (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
#         return DetectionResult(
#             count=0, density=0.0, bounding_boxes=[],
#             annotated_frame_b64=self._encode(annotated),
#             heatmap_b64=None, flow_vectors=[],
#         )

#     def _compute_flow(self, frame: np.ndarray) -> list:
#         gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
#         vectors = []
#         if self._prev_gray is not None and self._prev_points is not None and len(self._prev_points) > 0:
#             nxt, status, _ = cv2.calcOpticalFlowPyrLK(
#                 self._prev_gray, gray, self._prev_points, None,
#                 winSize=(15,15), maxLevel=2,
#                 criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT, 10, 0.03)
#             )
#             if nxt is not None:
#                 for new, old in zip(nxt[status==1], self._prev_points[status==1]):
#                     dx, dy = float(new[0]-old[0]), float(new[1]-old[1])
#                     if abs(dx)+abs(dy) > 1.5:
#                         vectors.append({"dx":round(dx,1),"dy":round(dy,1),"ox":round(float(old[0]),1),"oy":round(float(old[1]),1)})
#         corners = cv2.goodFeaturesToTrack(gray, maxCorners=60, qualityLevel=0.3, minDistance=7, blockSize=7)
#         self._prev_points = corners
#         self._prev_gray = gray
#         return vectors[:20]

#     def _update_heatmap(self, frame, centers):
#         h, w = frame.shape[:2]
#         if self._heatmap_acc is None:
#             self._heatmap_acc = np.zeros((h, w), dtype=np.float32)
#         if self._heatmap_acc.shape != (h, w):
#             self._heatmap_acc = np.zeros((h, w), dtype=np.float32)
#         self._heatmap_acc *= 0.93
#         for cx, cy in centers:
#             if 0 <= cy < h and 0 <= cx < w:
#                 cv2.circle(self._heatmap_acc, (cx, cy), 35, 1.0, -1)

#     def _render_heatmap(self, frame):
#         if self._heatmap_acc is None:
#             return frame
#         norm = cv2.normalize(self._heatmap_acc, None, 0, 255, cv2.NORM_MINMAX)
#         colored = cv2.applyColorMap(norm.astype(np.uint8), cv2.COLORMAP_JET)
#         return cv2.addWeighted(frame, 0.5, colored, 0.5, 0)

#     @staticmethod
#     def _encode(frame, quality=75) -> str:
#         _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
#         return base64.b64encode(buf).decode("utf-8")


"""
detector.py - YOLOv8 People Detection Engine
Fixed: higher confidence, person-only class, proper frame streaming, resolution crash fix
"""
import cv2, numpy as np, base64, time
from dataclasses import dataclass, field
from typing import Optional
from collections import deque

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

@dataclass
class DetectionResult:
    count: int
    density: float
    bounding_boxes: list
    annotated_frame_b64: Optional[str]
    heatmap_b64: Optional[str]
    flow_vectors: list
    timestamp: float = field(default_factory=time.time)
    inference_ms: float = 0.0

class CrowdDetector:
    def __init__(self, model_path="yolov8n.pt", confidence=0.25, zone_area_m2=100.0):
        # FIX 4: confidence raised to 0.55 (was 0.4) — reduces false positives heavily
        self.confidence = confidence
        self.zone_area_m2 = zone_area_m2
        self.model = None
        self._prev_gray = None
        self._prev_points = None
        self._heatmap_acc = None
        self._count_history = deque(maxlen=30)

        if YOLO_AVAILABLE:
            try:
                self.model = YOLO(model_path)
                # Warm up model
                dummy = np.zeros((640, 640, 3), dtype=np.uint8)
                self.model(dummy, classes=[0], conf=self.confidence, verbose=False)
                print(f"[detector] YOLO loaded & warmed up: {model_path}")
            except Exception as e:
                print(f"[detector] Could not load model: {e}")
        else:
            print("[detector] Running MOCK mode")

    def process_frame(self, frame: np.ndarray) -> DetectionResult:
        t0 = time.time()
        if frame is None or frame.size == 0:
            return DetectionResult(0, 0.0, [], None, None, [])
        # Resize for speed while keeping aspect ratio
        h, w = frame.shape[:2]
        if w > 1280:
            scale = 1280 / w
            frame = cv2.resize(frame, (1280, int(h * scale)))

        result = self._yolo_detect(frame) if self.model else self._mock_detect(frame)
        result.inference_ms = round((time.time() - t0) * 1000, 1)
        self._count_history.append(result.count)
        return result

    def process_frame_bytes(self, data: bytes) -> DetectionResult:
        arr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Cannot decode image")
        return self.process_frame(frame)

    def predict_count(self, seconds_ahead=10) -> Optional[int]:
        if len(self._count_history) < 5:
            return None
        h = list(self._count_history)
        coeffs = np.polyfit(range(len(h)), h, 1)
        predicted = int(coeffs[0] * (len(h) + seconds_ahead) + coeffs[1])
        return max(0, predicted)

    def set_zone_area(self, area_m2: float):
        self.zone_area_m2 = max(1.0, area_m2)

    def _yolo_detect(self, frame: np.ndarray) -> DetectionResult:
        # FIX 4: classes=[0] = person ONLY, iou=0.45 reduces duplicate boxes
        results = self.model(
            frame, classes=[0], conf=self.confidence,
            iou=0.45, verbose=False, agnostic_nms=True
        )
        boxes_raw = results[0].boxes
        count = len(boxes_raw) if boxes_raw is not None else 0
        bboxes, centers = [], []

        for box in boxes_raw:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = round(float(box.conf[0]), 2)
            bboxes.append({"x": x1, "y": y1, "w": x2-x1, "h": y2-y1, "conf": conf})
            centers.append(((x1+x2)//2, (y1+y2)//2))

        annotated = results[0].plot()
        self._update_heatmap(frame, centers)
        flow = self._compute_flow(frame)

        return DetectionResult(
            count=count,
            density=round(count / self.zone_area_m2, 3),
            bounding_boxes=bboxes,
            annotated_frame_b64=self._encode(annotated),
            heatmap_b64=self._encode(self._render_heatmap(frame)),
            flow_vectors=flow,
        )

    def _mock_detect(self, frame: np.ndarray) -> DetectionResult:
        # Mock mode: returns 0 people — be honest in demo
        annotated = frame.copy()
        cv2.putText(annotated, "MOCK MODE - Install ultralytics for real detection",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
        return DetectionResult(
            count=0, density=0.0, bounding_boxes=[],
            annotated_frame_b64=self._encode(annotated),
            heatmap_b64=None, flow_vectors=[],
        )

    def _compute_flow(self, frame: np.ndarray) -> list:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 🔥 THE FIX: If the new image has a different resolution than the previous one,
        # reset the tracking history so OpenCV doesn't crash!
        if self._prev_gray is not None and self._prev_gray.shape != gray.shape:
            self._prev_gray = None
            self._prev_points = None

        vectors = []
        if self._prev_gray is not None and self._prev_points is not None and len(self._prev_points) > 0:
            nxt, status, _ = cv2.calcOpticalFlowPyrLK(
                self._prev_gray, gray, self._prev_points, None,
                winSize=(15,15), maxLevel=2,
                criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT, 10, 0.03)
            )
            if nxt is not None:
                for new, old in zip(nxt[status==1], self._prev_points[status==1]):
                    dx, dy = float(new[0]-old[0]), float(new[1]-old[1])
                    if abs(dx)+abs(dy) > 1.5:
                        vectors.append({"dx":round(dx,1),"dy":round(dy,1),"ox":round(float(old[0]),1),"oy":round(float(old[1]),1)})
        corners = cv2.goodFeaturesToTrack(gray, maxCorners=60, qualityLevel=0.3, minDistance=7, blockSize=7)
        self._prev_points = corners
        self._prev_gray = gray
        return vectors[:20]

    def _update_heatmap(self, frame, centers):
        h, w = frame.shape[:2]
        if self._heatmap_acc is None:
            self._heatmap_acc = np.zeros((h, w), dtype=np.float32)
        if self._heatmap_acc.shape != (h, w):
            self._heatmap_acc = np.zeros((h, w), dtype=np.float32)
        self._heatmap_acc *= 0.93
        for cx, cy in centers:
            if 0 <= cy < h and 0 <= cx < w:
                cv2.circle(self._heatmap_acc, (cx, cy), 35, 1.0, -1)

    def _render_heatmap(self, frame):
        if self._heatmap_acc is None:
            return frame
        norm = cv2.normalize(self._heatmap_acc, None, 0, 255, cv2.NORM_MINMAX)
        colored = cv2.applyColorMap(norm.astype(np.uint8), cv2.COLORMAP_JET)
        return cv2.addWeighted(frame, 0.5, colored, 0.5, 0)

    @staticmethod
    def _encode(frame, quality=75) -> str:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return base64.b64encode(buf).decode("utf-8")