// Counts reps from one angle YOLO measures in every frame (the scenario's
// "rep": rule, start, low, high). One rep is a way out of the start position
// and back: a squat starts high (standing), goes below `low` and comes back
// above `high`; a press starts low and goes up. The gap between `low` and
// `high` is the hysteresis: an angle hovering around one threshold does not
// count again and again.
//
// Frames where the angle is not visible change nothing. A "rep" faster than
// minRepMs is noise (a jump of the skeleton), not a movement.
//
// gates: rules of the scenario that say the body is in this exercise at all
// (a push-up only with the torso level). A frame where one of them is not
// visible or flags a deviation changes nothing either: the elbow bends the
// same way in an overhead press, and a false rep is worse than a missed one.

export function createRepCounter({ rule, start = "high", low, high, gates = [], minRepMs = 600, now = () => performance.now() }) {
  let count = 0;
  // Whether the movement has reached the far end since the last rep.
  let away = false;
  let lastRepAt = -Infinity;
  const atStart = (value) => (start === "high" ? value >= high : value <= low);
  const atFar = (value) => (start === "high" ? value <= low : value >= high);
  const inPosition = (analysis) => gates.every((id) => analysis.measurements?.find((item) => item.id === id)?.visible
    && !analysis.deviations?.some((deviation) => deviation.id === id));

  return {
    get count() { return count; },

    reset() {
      count = 0;
      away = false;
    },

    // analysis: one YOLO result; true when it completed a rep.
    handle(analysis) {
      const measured = analysis?.measurements?.find((item) => item.id === rule);
      if (!measured?.visible || typeof measured.value !== "number" || !inPosition(analysis)) return false;
      if (atFar(measured.value)) {
        away = true;
        return false;
      }
      if (!away || !atStart(measured.value)) return false;
      away = false;
      const at = now();
      if (at - lastRepAt < minRepMs) return false;
      lastRepAt = at;
      count += 1;
      return true;
    },
  };
}
