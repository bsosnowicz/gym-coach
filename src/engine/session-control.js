// A break and the end of a session, asked for by voice or with a button.
// Wraps the app's CoachPort, so every app gets them without touching the turn.
//
// The model only recognises the wish ([PAUSE], [END], [OTHER_CONVERSATION]);
// what is said then is fixed text, with no second model call, so the
// confirmation comes at once even when the model is slow. During a break and
// while the end is being confirmed nothing reaches the model: the answer is
// read from a closed list of words, because conversation in the room must
// neither cost money nor resume the session.

const { emit, record } = require("./session");
const { speakText } = require("./turn");
const { normalizeWords } = require("./words");

const DEFAULT_TEXTS = {
  pause: "Dobrze, robimy przerwę. Powiedz, kiedy chcesz kontynuować.",
  conversationPause: "Słyszę, że rozmawiasz. Zatrzymuję sesję — powiedz „wracam”, kiedy skończysz.",
  // Followed by the last line before the break: it may have been heard only in part.
  resumed: "Dobrze, wracamy.",
  farewell: "Dziękuję za dzisiejszą sesję. Do zobaczenia!",
  prompt: `Znaczniki w nawiasach kwadratowych są poleceniami dla aplikacji. Aplikacja wycina je przed mową, więc nigdy ich nie tłumacz ani nie czytaj.
- Gdy rozmówca prosi o krótką przerwę („zróbmy przerwę”, „daj mi chwilę”, „muszę na chwilę odejść”), cała twoja odpowiedź to [PAUSE], bez żadnych innych słów. Prośba o chwilę do namysłu nad odpowiedzią („chwila, niech pomyślę”) to nie przerwa.
- Gdy rozmówca chce zakończyć dzisiejszą sesję („kończymy”, „muszę już iść”, „na dziś wystarczy”), cała twoja odpowiedź to [END], bez żadnych innych słów. Aplikacja poprosi o potwierdzenie. Kto chce zaraz wrócić, prosi o przerwę, nie o koniec.
- Gdy JASNO widać, że rozmówca mówi nie do ciebie, tylko do kogoś innego (odebrał telefon, rozmawia z osobą w pokoju), cała twoja odpowiedź to [OTHER_CONVERSATION]. Gdy nie masz pewności, odpowiedz normalnie i krótko.`,
};

// Words that bring the session back from a break or from the end window.
const RESUME_WORDS = new Set([
  "kontynuujmy", "kontynuuj", "kontynuujemy", "kontynuowac",
  "wracamy", "wracam", "wrocmy", "wroc", "wracajmy",
  "wznawiamy", "wznow", "wznawiam", "wznawiajmy",
  "dalej", "jedziemy", "lecimy", "zaczynamy", "start", "startujemy",
  "gotowy", "gotowa", "jestem",
  // Echoes of the confirmation ("kiedy chcesz kontynuować"): people answer with what they just heard.
  "dokonczmy", "dokonczymy", "dokonczyc",
  // Whisper sometimes writes "kontynuuj" in English.
  "continue",
]);

// Words around a real request ("no dobra, kontynuujmy"); on their own they do not resume.
const RESUME_FILLER_WORDS = new Set([
  "no", "to", "juz", "ok", "okej", "okay", "dobra", "dobrze", "dobro", "tak",
  "mozemy", "mozna", "i", "wiec", "spoko", "chodzmy",
  "do", "sesji", "sesje", "rozmowy",
  "chce", "chcialbym", "chcialabym", "teraz", "moge", "mozesz",
]);

// Longer utterances are conversation in the room, not an answer to "say when you want to go on".
const RESUME_MAX_WORDS = 5;

// "Kontynuuj" as Whisper writes it from across the room ("Kante noj", "Kontinu
// umi", "Kontenu"), but not words from a conversation about money or work.
const GARBLED_CONTINUE = /^k[ao]nt[aeiouy]/;
const NOT_CONTINUE = /^(?:konto|konta|kontach|kontem|kontakt|kontrol|kontra|kontekst|kontener)/;

// The end window by voice. Negation flips the word: "nie kończymy" goes back, "nie wracam" ends.
const END_FINISH_WORDS = new Set([
  "konczymy", "koncze", "konczmy", "konczyc", "koniec", "zakoncz", "zakonczmy", "zakonczyc", "skonczmy", "skonczyc",
  "zamknij", "zamknijmy", "zamknac", "zamykamy", "zamykam", "wystarczy", "pa", "widzenia",
]);
const END_RESUME_WORDS = new Set([
  "wracam", "wracamy", "wrocmy", "wroc", "wracajmy", "kontynuuj", "kontynuujmy", "kontynuujemy", "kontynuowac",
  "dalej", "zostaje", "zostajemy", "zostanmy",
]);
const END_ANSWER_MAX_WORDS = 20;

