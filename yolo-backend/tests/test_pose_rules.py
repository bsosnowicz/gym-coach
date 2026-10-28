import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pose_rules import Keypoint, evaluate_scenario, summarize_visibility


def point(name, x, y, confidence=0.9):
    return Keypoint(name=name, x=x, y=y, confidence=confidence)


class PoseRulesTest(unittest.TestCase):
    def test_angle_rule_detects_deviation(self):
        scenario = {
            "id": "test_pose",
            "rules": [
                {
                    "id": "knee_too_straight",
                    "label": "kolano za proste",
                    "type": "angle",
                    "points": {
                        "left": ["left_hip", "left_knee", "left_ankle"],
                    },
                    "max": 120,
                }
            ],
        }
        keypoints = [
            point("left_hip", 0.5, 0.1),
            point("left_knee", 0.5, 0.5),
            point("left_ankle", 0.5, 0.9),
        ]

        result = evaluate_scenario(scenario, keypoints)

        self.assertFalse(result["is_correct"])
        self.assertEqual(result["deviations"][0]["id"], "knee_too_straight")
        self.assertGreater(result["deviations"][0]["value"], 170)

    def test_missing_keypoint_marks_measurement_invisible(self):
        scenario = {
            "id": "test_pose",
            "rules": [
                {
                    "id": "arms_not_level",
                    "label": "ramiona nierówno",
                    "type": "vertical_delta",
                    "points": {
                        "any": ["left_wrist", "right_wrist"],
                    },
                    "min": -0.05,
                    "max": 0.05,
                }
            ],
        }

        result = evaluate_scenario(scenario, [point("left_wrist", 0.2, 0.4)])

        self.assertFalse(result["is_correct"])
        self.assertEqual(result["score"], 0.0)
        self.assertEqual(result["measurements"][0]["visible"], False)

    def test_visibility_reports_missing_body_keypoints(self):
        result = summarize_visibility(
            [
                point("nose", 0.5, 0.1),
                point("left_eye", 0.48, 0.08),
                point("right_eye", 0.52, 0.08),
                point("left_shoulder", 0.4, 0.3),
            ],
            min_confidence=0.35,
            required_names=["left_shoulder", "right_shoulder", "left_hip", "right_hip"],
        )

        self.assertFalse(result["full_body_visible"])
        self.assertEqual(result["visible_keypoints"], ["left_shoulder"])
        self.assertEqual(result["missing_keypoints"], ["right_shoulder", "left_hip", "right_hip"])
        self.assertEqual(result["score"], 0.25)


if __name__ == "__main__":
    unittest.main()
