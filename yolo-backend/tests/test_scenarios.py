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
                self.assertTrue(rule.get("correction"), f"{scenario['id']}/{rule['id']}: brak korekty")

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
