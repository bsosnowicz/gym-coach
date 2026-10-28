const test = require("node:test");
const assert = require("node:assert/strict");
async function load() {
  return import("../public/mic-calibration.js");
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

const round = (value) => Math.round(value * 10000) / 10000;

test("bez sprawdzenia głosu progi są takie jak dotąd", async () => {
  const { sessionThresholds } = await load();
  const quiet = sessionThresholds({ noiseFloor: 0.002 });
  assert.equal(quiet.threshold, 0.015);
  assert.equal(round(quiet.bargeThreshold), 0.027);
  assert.equal(quiet.clamped, false);
  const loud = sessionThresholds({ noiseFloor: 0.02 });
  assert.equal(loud.threshold, 0.05);
  assert.equal(loud.bargeThreshold, 0.07);
  assert.equal(loud.clamped, true);
});

test("zmierzony głos obniża próg między tło a głos, ale nigdy go nie podnosi", async () => {
  const { sessionThresholds } = await load();
  const noiseFloor = 0.002;
  const base = sessionThresholds({ noiseFloor });

  const mat = sessionThresholds({ noiseFloor, voiceLevel: 0.03 });
  assert.ok(mat.threshold < base.threshold, "cichy głos z maty obniża próg");
  assert.ok(mat.threshold <= 0.03 * 0.5, "próg najwyżej połowa głosu");
  assert.ok(mat.threshold >= Math.max(noiseFloor * 1.5, 0.005), "próg nad tłem");
  assert.ok(mat.bargeThreshold <= 0.03 * 0.6 + 1e-9);
  assert.ok(mat.bargeThreshold >= mat.threshold);
  assert.ok(mat.bargeThreshold > mat.threshold * 1.8, "próg przerwania liczony od tła, nie od obniżonego progu");
  const loudVoice = sessionThresholds({ noiseFloor, voiceLevel: 0.3 });
  assert.equal(loudVoice.threshold, base.threshold);
  assert.equal(loudVoice.bargeThreshold, base.bargeThreshold);
});

test("głos ledwo nad tłem daje próg tuż nad tłem", async () => {
  const { sessionThresholds } = await load();
  const weak = sessionThresholds({ noiseFloor: 0.01, voiceLevel: 0.02 });
  assert.equal(round(weak.threshold), 0.015);
  assert.equal(weak.bargeThreshold, weak.threshold);
  const noisy = sessionThresholds({ noiseFloor: 0.04, voiceLevel: 0.06 });
  assert.equal(noisy.threshold, 0.05);
});

test("pasek poziomu jest w decybelach", async () => {
  const { meterPosition, rmsOf } = await load();
  assert.equal(meterPosition(0), 0);
  assert.equal(meterPosition(1), 1);
  assert.equal(meterPosition(0.001), 0);
  assert.equal(round(meterPosition(10 ** (-30 / 20))), 0.5);
  assert.equal(rmsOf([0.5, -0.5, 0.5, -0.5]), 0.5);
  assert.equal(rmsOf([]), 0);
});
function feed(analyzer, segments, tickMs = 50) {
  let at = 0;
  const states = [];
  for (const [level, count] of segments) {
    for (let i = 0; i < count; i += 1) {
      states.push(analyzer.tick(level, at));
      at += tickMs;
    }
  }
  return states;
}

test("sprawdzenie głosu: odliczanie, potem nasłuch i wcześniejszy koniec po zdaniu", async () => {
  const { createVoiceCheckAnalyzer } = await load();
  const analyzer = createVoiceCheckAnalyzer();
  const states = feed(analyzer, [
    [0.002, 30],
    [0.05, 3],
    [0.002, 27],
    [0.002, 10],
    [0.04, 30],
    [0.002, 60],
  ]);
  assert.equal(states[0].phase, "countdown");
  assert.equal(states[59].phase, "countdown");
  assert.equal(states[60].phase, "listen");
  const doneAt = states.findIndex((state) => state.phase === "done");
  assert.ok(doneAt > 100 && doneAt < 60 + 6000 / 50, `koniec po zdaniu (${doneAt})`);
  assert.deepEqual(analyzer.result(), { outcome: "ok", noiseFloor: 0.002, voiceLevel: 0.04 });
});

test("sprawdzenie głosu: cisza, cichy głos i nasłuch do końca okna", async () => {
  const { createVoiceCheckAnalyzer } = await load();

  const silent = createVoiceCheckAnalyzer();
  const silentStates = feed(silent, [[0.001, 60 + 121]]);
  assert.equal(silentStates.at(-1).phase, "done");
  assert.equal(silent.result().outcome, "silent");
  assert.equal(silent.result().voiceLevel, null);
  const click = createVoiceCheckAnalyzer();
  feed(click, [[0.001, 60], [0.2, 4], [0.001, 120]]);
  assert.equal(click.result().outcome, "silent");
  const weak = createVoiceCheckAnalyzer();
  feed(weak, [[0.01, 70], [0.02, 20], [0.01, 40]]);
  assert.equal(weak.result().outcome, "weak");
  const endless = createVoiceCheckAnalyzer();
  const endlessStates = feed(endless, [[0.002, 60], [0.05, 130]]);
  assert.equal(endlessStates.findIndex((state) => state.phase === "done"), 60 + 6000 / 50);
});

test("pamięć sprawdzenia: osobno dla każdego mikrofonu", async () => {
  const { saveVoiceCheck, voiceCheckFor, micKey } = await load();
  const storage = memoryStorage();
  assert.deepEqual(voiceCheckFor("MacBook Pro Microphone (Built-in)", storage), { outcome: "none", voiceLevel: null });

  saveVoiceCheck({ label: "Default - MacBook Pro Microphone (Built-in)", outcome: "ok", voiceLevel: 0.03, noiseFloor: 0.002 }, storage, 1000);
  assert.equal(micKey("Default - MacBook Pro Microphone (Built-in)"), micKey("MacBook Pro Microphone (Built-in)"));
  assert.deepEqual(voiceCheckFor("MacBook Pro Microphone (Built-in)", storage), { outcome: "ok", voiceLevel: 0.03 });
  assert.deepEqual(voiceCheckFor("AirPods Anny", storage), { outcome: "other_mic", voiceLevel: null });
  const stored = JSON.parse(storage.dump()["avatar.voiceCheck"]);
  assert.equal(stored.checkedAt, 1000);
  assert.equal(stored.lastOutcome, "ok");
});

test("pominięcie zapamiętuje decyzję, ale nie kasuje zmierzonych mikrofonów", async () => {
  const { saveVoiceCheck, voiceCheckFor } = await load();
  const storage = memoryStorage();
  saveVoiceCheck({ outcome: "skipped" }, storage);
  assert.deepEqual(voiceCheckFor("iPhone Microphone", storage), { outcome: "skipped", voiceLevel: null });

  saveVoiceCheck({ label: "iPhone Microphone", outcome: "weak", voiceLevel: 0.012, noiseFloor: 0.004 }, storage);
  assert.deepEqual(voiceCheckFor("iPhone Microphone", storage), { outcome: "weak", voiceLevel: 0.012 });
  saveVoiceCheck({ outcome: "skipped" }, storage);
  assert.deepEqual(voiceCheckFor("iPhone Microphone", storage), { outcome: "weak", voiceLevel: 0.012 });
});

test("udany pomiar z ostatnich 30 minut skraca okno przed sesją do jednego kliknięcia", async () => {
  const { saveVoiceCheck, recentVoiceCheck, RECENT_CHECK_MS } = await load();
  const minute = 60 * 1000;
  const storage = memoryStorage();
  assert.equal(recentVoiceCheck(storage, 0), null);

  saveVoiceCheck({ label: "Słuchawki Jabra", outcome: "ok", voiceLevel: 0.03 }, storage, 10 * minute);
  assert.deepEqual(recentVoiceCheck(storage, 22 * minute), { label: "Słuchawki Jabra", outcome: "ok", at: 10 * minute });
  assert.deepEqual(recentVoiceCheck(storage, 10 * minute + RECENT_CHECK_MS)?.label, "Słuchawki Jabra");
  assert.equal(recentVoiceCheck(storage, 10 * minute + RECENT_CHECK_MS + 1), null);
  saveVoiceCheck({ outcome: "skipped" }, storage, 50 * minute);
  assert.equal(recentVoiceCheck(storage, 50 * minute), null);
  saveVoiceCheck({ label: "Mikrofon laptopa", outcome: "weak", voiceLevel: 0.012 }, storage, 60 * minute);
  saveVoiceCheck({ label: "Słuchawki Jabra", outcome: "ok", voiceLevel: 0.03 }, storage, 65 * minute);
  assert.deepEqual(recentVoiceCheck(storage, 70 * minute), { label: "Słuchawki Jabra", outcome: "ok", at: 65 * minute });
});

test("pomiar zapisany przed dodaniem nazwy mikrofonu nadal się liczy", async () => {
  const { recentVoiceCheck } = await load();
  const storage = memoryStorage({
    "avatar.voiceCheck": JSON.stringify({
      checkedAt: 1000,
      lastOutcome: "ok",
      mics: { "macbook pro microphone (built-in)": { outcome: "ok", voiceLevel: 0.03, noiseFloor: 0.002, at: 1000 } },
    }),
  });
  assert.deepEqual(recentVoiceCheck(storage, 2000), { label: "macbook pro microphone (built-in)", outcome: "ok", at: 1000 });
});

test("pamięta najwyżej kilka mikrofonów, najstarsze wypadają", async () => {
  const { saveVoiceCheck, voiceCheckFor } = await load();
  const storage = memoryStorage();
  for (let i = 0; i < 10; i += 1) {
    saveVoiceCheck({ label: `Mikrofon ${i}`, outcome: "ok", voiceLevel: 0.03 + i / 1000 }, storage, i);
  }
  assert.equal(voiceCheckFor("Mikrofon 0", storage).outcome, "other_mic");
  assert.equal(voiceCheckFor("Mikrofon 1", storage).outcome, "other_mic");
  assert.equal(voiceCheckFor("Mikrofon 2", storage).outcome, "ok");
  assert.equal(voiceCheckFor("Mikrofon 9", storage).voiceLevel, 0.039);
});

test("zablokowany localStorage: wynik trzymany w pamięci do przeładowania", async () => {
  const { recentVoiceCheck, saveVoiceCheck, voiceCheckFor } = await load();
  const blocked = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  assert.equal(recentVoiceCheck(blocked, 5000), null);
  assert.equal(saveVoiceCheck({ label: "iPhone Microphone", outcome: "ok", voiceLevel: 0.02 }, blocked, 5000), false);
  assert.equal(recentVoiceCheck(blocked, 5000)?.label, "iPhone Microphone");
  assert.deepEqual(voiceCheckFor("iPhone Microphone", blocked), { outcome: "ok", voiceLevel: 0.02 });
  const storage = memoryStorage();
  saveVoiceCheck({ outcome: "skipped" }, storage);
  assert.equal(recentVoiceCheck(memoryStorage(), 5000), null);
});
