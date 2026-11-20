// Guards on the end window (src/coach/end-guard.js): "koniec przerwy" in a
// break goes back to training instead of "Chcesz zakończyć?", and [END] from
// the model opens the window only when the user asked for the end or named
// an alarm symptom.

const test = require("node:test");
const assert = require("node:assert/strict");

const { withSessionControl } = require("../src/engine/session-control");
const { guardSessionEnd, breakOverIntent, endAllowed, END_HINT } = require("../src/coach/end-guard");
const { createCoach } = require("../src/coach");
const { runTurn } = require("../src/engine/turn");
const { endSession } = require("../src/engine/session");
const { fakeLlm, liveSession, tick } = require("./helpers");

test("Słowa: koniec przerwy to powrót; koniec sesji tylko z prośby albo objawu", () => {
  for (const text of ["Koniec przerwy", "Dobra, koniec przerwy, wracamy", "Kończymy przerwę.", "Przerwa się skończyła."]) {
    assert.equal(breakOverIntent(text), true, text);
  }
  for (const text of ["Kończymy na dziś.", "Na dziś wystarczy", "Muszę już iść", "koniec", "Boli mnie w klatce", "Kręci mi się w głowie", "Duszę się"]) {
    assert.equal(endAllowed(text), true, text);
  }
  for (const text of ["Dzięki.", "Ok", "Koniec serii", "To koniec ćwiczenia?", "Klatka mnie pali przy wyciskaniu", "Koniec przerwy"]) {
    assert.equal(endAllowed(text), false, text);
  }
});

async function session(replies) {
  const llm = { streamChat: (args) => fakeLlm(replies.shift() || "OK.").streamChat(args) };
  const coach = guardSessionEnd(withSessionControl(createCoach({ voiceId: "v" })));
  const live = await liveSession({ llm, coach });
  const say = async (text) => { await runTurn(live.session, text); for (let i = 0; i < 12; i += 1) await tick(); };
  const spoken = () => live.events.filter((event) => event.stage === "avatar_transcription").map((event) => event.text);
  const ended = () => live.events.some((event) => event.stage === "end_requested");
  return { ...live, say, spoken, ended };
}

test("Model pisze [END] po „Dzięki” — okna nie ma, trener mówi, jak skończyć", async () => {
  const live = await session(["[END]", "[END]"]);
  await live.say("Dzięki.");
  assert.equal(live.ended(), false);
  assert.equal(live.spoken().at(-1), END_HINT);
  await live.say("Kończymy na dziś.");
  assert.equal(live.ended(), true);
  await endSession(live.session);
});

test("Przerwa w sesji: „koniec przerwy” wraca do treningu zamiast okna zakończenia", async () => {
  const live = await session(["[PAUSE]"]);
  await live.say("Zróbmy przerwę.");
  assert.equal(live.session.control.paused, true);
  await live.say("Dobra, koniec przerwy.");
  assert.equal(live.session.control.paused, false);
  assert.equal(live.ended(), false);
  await live.say("Zróbmy przerwę.");
  await endSession(live.session);
});

test("Odpoczynek między seriami: „koniec przerwy” zaczyna serię, bez modelu", async () => {
  let calls = 0;
  const llm = { streamChat: (args) => { calls += 1; return fakeLlm("[END]").streamChat(args); } };
  const coach = guardSessionEnd(withSessionControl(createCoach({ voiceId: "v" })));
  const live = await liveSession({ llm, coach });
  const state = live.session.coachState;
  const { createWorkoutRunner } = require("../src/coach/workout");
  state.plan = { exercises: [{ id: "Barbell_Squat", name: "przysiad", equipment: "barbell", sets: 3, reps: 10, restS: 120 }] };
  state.runner = createWorkoutRunner(state.plan, { speak: () => {}, publish: () => {} });
  state.runner.advance({});
  state.runner.advance({});
  state.runner.advance({ reps: 10 });
  assert.equal(state.runner.progress.phase, "rest");
  await runTurn(live.session, "Koniec przerwy.");
  for (let i = 0; i < 12; i += 1) await tick();
  assert.equal(state.runner.progress.phase, "set");
  assert.equal(calls, 0);
  state.runner.stop();
  await endSession(live.session);
});
