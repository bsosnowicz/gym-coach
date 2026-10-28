// A deviation must last `sustainMs` before it counts, then the same
// scenario/deviation pair gets `cooldownMs` of silence — otherwise the coach
// would correct every frame at the slightest wobble. From yoga-startup
// (createDeviationDebouncer in public/pose-detector.js); the rest of that file
// is the MediaPipe path, which this app does not have.
export function createDeviationDebouncer({ sustainMs = 1000, cooldownMs = 15000, now = () => performance.now() } = {}) {
  const state = new Map();
  return {
    check(key, isActive) {
      const at = now();
      const entry = state.get(key) || { since: null, lastFiredAt: -Infinity };
      if (!isActive) {
        entry.since = null;
        state.set(key, entry);
        return false;
      }
      if (entry.since === null) entry.since = at;
      state.set(key, entry);
      const confirmed = at - entry.since >= sustainMs && at - entry.lastFiredAt >= cooldownMs;
      if (confirmed) entry.lastFiredAt = at;
      return confirmed;
    },
    reset() {
      state.clear();
    },
  };
}
