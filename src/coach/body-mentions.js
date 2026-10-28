// Injuries named in the user's own words, found without the model — the safety
// net yoga-startup had too (painMention): the model may answer "chcę potrenować
// stabilizację na kontuzjowanym lewym kolanie" as a goal and never write
// [PAIN ...], and then nothing is saved and nothing is left out of the plan.
//
// Only clear cases count: an injury word and a body part in one utterance,
// with the side named for sided parts. Anything vaguer stays with the model,
// which can ask.

const { normalizeWords } = require("../engine/words");

// Stems after normalizeWords (lowercase, no diacritics, "ł" → "l").
const INJURY_STEMS = ["bol", "kontuzj", "uraz", "naderw", "zerwan", "skrecon", "skrecil", "zwichn", "operac", "operowan",
  "dyskopat", "przepuklin", "kluj", "kluje", "strzyk", "rehabilit", "stluczon", "zlaman"];
const STRONG_STEMS = ["strasznie", "bardzo", "mocno", "ostro", "ostry", "nie do wytrzymania", "napierdal", "rwie"];
const PAIN_STEMS = ["bol", "kluj", "strzyk", "napierdal", "rwie"];

// [stems, body part without side, sided?]
const PARTS = [
  [["kolan"], "knee", true],
  [["bark", "barku", "ramie", "ramien", "ramion"], "shoulder", true],
  [["lokie", "lokci", "lokc"], "elbow", true],
  [["nadgarst"], "wrist", true],
  [["kostk", "staw skokow"], "ankle", true],
  [["biodr"], "hip", true],
  [["lydk"], "calf", true],
  [["dwuglow", "tyl uda", "tylna czesc uda"], "hamstring", true],
  [["ledzw", "krzyz", "dolny odcinek", "dol plecow", "dolne plecy"], "lower_back", false],
  [["gorny odcinek", "gora plecow", "miedzy lopatk", "lopatk"], "upper_back", false],
  [["szyj", "kark"], "neck", false],
  [["zebr", "zebro"], "ribs", false],
  [["pachwin"], "groin", false],
];

// Words that undo the report: "już nie boli", "nic mnie nie boli".
const NEGATIONS = /\b(nie boli|juz nie|nic mnie|przestal|przestala|przeszlo|wyleczon)/;

// Any word of pain or injury at all, side or part named or not: during a break
// such an utterance is kept for the coach instead of being dropped.
function mentionsInjury(text) {
  const plain = normalizeWords(text).join(" ");
  return INJURY_STEMS.some((stem) => plain.includes(stem)) && !NEGATIONS.test(plain);
}

// [{ part, severity }] for each clearly named injured body part, or [].
function findInjuryMentions(text) {
  const words = normalizeWords(text);
  const plain = words.join(" ");
  if (!INJURY_STEMS.some((stem) => plain.includes(stem)) || NEGATIONS.test(plain)) return [];
  const pain = PAIN_STEMS.some((stem) => plain.includes(stem));
  const severity = STRONG_STEMS.some((stem) => plain.includes(stem)) ? "high" : pain ? "medium" : "low";

  const found = [];
  for (const [stems, part, sided] of PARTS) {
    const at = words.findIndex((word, index) => stems.some((stem) => `${word} ${words[index + 1] || ""}`.startsWith(stem)));
    if (at === -1) continue;
    if (!sided) {
      found.push({ part, severity });
      continue;
    }
    // The side is said next to the part: "lewe kolano", "kolano lewe", "w prawym barku".
    const near = words.slice(Math.max(0, at - 2), at + 3);
    const left = near.some((word) => word.startsWith("lew"));
    const right = near.some((word) => word.startsWith("praw"));
    if (left !== right) found.push({ part: `${part}_${left ? "left" : "right"}`, severity });
  }
  return found;
}

module.exports = { findInjuryMentions, mentionsInjury };
