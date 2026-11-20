// Guards on the end window ("Chcesz zakończyć?") of the engine's session
// control, wrapped around it like holdPainDuringBreak, so src/engine stays
// as in avatar-template.
//
// 1. In a break the engine takes any "koniec" for the end of the session,
//    so "koniec przerwy" — natural in a gym, and the coach's own words after
//    a rest — opened the end window. Here it means back to training.
// 2. [END] from the model opens the window only when the user's words ask
//    for the end or name an alarm symptom; otherwise the coach says how to
//    end instead (the model sometimes ended after a bare "dzięki" or "ok").

const { normalizeWords } = require("../engine/words");

const BREAK_OVER = /\b(koniec|konczymy|konczmy|skonczmy|zakonczmy|skonczylem\w*|skonczylam\w*) (z )?przerw\w*|\bprzerw\w* (sie )?(skonczon\w*|skonczyl\w*|koniec)\b|\bpo przerwie\b/;

// "koniec" of a set, an exercise or the warm-up is no end of the session.
const NOT_SESSION = "(przerw\\w*|seri\\w*|cwiczen\\w*|rozgrzewk\\w*)";
const END_WORDS = new RegExp([
  `\\b(koniec|konczymy|konczmy|zakonczmy|zakonczyc|skonczmy|skonczymy|konczyc)\\b(?! ${NOT_SESSION})`,
  "\\b(na dzis|na dzisiaj) (wystarczy|starczy|koniec)\\b", "\\b(wystarczy|starczy|dosc) na (dzis|dzisiaj)\\b",
  "\\bmusze (juz )?(isc|leciec|konczyc|spadac)\\b", "\\b(do widzenia|do zobaczenia|na razie)\\b",
].join("|"));
// The symptoms the pain rules end a workout for (src/coach/index.js, PAIN_RULES).
const ALARM = /\b(bol\w* (mnie )?w klatce|w klatce (mnie )?(boli|kluje|sciska|uciska|piecze)|ucisk\w* w klatce|klatk\w* (piersiow\w* )?(mnie )?bol\w*|dusz\w*|nie moge (zlapac )?(oddechu|oddychac)|brak\w* tchu|zawrot\w*|kreci mi sie|slabo mi|mdleje|zemdl\w*|dretw\w*|mrowi\w*)\b/;

const textOf = (text) => normalizeWords(text).join(" ");
const breakOverIntent = (text) => BREAK_OVER.test(textOf(text));
const endAllowed = (text) => { const words = textOf(text); return END_WORDS.test(words) || ALARM.test(words); };

const lastUserText = (session) => [...session.history].reverse().find((message) => message.role === "user")?.content || "";

const END_HINT = "Jeśli chcesz zakończyć trening, powiedz „kończymy”. Jeśli nie, działamy dalej.";

// coach: the coach after withSessionControl (continueSession, requestEnd, markers).
function guardSessionEnd(coach, { engine = require("../engine") } = {}) {
  return {
    ...coach,
    beforeTurn(session, userText) {
      const control = session.control || {};
      if ((control.paused || control.endPending) && !control.finishing && breakOverIntent(userText)) {
        engine.record(session, "control.break_over_words", { text: userText });
        coach.continueSession(session);
        return { handled: true };
      }
      return coach.beforeTurn(session, userText);
    },
    markers: coach.markers.map((marker) => (String(marker.pattern) !== String(/\[END\]/g) ? marker : {
      ...marker,
      handle(session, match) {
        const text = lastUserText(session);
        if (endAllowed(text)) return marker.handle(session, match);
        engine.record(session, "control.end_ignored", { text });
        console.warn(`Sesja ${session.id}: model chciał zakończyć, ale użytkownik nie prosił o koniec („${text}”) — pomijam.`);
        session.endHintAfterTurn = true;
        return undefined;
      },
    })),
    async afterTurn(session, turn) {
      if (session.endHintAfterTurn) {
        session.endHintAfterTurn = false;
        await engine.speakText(session, END_HINT);
        return;
      }
      return coach.afterTurn?.(session, turn);
    },
  };
}

module.exports = { guardSessionEnd, breakOverIntent, endAllowed, END_HINT };