// Opening the end window from a break needs a word aimed at the session:
// "kończę obiad" from the room must not do it, and "wystarczy mi przerwy" means going back.
const BREAK_END_WORDS = new Set([
  "koniec", "konczmy", "konczymy", "konczyc",
  "zakonczmy", "zakonczymy", "zakonczyc", "skonczmy", "skonczymy", "skonczyc",
]);

// Every word must be known ("jestem w kuchni" must not resume), and one of them must be more than filler.
function resumeIntent(text) {
  const words = normalizeWords(text);
  if (!words.length || words.length > RESUME_MAX_WORDS) return false;
  if (words.length <= 3 && GARBLED_CONTINUE.test(words[0]) && !NOT_CONTINUE.test(words[0])) return true;
  if (!words.every((word) => RESUME_WORDS.has(word) || RESUME_FILLER_WORDS.has(word))) return false;
  return words.some((word) => RESUME_WORDS.has(word));
}

// A question back is not an answer: "Czy już koniec? Pogubiłam się." must not
// end the session. Sentences starting with "czy" do not count, even without a
// question mark, which Whisper often drops.
function withoutQuestions(text) {
  return String(text || "").split(/(?<=[.!?;])\s*/u).filter((sentence) => !/^czy\b/iu.test(sentence.trim())).join(" ");
}

// Sentence by sentence: a comma also closes a thought, so "Nie, kończymy" is two of them.
function answerClauses(text) {
  return String(text || "").split(/[,.!?;:]+/).map(normalizeWords).filter((clause) => clause.length);
}

// Negation reaches to the end of its clause: "nie chcę jeszcze kończyć".
function negatedAt(words, index) {
  return words.slice(0, index).includes("nie");
}

// "finish" | "resume" | null — the answer to "Na pewno kończymy?".
function endDialogAnswer(text) {
  const clauses = answerClauses(withoutQuestions(text))
    .map((words) => ` ${words.join(" ")} `.replace(/ na pewno /g, " tak ").replace(/ nie wiem /g, " ").split(/\s+/).filter(Boolean))
    .filter((clause) => clause.length);
  if (!clauses.length || clauses.flat().length > END_ANSWER_MAX_WORDS) return null;
  const found = new Set();
  let yes = false;
  let no = false;
  for (const clause of clauses) {
    clause.forEach((word, index) => {
      const negated = negatedAt(clause, index);
      if (END_FINISH_WORDS.has(word)) found.add(negated ? "resume" : "finish");
      else if (END_RESUME_WORDS.has(word)) found.add(negated ? "finish" : "resume");
      else if (word === "tak") yes = true;
      else if (word === "nie") no = true;
    });
  }
  if (found.size) return found.size === 1 ? [...found][0] : null;
  // A bare "tak" / "nie" answers the question "Na pewno kończymy?".
  return yes !== no ? (yes ? "finish" : "resume") : null;
}

// "Kończymy" said during a break opens the end window; "nie kończmy" does not.
function breakEndIntent(text) {
  const clauses = answerClauses(withoutQuestions(text));
  return clauses.some((clause) => clause.some((word, index) => BREAK_END_WORDS.has(word) && !negatedAt(clause, index)));
}

