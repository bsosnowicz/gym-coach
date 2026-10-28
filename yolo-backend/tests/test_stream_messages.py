import unittest
from pathlib import Path
import sys

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stream_messages import analyze_frame_message


SCENARIOS = {
    "standing": {},
    "squat_bottom": {},
}


class StreamMessagesTest(unittest.TestCase):
    def test_set_scenario_changes_active_scenario(self):
        result, active = analyze_frame_message(
            {"type": "set_scenario", "scenario": "standing"},
            active_scenario=None,
            scenarios=SCENARIOS,
            analyze_base64=lambda image_base64, scenario: {},
        )

        self.assertEqual(result["type"], "scenario_set")
        self.assertEqual(active, "standing")

    def test_unknown_scenario_is_rejected(self):
        with self.assertRaises(HTTPException):
            analyze_frame_message(
                {"type": "set_scenario", "scenario": "unknown_scenario"},
                active_scenario=None,
                scenarios=SCENARIOS,
                analyze_base64=lambda image_base64, scenario: {},
            )

    def test_frame_uses_active_scenario_when_message_has_none(self):
        result, active = analyze_frame_message(
            {
                "type": "frame",
                "frame_id": "f-1",
                "image_base64": "x" * 40,
            },
            active_scenario="squat_bottom",
            scenarios=SCENARIOS,
            analyze_base64=lambda image_base64, scenario: {"scenario": scenario, "detected": True},
        )

        self.assertEqual(result["type"], "analysis")
        self.assertEqual(result["frame_id"], "f-1")
        self.assertEqual(result["scenario"], "squat_bottom")
        self.assertEqual(active, "squat_bottom")


if __name__ == "__main__":
    unittest.main()
