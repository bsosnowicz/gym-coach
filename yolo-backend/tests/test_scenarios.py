import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pose_rules import Keypoint, evaluate_scenario, load_scenarios


SCENARIOS_DIR = Path(__file__).resolve().parents[1] / "scenarios"


def standing_person(lean=0.0):
    # Front view; lean shifts both shoulders sideways from above the hips.
    coords = {
        "left_shoulder": (0.45 + lean, 0.25),
        "right_shoulder": (0.55 + lean, 0.25),
        "left_hip": (0.45, 0.5),
        "right_hip": (0.55, 0.5),
        "left_ankle": (0.45, 0.9),
        "right_ankle": (0.55, 0.9),
    }
    return [Keypoint(name=name, x=x, y=y, confidence=0.9) for name, (x, y) in coords.items()]


class ScenariosTest(unittest.TestCase):
    def test_scenarios_load_and_include_standing(self):
        scenarios = load_scenarios(SCENARIOS_DIR)

        self.assertIn("standing", scenarios)
        for scenario in scenarios.values():
            for rule in scenario["rules"]:
                # A rule with bounds flags a deviation, which needs words; one without only measures.
                if "min" in rule or "max" in rule:
                    self.assertTrue(rule.get("correction"), f"{scenario['id']}/{rule['id']}: brak korekty")

    def test_exercise_scenarios_say_view_and_rep_angle(self):
        for scenario in load_scenarios(SCENARIOS_DIR).values():
            rep = scenario.get("rep")
            if not rep:
                continue
            name = scenario["id"]
            self.assertIn(scenario.get("view"), ("side", "front"), f"{name}: widok")
            self.assertTrue(scenario.get("patterns") or scenario.get("exercises"), f"{name}: brak ćwiczeń")
            self.assertIn(rep["rule"], [rule["id"] for rule in scenario["rules"]], f"{name}: kąt powtórzenia")
            self.assertIn(rep["start"], ("high", "low"), f"{name}: start")
            self.assertLess(rep["low"], rep["high"], f"{name}: progi")

    def test_squat_measures_knee_angle_standing_and_down(self):
        scenario = load_scenarios(SCENARIOS_DIR)["squat"]
        rep = scenario["rep"]

        def knee_angle(knee_x):
            # Side view: hip and ankle stay put, the knee goes forward as the hips drop.
            keypoints = [
                Keypoint(name="left_hip", x=0.5, y=0.4 if knee_x == 0.5 else 0.6, confidence=0.9),
                Keypoint(name="left_knee", x=knee_x, y=0.6 if knee_x == 0.5 else 0.65, confidence=0.9),
                Keypoint(name="left_ankle", x=0.5, y=0.85, confidence=0.9),
            ]
            result = evaluate_scenario(scenario, keypoints)
            self.assertEqual(result["deviations"], [], "sam pomiar, bez korekty")
            return next(item for item in result["measurements"] if item["id"] == rep["rule"])["value"]

        self.assertGreater(knee_angle(0.5), rep["high"], "stoi")
        self.assertLess(knee_angle(0.7), rep["low"], "w dole")

    def test_standing_accepts_upright_person(self):
        scenario = load_scenarios(SCENARIOS_DIR)["standing"]

        result = evaluate_scenario(scenario, standing_person())

        self.assertTrue(result["is_correct"])
        self.assertEqual(result["deviations"], [])

    def test_standing_flags_leaning_torso(self):
        scenario = load_scenarios(SCENARIOS_DIR)["standing"]

        result = evaluate_scenario(scenario, standing_person(lean=0.12))

        self.assertEqual([item["id"] for item in result["deviations"]], ["shoulders_not_over_hips"])
        self.assertEqual(result["deviations"][0]["correction"], "Stań prosto, barki nad biodrami.")


if __name__ == "__main__":
    unittest.main()
