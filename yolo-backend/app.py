from __future__ import annotations

import asyncio
import base64
import os
import threading
from pathlib import Path
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ultralytics import YOLO

from pose_rules import (
    KEYPOINT_NAMES,
    Keypoint,
    evaluate_scenario,
    load_scenarios,
    required_keypoints_for_scenario,
    summarize_visibility,
)
from stream_messages import analyze_frame_message


APP_DIR = Path(__file__).resolve().parent
MODEL_PATH = os.getenv("YOLO_MODEL", "yolov8n-pose.pt")
MODEL_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.35"))
KEYPOINT_CONFIDENCE = float(os.getenv("KEYPOINT_CONFIDENCE", "0.35"))
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

app = FastAPI(title="Gym Coach YOLO Pose Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
model: YOLO | None = None
scenarios = load_scenarios(APP_DIR / "scenarios")
model_lock = threading.Lock()


class AnalyzeJsonRequest(BaseModel):
    image_base64: str = Field(..., min_length=32)
    scenario: str | None = None


@app.on_event("startup")
def load_model() -> None:
    global model
    model = YOLO(MODEL_PATH)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": MODEL_PATH,
        "confidence": MODEL_CONFIDENCE,
        "keypoint_confidence": KEYPOINT_CONFIDENCE,
        "cors_origins": CORS_ORIGINS,
        "scenarios": sorted(scenarios.keys()),
    }


@app.get("/api/scenarios")
def list_scenarios() -> dict:
    return {
        "scenarios": [
            {
                "id": scenario["id"],
                "label": scenario.get("label", scenario["id"]),
                "description": scenario.get("description"),
                "rule_count": len(scenario.get("rules", [])),
            }
            for scenario in scenarios.values()
        ]
    }


def decode_image_bytes(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Nie udało się odczytać obrazu.")
    return image


def decode_base64_image(raw: str) -> np.ndarray:
    if "," in raw and raw.lstrip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return decode_image_bytes(base64.b64decode(raw, validate=True))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Nieprawidłowy image_base64.") from exc


def best_person_from_yolo(image: np.ndarray) -> dict | None:
    if model is None:
        raise HTTPException(status_code=503, detail="Model YOLO nie jest jeszcze gotowy.")

    with model_lock:
        results = model.predict(image, conf=MODEL_CONFIDENCE, verbose=False)
    if not results:
        return None

    result = results[0]
    if result.keypoints is None or result.keypoints.xyn is None:
        return None

    normalized = result.keypoints.xyn.cpu().numpy()
    confidences = result.keypoints.conf.cpu().numpy() if result.keypoints.conf is not None else None
    boxes_conf = result.boxes.conf.cpu().numpy() if result.boxes is not None and result.boxes.conf is not None else None
    if len(normalized) == 0:
        return None

    if boxes_conf is not None and len(boxes_conf) == len(normalized):
        best_index = int(np.argmax(boxes_conf))
        person_confidence = float(boxes_conf[best_index])
    else:
        per_person_conf = confidences.mean(axis=1) if confidences is not None else np.ones(len(normalized))
        best_index = int(np.argmax(per_person_conf))
        person_confidence = float(per_person_conf[best_index])

    keypoints = []
    for index, name in enumerate(KEYPOINT_NAMES):
        x, y = normalized[best_index][index]
        confidence = float(confidences[best_index][index]) if confidences is not None else person_confidence
        keypoints.append(Keypoint(name=name, x=float(x), y=float(y), confidence=confidence))

    return {
        "confidence": round(person_confidence, 4),
        "keypoints": keypoints,
    }


def analyze_image(image: np.ndarray, scenario_id: str | None) -> dict:
    scenario = None
    if scenario_id:
        scenario = scenarios.get(scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail=f"Nieznany scenariusz: {scenario_id}")

    person = best_person_from_yolo(image)
    if person is None:
        return {
            "scenario": scenario_id,
            "detected": False,
            "is_correct": False,
            "score": 0.0,
            "visibility": {
                "required_keypoints": required_keypoints_for_scenario(scenario),
                "visible_keypoints": [],
                "missing_keypoints": required_keypoints_for_scenario(scenario),
                "score": 0.0,
                "full_body_visible": False,
            },
            "deviations": [],
            "measurements": [],
            "person": None,
        }

    response = {
        "scenario": scenario_id,
        "detected": True,
        "person": {
            "confidence": person["confidence"],
            "keypoints": [point.__dict__ for point in person["keypoints"]],
        },
    }

    if scenario_id:
        response.update(evaluate_scenario(scenario, person["keypoints"], min_confidence=KEYPOINT_CONFIDENCE))
    else:
        response.update({
            "is_correct": None,
            "score": None,
            "visibility": summarize_visibility(person["keypoints"], KEYPOINT_CONFIDENCE),
            "deviations": [],
            "measurements": [],
        })
    return response


def analyze_base64_payload(image_base64: str, scenario_id: str | None) -> dict:
    return analyze_image(decode_base64_image(image_base64), scenario_id)


def analyze_websocket_payload(payload: dict, active_scenario: str | None) -> tuple[dict, str | None]:
    return analyze_frame_message(payload, active_scenario, scenarios, analyze_base64_payload)


@app.post("/api/analyze")
async def analyze_multipart(
    image: Annotated[UploadFile, File()],
    scenario: Annotated[str | None, Form()] = None,
) -> dict:
    return analyze_image(decode_image_bytes(await image.read()), scenario)


@app.post("/api/analyze-json")
async def analyze_json(payload: AnalyzeJsonRequest) -> dict:
    return analyze_image(decode_base64_image(payload.image_base64), payload.scenario)


@app.websocket("/ws/analyze")
async def analyze_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    active_scenario = websocket.query_params.get("scenario")
    if active_scenario == "":
        active_scenario = None
    if active_scenario is not None and active_scenario not in scenarios:
        await websocket.send_json({
            "type": "error",
            "error": f"Nieznany scenariusz: {active_scenario}",
        })
        await websocket.close(code=1008)
        return

    await websocket.send_json({
        "type": "ready",
        "scenario": active_scenario,
        "model": MODEL_PATH,
        "scenarios": sorted(scenarios.keys()),
    })

    try:
        while True:
            payload = await websocket.receive_json()
            try:
                result, active_scenario = await asyncio.to_thread(
                    analyze_websocket_payload, payload, active_scenario
                )
                await websocket.send_json(result)
            except HTTPException as exc:
                await websocket.send_json({
                    "type": "error",
                    "frame_id": payload.get("frame_id"),
                    "error": exc.detail,
                })
            except Exception as exc:
                await websocket.send_json({
                    "type": "error",
                    "frame_id": payload.get("frame_id"),
                    "error": str(exc),
                })
    except WebSocketDisconnect:
        return
