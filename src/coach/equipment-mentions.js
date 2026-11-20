// Where the user trains, as they said it — a check on the equipment the
// model writes in [PLAN …] and [PROFILE …]. The model once wrote
// home_dumbbells after "trenuję na siłowni"; the plan was then built for
// home. When the user's own words name exactly one kind of place, it wins;
// when they name more than one ("siłownia, ale czasem w domu"), the model decides.

const { normalizeWords } = require("../engine/words");

// Normalized words (no Polish letters, lower case); "na siłę" (by force) is no gym.
const KINDS = {
  gym: (words, text) => words.some((word) => /^(silowni\w*|silk\w*|silce|gym\w*|fitness\w*)$/.test(word))
    || /\bklub\w* fitness/.test(text),
  home_dumbbells: (words, text) => /\b(w domu|domow\w*|w mieszkaniu|hantl\w* w domu)\b/.test(text),
  bodyweight: (words, text) => /\b(bez sprzetu|bez niczego|bez obciazenia|masa wlasnego ciala|wlasnym ciezarem ciala)\b/.test(text),
};

// The equipment the user's words point to, or null (none, or more than one kind).
function equipmentFromWords(texts) {
  const words = texts.flatMap((text) => normalizeWords(text));
  const text = words.join(" ");
  const found = Object.keys(KINDS).filter((kind) => KINDS[kind](words, text));
  return found.length === 1 ? found[0] : null;
}

// The user's turns of the session so far.
const userTexts = (history) => history.filter((message) => message.role === "user").map((message) => message.content);

module.exports = { equipmentFromWords, userTexts };
