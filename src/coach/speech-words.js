// Short answers recognised in code, without the model, and the speech settings
// for STT (src/engine reads them through coach.speech()).
const { normalizeWords } = require("../engine/words");

// A short yes to the summary; anything longer or with "nie"/"ale" is a correction for the model.
const YES_WORDS = new Set(["tak", "dobrze", "ok", "okej", "okay", "jasne", "pewnie", "ukladaj", "zgadza", "pasuje",
  "dawaj", "lecimy", "super", "swietnie", "mozemy", "prosze", "jasne"]);
// A short no: "nie", "nie trzeba", "zostaw", "zostajemy".
function noIntent(text) {
  const words = normalizeWords(text);
  return words.length > 0 && words.length <= 4
    && (words[0] === "nie" || words.some((word) => word.startsWith("zostaw") || word.startsWith("zostaj")));
}

const READY_WORDS = /^(jestem|gotow\w*|dawaj|start|zaczynam\w*|moge|mozemy)( gotow\w*)?$/;
function yesIntent(text) {
  const words = normalizeWords(text);
  return words.length > 0 && words.length <= 5 && !words.includes("nie") && !words.includes("ale")
    && words.some((word) => YES_WORDS.has(word));
}

// Phrases Whisper invents on silence; they come from subtitle credits in its training data.
const STT_HALLUCINATIONS = [
  /^dziękuj[eę]\s+(za\s+)?ogląda\w*\s*[.!…]*$/i,
  /^napisy\s.{0,40}(amara|społeczno)\S*\s*[.!…]*$/i,
  /^napisy[\s:].{0,20}$/i,
  /^[.…\s]+$/,
];

// Said alone (up to three words) while the avatar talks, these do not cut it
// off: the avatar carries on (isLoneCourtesy in src/engine/words.js).
const COURTESY_WORDS = [
  "dziękuję", "dziękujemy", "dzięki", "bardzo", "ci", "dzień", "dobry", "cześć",
  "mhm", "yhm", "hmm", "hm", "aha", "uhm",
];

module.exports = { yesIntent, noIntent, READY_WORDS, STT_HALLUCINATIONS, COURTESY_WORDS };
