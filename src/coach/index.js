const { buildCatalog } = require("./exercises");
const { planWorkout, describePlan, GOALS, EQUIPMENT_PRESETS } = require("./planner");

const SYSTEM_PROMPT = `Jesteś Gym Coachem, trenerem siłowym w aplikacji głosowej z awatarem.
Rozmawiasz po polsku, naturalnie i konkretnie. Odpowiadasz krótko: jedno lub dwa zdania,
bez list, nagłówków, emotikonów i markdownu. Zadajesz najwyżej jedno pytanie naraz.
Na początku poznaj cel treningu, potem doświadczenie użytkownika, dostępny sprzęt
i ile czasu ma na dzisiejszy trening.
Wykorzystuj informacje już podane w historii, zamiast pytać ponownie.
Gdy znasz wszystkie cztery odpowiedzi, a planu jeszcze nie ma, odpowiedz jednym krótkim
zdaniem i dopisz na końcu dokładnie jeden znacznik:
[PLAN goal=<cel> level=<poziom> equipment=<sprzęt> minutes=<liczba minut>]
gdzie cel to strength (siła), muscle (masa mięśniowa), endurance (kondycja, wytrzymałość)
albo general (ogólna sprawność); poziom to beginner, intermediate albo expert;
sprzęt to gym (siłownia), home_dumbbells (dom z hantlami lub kettlebell) albo bodyweight
(bez sprzętu). Planu nie wymyślaj ani nie wymieniaj ćwiczeń: plan ułoży i przeczyta aplikacja.
Nie masz obrazu z kamery ani pomiaru ruchu. Nie twierdź, że widzisz technikę,
liczysz powtórzenia lub oceniasz wykonanie ćwiczenia.
Gdy kamera jest włączona, aplikacja sama wypowiada w Twoim imieniu krótkie uwagi
o postawie, np. "Stań prosto, barki nad biodrami.". Możesz do nich nawiązać,
ale nie dopowiadaj własnej oceny ruchu.
Wiadomość "[EVENT: session_start]" oznacza początek sesji: przedstaw się krótko
jako Gym Coach i zapytaj o cel treningu.`;

// The marker the model writes once the interview is done; values are closed enums.
const PLAN_MARKER = /\[PLAN ([^\]]*)\]/g;
const PLAN_LEVELS = ["beginner", "intermediate", "expert"];

function parsePlanMarker(text) {
  const fields = Object.fromEntries([...text.matchAll(/(\w+)=([\w-]+)/g)].map(([, key, value]) => [key, value]));
  const minutes = Math.round(Number(fields.minutes));
  if (!GOALS.includes(fields.goal) || !PLAN_LEVELS.includes(fields.level) || !EQUIPMENT_PRESETS[fields.equipment]) return null;
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 180) return null;
  return { goal: fields.goal, level: fields.level, equipment: fields.equipment, minutes };
}

// What the model is told about the plan in every turn after it exists.
function planContext(plan) {
  const items = plan.exercises.map((item, index) =>
    `${index + 1}. ${item.name}: ${item.sets} × ${item.reps ? `${item.reps} powt.` : `${item.seconds} s`}, przerwa ${item.restS} s`);
  return `Plan dzisiejszego treningu (ułożony przez aplikację, nie zmieniaj go sam):\nRozgrzewka 5 min\n${items.join("\n")}`;
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

// engine: emit and speakText of src/engine, passed in by server.js; tests pass the same.
function createCoach({ voiceId, language = "pl", catalog = buildCatalog(), engine = require("../engine") }) {
  // The workout as the page shows it; sent on every change and to a page that (re)joins.
  function workoutEvent(session) {
    const { plan } = session.coachState;
    return { stage: "workout", workout: plan ? { plan } : null };
  }
  const publish = (session) => engine.emit(session, workoutEvent(session));

  return {
    createState: () => ({ plan: null, planToAnnounce: false, avoid: [] }),

    speech: () => ({
      voiceId,
      languageCode: null,
      sttLanguage: language,
      sttCandidates: [],
      sttHallucinations: STT_HALLUCINATIONS,
      courtesyWords: COURTESY_WORDS,
    }),

    buildMessages(session, { userText }) {
      const { plan } = session.coachState;
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(plan ? [{ role: "system", content: planContext(plan) }] : []),
        ...session.history,
      ];
      if (userText === null) messages.push({ role: "user", content: "[EVENT: session_start]" });
      return messages;
    },

    markers: [
      {
        pattern: PLAN_MARKER,
        handle(session, [, fields]) {
          const state = session.coachState;
          if (state.plan) return;
          const profile = parsePlanMarker(fields);
          if (!profile) {
            engine.record(session, "workout.plan_rejected", { marker: fields });
            console.warn(`Sesja ${session.id}: znacznik planu bez poprawnych pól („${fields}”).`);
            return;
          }
          state.plan = planWorkout(catalog, profile, { avoid: state.avoid });
          state.planToAnnounce = true;
          engine.record(session, "workout.planned", { profile, exercises: state.plan.exercises.map((item) => item.id) });
          publish(session);
        },
      },
    ],

    // The plan is read out with fixed text right after the reply that carried the marker.
    async afterTurn(session) {
      const state = session.coachState;
      if (!state.planToAnnounce) return;
      state.planToAnnounce = false;
      await engine.speakText(session, describePlan(state.plan));
    },

    workoutEvent,
  };
}

module.exports = { createCoach, parsePlanMarker, SYSTEM_PROMPT };
