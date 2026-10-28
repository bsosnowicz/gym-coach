// Posture corrections from the camera, spoken by the avatar. The browser says
// which deviation of which scenario it saw; the text comes from the scenario
// file of yolo-backend (the "correction" field), never from the browser, so
// the page cannot make the avatar say anything else.
//
// The browser already waits for silence (public/camera/cue-scheduler.js);
// this is the last gate, on the server's own state: a correction is dropped,
// not queued, when the moment has passed — what the camera saw then may no
// longer be true.

const fs = require("fs");
const path = require("path");

const DEFAULT_SCENARIOS_DIR = path.join(__dirname, "..", "..", "yolo-backend", "scenarios");

// scenario id -> deviation id -> correction text. No directory: no corrections.
function loadCorrections(dir = DEFAULT_SCENARIOS_DIR) {
  const corrections = new Map();
  if (!fs.existsSync(dir)) return corrections;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const scenario = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const rules = new Map((scenario.rules || []).filter((rule) => rule.correction).map((rule) => [rule.id, rule.correction]));
    corrections.set(scenario.id, rules);
  }
  return corrections;
}

// Why the avatar may not speak a correction now; null when it may.
function cueBlockedBy(session) {
  if (session.closed) return "closed";
  if (session.handover?.active) return "avatar_handover";
  const control = session.control || {};
  if (control.finishing) return "finishing";
  if (control.endPending) return "end_pending";
  if (control.paused) return "paused";
  if (session.activeTurn) return "turn";
  if (session.avatarSpeaking || session.directSpeechInFlight > 0) return "speaking";
  return null;
}

// speakText: the engine's (src/engine/turn.js), passed in to keep the domain
// free of engine imports beyond what server.js wires.
function createCueSpeaker({ speakText, record = () => {}, corrections = loadCorrections() }) {
  return {
    correctionFor: (scenario, deviation) => corrections.get(scenario)?.get(deviation) || null,

    // { spoken, reason? }: reason says why it was not spoken.
    async speak(session, { scenario, deviation }) {
      const text = this.correctionFor(scenario, deviation);
      if (!text) return { spoken: false, reason: "unknown_deviation" };
      const blocked = cueBlockedBy(session);
      if (blocked) {
        record(session, "camera.cue_dropped", { scenario, deviation, reason: blocked });
        return { spoken: false, reason: blocked };
      }
      record(session, "camera.cue", { scenario, deviation });
      const spoken = await speakText(session, text);
      return spoken ? { spoken: true, text } : { spoken: false, reason: "speech_failed" };
    },
  };
}

module.exports = { loadCorrections, cueBlockedBy, createCueSpeaker };
