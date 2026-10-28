from __future__ import annotations

from dataclasses import dataclass
from math import acos, hypot
from pathlib import Path
import json


KEYPOINT_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]

KEYPOINT_INDEX = {name: index for index, name in enumerate(KEYPOINT_NAMES)}

DEFAULT_POSTURE_KEYPOINTS = [
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


@dataclass(frozen=True)
class Keypoint:
    name: str
    x: float
    y: float
    confidence: float


def load_scenarios(directory: Path) -> dict[str, dict]:
    scenarios: dict[str, dict] = {}
    for path in sorted(directory.glob("*.json")):
        with path.open("r", encoding="utf-8") as handle:
            scenario = json.load(handle)
        scenario_id = scenario.get("id")
        if not scenario_id:
            raise ValueError(f"{path.name}: brak pola id")
        if scenario_id != path.stem:
            raise ValueError(f"{path.name}: id musi być równe nazwie pliku")
        scenarios[scenario_id] = scenario
    return scenarios


def keypoint_map(keypoints: list[Keypoint]) -> dict[str, Keypoint]:
    return {point.name: point for point in keypoints}


def required_keypoints_for_scenario(scenario: dict | None) -> list[str]:
    if not scenario:
        return DEFAULT_POSTURE_KEYPOINTS

    required: list[str] = []
    for rule in scenario.get("rules", []):
        for names in rule.get("points", {}).values():
            for name in names:
                if name not in required:
                    required.append(name)
    return required or DEFAULT_POSTURE_KEYPOINTS


def summarize_visibility(
    keypoints: list[Keypoint],
    min_confidence: float,
    required_names: list[str] | None = None,
) -> dict:
    required = required_names or DEFAULT_POSTURE_KEYPOINTS
    points = keypoint_map(keypoints)
    visible = [
        name
        for name in required
        if points.get(name) is not None and points[name].confidence >= min_confidence
    ]
    missing = [name for name in required if name not in visible]
    score = len(visible) / len(required) if required else 0.0
    return {
        "required_keypoints": required,
        "visible_keypoints": visible,
        "missing_keypoints": missing,
        "score": round(score, 4),
        "full_body_visible": len(missing) == 0,
    }


def angle_degrees(a: Keypoint, b: Keypoint, c: Keypoint) -> float | None:
    abx = a.x - b.x
    aby = a.y - b.y
    cbx = c.x - b.x
    cby = c.y - b.y
    mag_ab = hypot(abx, aby)
    mag_cb = hypot(cbx, cby)
    if mag_ab == 0 or mag_cb == 0:
        return None
    cos_value = max(-1.0, min(1.0, (abx * cbx + aby * cby) / (mag_ab * mag_cb)))
    return acos(cos_value) * 180.0 / 3.141592653589793


def choose_side(points: dict[str, Keypoint], rule: dict, min_confidence: float) -> tuple[list[Keypoint], str] | None:
    sides = rule.get("points", {})
    candidates: list[tuple[float, str, list[Keypoint]]] = []
    for side_name in ("left", "right", "any"):
        names = sides.get(side_name)
        if not names:
            continue
        selected = [points.get(name) for name in names]
        if any(point is None or point.confidence < min_confidence for point in selected):
            continue
        candidates.append((sum(point.confidence for point in selected), side_name, selected))
    if not candidates:
        return None
    _, side_name, selected = max(candidates, key=lambda item: item[0])
    return selected, side_name


def measure_rule(rule: dict, selected: list[Keypoint]) -> float | None:
    rule_type = rule["type"]
    if rule_type == "angle":
        if len(selected) != 3:
            raise ValueError(f"Reguła angle wymaga dokładnie 3 punktów: {rule.get('id')}")
        return angle_degrees(selected[0], selected[1], selected[2])
    if rule_type == "horizontal_delta":
        if len(selected) != 2:
            raise ValueError(f"Reguła horizontal_delta wymaga dokładnie 2 punktów: {rule.get('id')}")
        return selected[1].x - selected[0].x
    if rule_type == "vertical_delta":
        if len(selected) != 2:
            raise ValueError(f"Reguła vertical_delta wymaga dokładnie 2 punktów: {rule.get('id')}")
        return selected[1].y - selected[0].y
    raise ValueError(f"Nieznany typ reguły: {rule_type}")


def outside_expected(value: float, rule: dict) -> bool:
    return ("min" in rule and value < rule["min"]) or ("max" in rule and value > rule["max"])


def evaluate_scenario(scenario: dict, keypoints: list[Keypoint], min_confidence: float = 0.35) -> dict:
    points = keypoint_map(keypoints)
    deviations = []
    measured = []
    visibility = summarize_visibility(
        keypoints,
        min_confidence,
        required_keypoints_for_scenario(scenario),
    )

    for rule in scenario.get("rules", []):
        choice = choose_side(points, rule, min_confidence)
        if choice is None:
            measured.append({
                "id": rule["id"],
                "label": rule["label"],
                "visible": False,
                "value": None,
            })
            continue
        selected, side_name = choice
        value = measure_rule(rule, selected)
        if value is None:
            continue
        rounded_value = round(value, 4)
        measurement = {
            "id": rule["id"],
            "label": rule["label"],
            "visible": True,
            "side": side_name,
            "value": rounded_value,
            "expected": {key: rule[key] for key in ("min", "max") if key in rule},
        }
        measured.append(measurement)
        if outside_expected(value, rule):
            deviations.append({
                "id": rule["id"],
                "label": rule["label"],
                "correction": rule.get("correction"),
                "value": rounded_value,
                "expected": measurement["expected"],
            })

    visible_measurements = [item for item in measured if item["visible"]]
    if not visible_measurements:
        score = 0.0
        is_correct = False
    else:
        score = (len(visible_measurements) - len(deviations)) / len(visible_measurements)
        is_correct = len(deviations) == 0 and len(visible_measurements) == len(scenario.get("rules", []))

    return {
        "scenario": scenario["id"],
        "scenario_label": scenario.get("label", scenario["id"]),
        "is_correct": is_correct,
        "score": round(score, 4),
        "visibility": visibility,
        "deviations": deviations,
        "measurements": measured,
    }
