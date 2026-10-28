// Word matching for what the user said: lower case, no diacritics, no punctuation.

function normalizeWords(text) {
  return String(text || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

// A bare "Dziękuję." or "Mhm." is mostly Whisper adding words to a breath or
// noise, rarely a courtesy that needs an answer. In yoga-startup it reached the
// model as a normal turn: replies repeating instructions, and once a "Dziękuję"
// taken for goodbye. courtesyWords come from the coach (speech()), per language.
function isLoneCourtesy(text, courtesyWords = []) {
  const words = normalizeWords(text);
  if (!words.length || words.length > 3) return false;
  const known = new Set(courtesyWords.flatMap(normalizeWords));
  return words.every((word) => known.has(word));
}

module.exports = { normalizeWords, isLoneCourtesy };
