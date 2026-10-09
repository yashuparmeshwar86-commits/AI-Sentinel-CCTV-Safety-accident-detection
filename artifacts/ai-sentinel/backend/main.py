from __future__ import annotations

import importlib.util
import os
import threading
import uuid
from pathlib import Path
from typing import Any

import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


DATA_DIR = Path(os.environ.get("AI_SENTINEL_DATA_DIR", "artifacts/api-server/.data/ai-sentinel")).resolve()
UPLOAD_DIR = (DATA_DIR / "uploads").resolve()
EVIDENCE_DIR = (DATA_DIR / "evidence").resolve()
MODEL_PATH = os.environ.get("YOLO_MODEL_PATH", "yolov8n.pt")
for directory in (UPLOAD_DIR, EVIDENCE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI Sentinel analysis worker", docs_url=None, redoc_url=None)
model_lock = threading.Lock()
loaded_model: Any = None
model_error: str | None = None

ROAD_CLASSES = {0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle"}


class AnalyzeRequest(BaseModel):
    videoPath: str
    confidenceThreshold: float = Field(default=0.35, ge=0.1, le=0.95)
    suspiciousThreshold: int = Field(default=3, ge=2, le=12)


def get_model() -> Any:
    global loaded_model, model_error
    if loaded_model is not None:
        return loaded_model
    if model_error is not None:
        raise RuntimeError(model_error)
    if importlib.util.find_spec("ultralytics") is None:
        model_error = (
            "Ultralytics is not installed in this runtime. Install the Python "
            "Ultralytics package and restart the API service to enable YOLO inference."
        )
        raise RuntimeError(model_error)
    try:
        from ultralytics import YOLO

        loaded_model = YOLO(MODEL_PATH)
        return loaded_model
    except Exception as exc:
        model_error = (
            f"YOLO could not load model weights from {MODEL_PATH!r}. Check the "
            "YOLO_MODEL_PATH setting and confirm compatible weights are available. "
            f"Details: {type(exc).__name__}: {str(exc)[:240]}"
        )
        raise RuntimeError(model_error) from exc


def box_iou(a: dict[str, Any], b: dict[str, Any]) -> float:
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(1.0, (a["x2"] - a["x1"]) * (a["y2"] - a["y1"]))
    area_b = max(1.0, (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]))
    union = area_a + area_b - intersection
    return intersection / union if union else 0.0


def match_tracks(frames: list[list[dict[str, Any]]]) -> list[list[dict[str, Any]]]:
    tracks: list[list[dict[str, Any]]] = []
    last_by_track: dict[int, dict[str, Any]] = {}
    for frame_index, detections in enumerate(frames):
        unmatched = set(range(len(detections)))
        next_last: dict[int, dict[str, Any]] = {}
        for track_id, previous in last_by_track.items():
            compatible = [
                (box_iou(previous, detections[i]), i)
                for i in unmatched
                if detections[i]["className"] == previous["className"]
            ]
            compatible = [candidate for candidate in compatible if candidate[0] >= 0.03]
            if compatible:
                _, detection_index = max(compatible)
                unmatched.remove(detection_index)
                current = detections[detection_index] | {"frame": frame_index}
                tracks[track_id].append(current)
                next_last[track_id] = current
        for detection_index in unmatched:
            track_id = len(tracks)
            current = detections[detection_index] | {"frame": frame_index}
            tracks.append([current])
            next_last[track_id] = current
        last_by_track = next_last
    return tracks


def find_possible_incidents(
    frames: list[list[dict[str, Any]]],
    frame_files: list[str],
    threshold: int,
) -> list[dict[str, Any]]:
    tracks = match_tracks(frames)
    close_frames: dict[int, int] = {}
    close_pair_frames: list[int] = []
    for frame_index, detections in enumerate(frames):
        vehicles = [d for d in detections if d["className"] in VEHICLE_CLASSES]
        if any(box_iou(vehicles[i], vehicles[j]) >= 0.1
               for i in range(len(vehicles)) for j in range(i + 1, len(vehicles))):
            close_frames[frame_index] = close_frames.get(frame_index, 0) + 1
            close_pair_frames.append(frame_index)

    abrupt_stop_frames: list[int] = []
    for track in tracks:
        if len(track) < 3 or track[0]["className"] not in VEHICLE_CLASSES:
            continue
        centers = [
            ((entry["x1"] + entry["x2"]) / 2, (entry["y1"] + entry["y2"]) / 2)
            for entry in track
        ]
        for i in range(2, len(centers)):
            before = centers[i - 1]
            earlier = centers[i - 2]
            current = centers[i]
            prior_speed = ((before[0] - earlier[0]) ** 2 + (before[1] - earlier[1]) ** 2) ** 0.5
            recent_speed = ((current[0] - before[0]) ** 2 + (current[1] - before[1]) ** 2) ** 0.5
            if prior_speed >= 18 and recent_speed <= prior_speed * 0.3:
                abrupt_stop_frames.append(track[i]["frame"])

    if len(close_pair_frames) < threshold or not abrupt_stop_frames:
        return []
    event_frame = min(abrupt_stop_frames, key=lambda i: abs(i - close_pair_frames[-1]))
    if event_frame >= len(frame_files):
        return []
    signals = [
        f"Vehicle bounding boxes overlapped in {len(close_pair_frames)} sampled frames; this can reflect perspective or detector overlap.",
        "A tracked vehicle showed an abrupt change in apparent frame-to-frame movement.",
        "Close interaction and movement-change signals occurred in the same video analysis.",
    ]
    severity = "high" if len(close_pair_frames) >= threshold * 2 else "medium"
    return [{
        "frame": event_frame,
        "evidenceFile": frame_files[event_frame],
        "signals": signals,
        "severity": severity,
    }]


@app.get("/health")
def health() -> dict[str, Any]:
    available = importlib.util.find_spec("ultralytics") is not None
    return {
        "status": "ok",
        "opencvAvailable": True,
        "ultralyticsAvailable": available,
        "modelAvailable": loaded_model is not None,
        "modelMessage": (
            model_error or "A pretrained YOLO model is loaded and ready."
            if loaded_model is not None
            else (
                "Ultralytics is installed; the configured pretrained weights load on the first analysis request."
                if available
                else "YOLO is unavailable because Ultralytics is not installed. No detections will be fabricated."
            )
        ),
    }


@app.post("/analyze")
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    raw_path = Path(request.videoPath).resolve()
    try:
        raw_path.relative_to(UPLOAD_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Video path is outside the upload storage directory.") from exc
    if not raw_path.is_file() or raw_path.suffix.lower() not in {".mp4", ".avi", ".mov"}:
        raise HTTPException(status_code=400, detail="Unsupported or missing video file.")

    capture = cv2.VideoCapture(str(raw_path))
    if not capture.isOpened():
        capture.release()
        raise HTTPException(status_code=400, detail="OpenCV could not read this video. Check that it is a supported MP4, AVI, or MOV file.")
    fps = capture.get(cv2.CAP_PROP_FPS) or 1.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if frame_count < 1:
        capture.release()
        raise HTTPException(status_code=400, detail="Video contains no readable frames.")
    stride = max(1, (frame_count + 119) // 120)
    session_id = uuid.uuid4().hex
    detections: list[dict[str, Any]] = []
    frame_objects: list[list[dict[str, Any]]] = []
    frame_files: list[str] = []
    frame_number = 0
    sampled_index = 0

    try:
        with model_lock:
            model = get_model()
            while sampled_index < 120:
                ok, frame = capture.read()
                if not ok:
                    break
                if frame_number % stride == 0:
                    result = model.predict(
                        frame,
                        conf=request.confidenceThreshold,
                        classes=list(ROAD_CLASSES),
                        device="cpu",
                        verbose=False,
                    )[0]
                    current: list[dict[str, Any]] = []
                    if result.boxes is not None:
                        for box in result.boxes:
                            class_id = int(box.cls.item())
                            class_name = ROAD_CLASSES.get(class_id)
                            if class_name is None:
                                continue
                            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                            confidence = float(box.conf.item())
                            detection = {
                                "className": class_name,
                                "confidence": round(confidence, 5),
                                "x1": round(x1, 2),
                                "y1": round(y1, 2),
                                "x2": round(x2, 2),
                                "y2": round(y2, 2),
                                "frame": sampled_index,
                            }
                            current.append(detection)
                            color = (70, 195, 160) if class_name != "person" else (90, 175, 245)
                            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                            cv2.putText(
                                frame,
                                f"{class_name} {confidence:.2f}",
                                (int(x1), max(18, int(y1) - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.55,
                                color,
                                2,
                                cv2.LINE_AA,
                            )
                    frame_file = f"processed-{session_id}-{sampled_index:04d}.jpg"
                    if not cv2.imwrite(str(EVIDENCE_DIR / frame_file), frame, [cv2.IMWRITE_JPEG_QUALITY, 84]):
                        raise RuntimeError("Could not save a processed evidence frame.")
                    frame_files.append(frame_file)
                    frame_objects.append(current)
                    detections.extend(current)
                    sampled_index += 1
                frame_number += 1
                if frame_number % stride == 0:
                    continue
            if frame_count > 0 and not frame_files:
                raise HTTPException(status_code=400, detail="No frames could be sampled from this video.")
            possible_incidents = find_possible_incidents(frame_objects, frame_files, request.suspiciousThreshold)
    except RuntimeError as exc:
        return {
            "modelStatus": "unavailable" if importlib.util.find_spec("ultralytics") is None else "error",
            "modelMessage": str(exc),
            "detections": [],
            "frames": [],
            "possibleIncidents": [],
        }
    except HTTPException:
        raise
    except Exception as exc:
        return {
            "modelStatus": "error",
            "modelMessage": f"YOLO video processing failed: {type(exc).__name__}: {str(exc)[:240]}",
            "detections": [],
            "frames": [],
            "possibleIncidents": [],
        }
    finally:
        capture.release()

    return {
        "modelStatus": "available",
        "modelMessage": (
            f"Real pretrained YOLO inference ran on CPU over {len(frame_files)} sampled frames "
            f"(source {fps:.2f} fps). These detections are not an accident classification."
        ),
        "detections": detections[:2000],
        "frames": frame_files,
        "possibleIncidents": possible_incidents,
    }