function withSessionControl(coach, { texts = {} } = {}) {
  const TEXTS = { ...DEFAULT_TEXTS, ...texts };

  function stateOf(session) {
    session.control ??= {
      paused: false,
      pauseReason: null,
      // The break came from a marker: its confirmation is spoken once the reply is over (afterTurn).
      pauseToConfirm: false,
      endPending: false,
      // The goodbye is being said: nothing more reaches the model.
      finishing: false,
      // What is said again when the session goes on.
      interruptedLine: null,
    };
    return session.control;
  }

  const lastLine = (session) => session.history.findLast((message) => message.role === "assistant")?.content || null;

  function notifyHook(session, name) {
    try {
      coach[name]?.(session);
    } catch (error) {
      record(session, "control.hook_failed", { hook: name });
      console.warn(`Sesja ${session.id}: coach.${name} — ${error.message}`);
    }
  }

  function confirmPause(session) {
    const text = stateOf(session).pauseReason === "conversation" ? TEXTS.conversationPause : TEXTS.pause;
    return speakText(session, text).catch((error) => console.warn(`Sesja ${session.id}: potwierdzenie przerwy — ${error.message}`));
  }

  // reason: "request" (the user asked) or "conversation" (the user talks to someone else).
  // confirmNow: the button path, where no turn is left to confirm it afterwards.
  function requestPause(session, { reason = "request", source = "voice", confirmNow = false } = {}) {
    if (session.closed || session.handover?.active) return false;
    const state = stateOf(session);
    if (state.paused || state.endPending || state.finishing) return false;
    state.paused = true;
    state.pauseReason = reason;
    state.pauseToConfirm = !confirmNow;
    state.interruptedLine = lastLine(session);
    notifyHook(session, "onPause");
    console.log(`Sesja ${session.id}: przerwa (${reason}, ${source}) — czekam na powrót.`);
    record(session, "control.pause", { reason, source });
    emit(session, { stage: "break_started", reason });
    if (confirmNow) confirmPause(session);
    return true;
  }

  // The page asks the user to confirm; until then nothing is said.
  function requestEnd(session, { source = "voice" } = {}) {
    if (session.closed) return false;
    const state = stateOf(session);
    if (state.endPending || state.finishing) return false;
    const wasPaused = state.paused;
    state.paused = false;
    state.pauseToConfirm = false;
    state.endPending = true;
    state.interruptedLine ??= lastLine(session);
    if (!wasPaused) notifyHook(session, "onPause");
    console.log(`Sesja ${session.id}: prośba o zakończenie (${source}) — czekam na potwierdzenie.`);
    record(session, "control.end_requested", { source });
    emit(session, { stage: "end_requested" });
    return true;
  }

  // Back from a break or from the end window, by voice or with a button.
  // Returns false when the session was not held.
  function continueSession(session, { source = "voice" } = {}) {
    if (session.closed || session.handover?.active) return false;
    const state = stateOf(session);
    if ((!state.paused && !state.endPending) || state.finishing) return false;
    const text = state.interruptedLine ? `${TEXTS.resumed} ${state.interruptedLine}` : TEXTS.resumed;
    state.paused = false;
    state.endPending = false;
    state.pauseToConfirm = false;
    state.interruptedLine = null;
    notifyHook(session, "onResume");
    console.log(`Sesja ${session.id}: powrót (${source}).`);
    record(session, "control.resumed", { source });
    emit(session, { stage: "break_ended" });
    speakText(session, text).catch((error) => console.warn(`Sesja ${session.id}: powrót — ${error.message}`));
    return true;
  }

  // The end is confirmed: the goodbye is said in full, then the page closes the
  // session (closing stops the avatar, which would cut the goodbye off).
  async function farewell(session, { source = "button" } = {}) {
    const state = stateOf(session);
    if (state.finishing) return;
    state.finishing = true;
    state.paused = false;
    state.endPending = false;
    record(session, "control.finished", { source });
    await speakText(session, TEXTS.farewell, { untilSpoken: true });
    emit(session, { stage: "session_finished" });
  }

  function insertPrompt(messages) {
    const at = messages.findIndex((message) => message.role !== "system");
    const index = at === -1 ? messages.length : at;
    return [...messages.slice(0, index), { role: "system", content: TEXTS.prompt }, ...messages.slice(index)];
  }

  return {
    ...coach,
    requestPause,
    requestEnd,
    continueSession,
    farewell,

    buildMessages(session, turn) {
      return insertPrompt(coach.buildMessages(session, turn));
    },

    beforeTurn(session, userText) {
      const state = stateOf(session);
      if (state.finishing) return { handled: true };
      if (state.endPending) {
        const answer = endDialogAnswer(userText);
        if (answer === "resume") continueSession(session);
        else if (answer === "finish") farewell(session, { source: "voice" });
        else console.log(`Sesja ${session.id}: okno zakończenia — wypowiedź bez rozstrzygnięcia („${userText}”).`);
        return { handled: true };
      }
      if (state.paused) {
        if (resumeIntent(userText)) continueSession(session);
        else if (breakEndIntent(userText)) requestEnd(session);
        else console.log(`Sesja ${session.id}: przerwa — wypowiedź pominięta („${userText}”).`);
        return { handled: true };
      }
      return coach.beforeTurn?.(session, userText);
    },

    markers: [
      { pattern: /\[PAUSE\]/g, handle: (session) => requestPause(session) },
      { pattern: /\[OTHER_CONVERSATION\]/g, handle: (session) => requestPause(session, { reason: "conversation" }) },
      { pattern: /\[END\]/g, handle: (session) => requestEnd(session) },
      ...(coach.markers || []),
    ],

    // A reply that only carried a break or end marker is not the app's turn:
    // the user hears the fixed confirmation (a break) or the page's question (the end).
    async afterTurn(session, turn) {
      const state = stateOf(session);
      if (state.pauseToConfirm) {
        state.pauseToConfirm = false;
        confirmPause(session);
        return;
      }
      if (state.paused || state.endPending || state.finishing) return;
      await coach.afterTurn?.(session, turn);
    },
  };
}

module.exports = { withSessionControl, resumeIntent, endDialogAnswer, breakEndIntent, DEFAULT_TEXTS };
