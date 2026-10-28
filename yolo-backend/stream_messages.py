from __future__ import annotations

from collections.abc import Callable

from fastapi import HTTPException
from pydantic import BaseModel, Field


class AnalyzeFrameMessage(BaseModel):
    type: str = "frame"
    frame_id: str | int | None = None
    image_base64: str = Field(..., min_length=32)
    scenario: str | None = None


class SetScenarioMessage(BaseModel):
    type: str = "set_scenario"
    scenario: str | None = None


def analyze_frame_message(
    payload: dict,
    active_scenario: str | None,
    scenarios: dict,
    analyze_base64: Callable[[str, str | None], dict],
) -> tuple[dict, str | None]:
    message_type = payload.get("type", "frame")
    if message_type == "set_scenario":
        message = SetScenarioMessage.model_validate(payload)
        if message.scenario is not None and message.scenario not in scenarios:
            raise HTTPException(status_code=404, detail=f"Nieznany scenariusz: {message.scenario}")
        return {
            "type": "scenario_set",
            "scenario": message.scenario,
        }, message.scenario

    if message_type != "frame":
        raise HTTPException(status_code=400, detail=f"Nieznany typ wiadomości WebSocket: {message_type}")

    message = AnalyzeFrameMessage.model_validate(payload)
    scenario_id = message.scenario if message.scenario is not None else active_scenario
    result = analyze_base64(message.image_base64, scenario_id)
    result["type"] = "analysis"
    result["frame_id"] = message.frame_id
    return result, active_scenario
