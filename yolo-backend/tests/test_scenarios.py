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
            rules = {rule["id"]: rule for rule in scenario["rules"]}
            for gate in rep.get("gates", []):
                self.assertIn(gate, rules, f"{name}: bramka {gate}")
                self.assertTrue(rules[gate].get("correction"), f"{name}: bramka {gate} bez korekty")

    def test_gates_tell_a_push_up_from_a_press_and_a_squat(self):
        scenarios = load_scenarios(SCENARIOS_DIR)

        def pose(**coords):
            return [Keypoint(name=name, x=x, y=y, confidence=0.9) for name, (x, y) in coords.items()]

        # Side view, body level, hands on the floor under the shoulders.
        plank = pose(left_shoulder=(0.3, 0.55), left_elbow=(0.3, 0.65), left_wrist=(0.3, 0.75),
                     left_hip=(0.55, 0.6), left_knee=(0.7, 0.63), left_ankle=(0.85, 0.66))
        # Front view, standing, dumbbells at the shoulders.
        press = pose(left_shoulder=(0.42, 0.3), left_elbow=(0.36, 0.38), left_wrist=(0.37, 0.27),
                     right_shoulder=(0.58, 0.3), right_elbow=(0.64, 0.38), right_wrist=(0.63, 0.27),
                     left_hip=(0.44, 0.6), right_hip=(0.56, 0.6))
        # Side view, standing, arms down.
        standing = pose(left_shoulder=(0.5, 0.3), left_elbow=(0.5, 0.42), left_wrist=(0.5, 0.52),
                        left_hip=(0.5, 0.55), left_knee=(0.5, 0.72), left_ankle=(0.5, 0.9))

        def gates_failed(scenario_id, keypoints):
            scenario = scenarios[scenario_id]
            failed = {item["id"] for item in evaluate_scenario(scenario, keypoints)["deviations"]}
            return sorted(failed & set(scenario["rep"]["gates"]))

        self.assertEqual(gates_failed("pushup", plank), [])
        self.assertEqual(gates_failed("pushup", press), ["not_in_plank"], "wyciskanie to nie pompka")
        self.assertEqual(gates_failed("pushup", standing), ["not_in_plank"])
        self.assertEqual(gates_failed("overhead_press", press), [])
        self.assertEqual(gates_failed("overhead_press", plank), ["wrists_below_shoulders"], "pompka to nie wyciskanie")
        self.assertEqual(gates_failed("overhead_press", standing), ["wrists_below_shoulders"])
        self.assertEqual(gates_failed("squat", standing), [])
        self.assertEqual(gates_failed("squat", plank), ["lying_down"], "pompka to nie przysiad")

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
