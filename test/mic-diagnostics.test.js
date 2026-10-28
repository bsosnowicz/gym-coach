const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return import("../public/mic-diagnostics.js");
}

const TICK_MS = 50;
async function calibratedDiagnostics(options = {}) {
  const { createMicDiagnostics } = await load();
  const reports = [];
  const diagnostics = createMicDiagnostics({ onReport: (event) => reports.push(event), ...options });
  diagnostics.calibrated({ noiseFloor: 0.005, threshold: 0.03, clamped: false, deviceChanged: false });
  reports.length = 0;
  let clock = 0;
  const feed = (rms, count, { avatarSpeaking = false, speaking = false } = {}) => {
    for (let i = 0; i < count; i += 1) {
      diagnostics.tick({ rms, threshold: 0.03, bargeThreshold: 0.054, avatarSpeaking, speaking, at: clock });
      clock += TICK_MS;
    }
  };
  return { diagnostics, reports, feed };
}

test("rozpoznaje system i przeglądarkę, także iPada udającego Maca", async () => {
  const { describePlatform } = await load();
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const ipadDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const chromeIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
  const samsung = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
  const androidChrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68";
  const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

  assert.deepEqual(describePlatform(iphone, 5), { os: "ios", browser: "safari" });
  assert.deepEqual(describePlatform(ipadDesktop, 5), { os: "ios", browser: "safari" });
  assert.deepEqual(describePlatform(ipadDesktop, 0), { os: "macos", browser: "safari" });
  assert.deepEqual(describePlatform(chromeIos, 5), { os: "ios", browser: "chrome" });
  assert.deepEqual(describePlatform(samsung, 5), { os: "android", browser: "samsung" });
  assert.deepEqual(describePlatform(androidChrome, 5), { os: "android", browser: "chrome" });
  assert.deepEqual(describePlatform(edge, 0), { os: "windows", browser: "edge" });
  assert.deepEqual(describePlatform(firefox, 0), { os: "windows", browser: "firefox" });
  assert.deepEqual(describePlatform("", 0), { os: "other", browser: "other" });
});

test("rodzaj mikrofonu wynika z nazwy, ale sama nazwa nie wychodzi z przeglądarki", async () => {
  const { describeTrack, inputKind } = await load();
  assert.equal(inputKind("AirPods Anny"), "headset");
  assert.equal(inputKind("Headset Microphone (Jabra EVOLVE 20)"), "headset");
  assert.equal(inputKind("MacBook Pro Microphone"), "builtin");
  assert.equal(inputKind("Microphone Array (Realtek(R) Audio)"), "builtin");
  assert.equal(inputKind("USB PnP Sound Device"), "other");
  assert.equal(inputKind(""), "unknown");

  const track = {
    label: "AirPods Anny",
    getSettings: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: false, sampleRate: 48000 }),
  };
  const described = describeTrack(track, { autoGainControl: true });
  assert.deepEqual(described, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    agcSupported: true,
    sampleRate: 48000,
    inputKind: "headset",
  });
  assert.ok(!JSON.stringify(described).includes("Anny"));
  assert.deepEqual(describeTrack({ label: "", getSettings: () => ({}) }, {}), {
    echoCancellation: null,
    noiseSuppression: null,
    autoGainControl: null,
    agcSupported: false,
    sampleRate: null,
    inputKind: "unknown",
  });
  assert.equal(describeTrack(undefined).inputKind, "unknown");
});

test("kalibracja trafia do raportu razem z platformą i ustawieniami ścieżki", async () => {
  const { createMicDiagnostics } = await load();
  const reports = [];
  const diagnostics = createMicDiagnostics({ onReport: (event) => reports.push(event) });
  diagnostics.calibrated({
    noiseFloor: 0.0212345,
    threshold: 0.05,
    bargeThreshold: 0.07,
    clamped: true,
    deviceChanged: true,
    voiceCheck: "weak",
    voiceLevel: 0.03456,

    platform: { os: "ios", browser: "safari" },
    track: { echoCancellation: true, noiseSuppression: true, autoGainControl: null, agcSupported: false, sampleRate: 48000, inputKind: "builtin" },
  });
  assert.deepEqual(reports, [{
    action: "mic_calibrated",
    noiseFloor: 0.0212,
    threshold: 0.05,
    bargeThreshold: 0.07,
    clamped: true,
    deviceChanged: true,
    voiceCheck: "weak",
    voiceLevel: 0.0346,

    os: "ios",
    browser: "safari",
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: null,
    agcSupported: false,
    sampleRate: 48000,
    inputKind: "builtin",
  }]);
});

test("cisza nie zostawia śladu w logu sesji", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics({ windowMs: 1000 });
  feed(0.004, 100);
  diagnostics.flush();
  assert.deepEqual(reports, []);
});

test("dźwięk pod progiem trwający jak mowa liczy się jako prawie-wypowiedź", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.02, 7);
  feed(0.024, 1);
  feed(0.004, 2);
  feed(0.02, 4);
  feed(0.004, 2);
  diagnostics.flush();

  assert.equal(reports.length, 1);
  const [stats] = reports;
  assert.equal(stats.action, "mic_stats");
  assert.equal(stats.nearMisses, 1);
  assert.equal(stats.nearMissesOverTrainer, 0);
  assert.equal(stats.nearMissPeak, 0.024);
  assert.equal(stats.speechStarts, 0);
  assert.equal(stats.speechRms, null);
  assert.equal(stats.threshold, 0.03);
  assert.equal(stats.bargeThreshold, 0.054);
});

test("krótki spadek między sylabami nie rozcina prawie-wypowiedzi na kawałki", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.02, 4);
  feed(0.004, 1);
  feed(0.02, 4);
  feed(0.004, 2);
  diagnostics.flush();
  assert.equal(reports[0].nearMisses, 1);
});

test("prawie-wypowiedź przy mówiącym awatarze ma osobny licznik", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.045, 10, { avatarSpeaking: true });
  feed(0.004, 2, { avatarSpeaking: true });
  diagnostics.flush();
  assert.equal(reports[0].nearMisses, 0);
  assert.equal(reports[0].nearMissesOverTrainer, 1);
});

test("dźwięk, który przeszedł w wykrytą mowę, nie jest prawie-wypowiedzią", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.02, 6, { avatarSpeaking: true });
  diagnostics.speechStarted({ avatarSpeaking: true });
  feed(0.08, 10, { avatarSpeaking: true, speaking: true });
  feed(0.004, 10, { avatarSpeaking: true, speaking: true });
  diagnostics.utteranceSent();
  diagnostics.flush();

  const [stats] = reports;
  assert.equal(stats.speechStarts, 1);
  assert.equal(stats.speechStartsOverTrainer, 1);
  assert.equal(stats.utterances, 1);
  assert.equal(stats.nearMisses + stats.nearMissesOverTrainer, 0);
  assert.equal(stats.speechRms, 0.08);
  assert.equal(stats.peakRms, 0.08);
});

test("liczy wypowiedzi odrzucone po drodze", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.004, 1);
  diagnostics.speechStarted({ avatarSpeaking: false });
  diagnostics.tooShort();
  diagnostics.speechStarted({ avatarSpeaking: false });
  diagnostics.utteranceSent();
  diagnostics.emptyTranscript();
  diagnostics.speechStarted({ avatarSpeaking: false });
  diagnostics.utteranceSent();
  diagnostics.staleTranscript();
  diagnostics.flush();

  const [stats] = reports;
  assert.equal(stats.speechStarts, 3);
  assert.equal(stats.speechStartsOverTrainer, 0);
  assert.equal(stats.utterances, 2);
  assert.equal(stats.tooShort, 1);
  assert.equal(stats.empty, 1);
  assert.equal(stats.stale, 1);
});

test("raport wychodzi co okno i tylko za okna, w których coś się działo", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics({ windowMs: 1000 });
  feed(0.02, 8);
  feed(0.004, 13);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].nearMisses, 1);
  assert.equal(reports[0].windowS, 1);

  feed(0.004, 20);
  assert.equal(reports.length, 1);

  diagnostics.speechStarted({ avatarSpeaking: false });
  feed(0.06, 4, { speaking: true });
  diagnostics.flush();
  assert.equal(reports.length, 2);
  assert.equal(reports[1].speechStarts, 1);
  assert.equal(reports[1].nearMisses, 0);
  diagnostics.flush();
  assert.equal(reports.length, 2);
});

test("tło w trakcie sesji liczone jest tylko z ciszy — bez mowy użytkownika i awatara", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.004, 60);
  feed(0.04, 40, { avatarSpeaking: true });
  diagnostics.speechStarted({ avatarSpeaking: false });
  feed(0.08, 40, { speaking: true });
  feed(0.02, 9);
  feed(0.004, 20);
  diagnostics.flush();

  const [stats] = reports;
  assert.equal(stats.noiseRms, 0.004);
  assert.equal(stats.quietS, 4);
  assert.equal(stats.noiseShiftDb, -1.9);
  assert.equal(stats.voiceMarginDb, null);
  assert.equal(stats.hintShadow, null);
  assert.ok(stats.adaptiveThreshold > 0);
});

test("wyciszony mikrofon i za mało ciszy nie dają pomiaru tła", async () => {
  const { createMicDiagnostics } = await load();
  const reports = [];
  const diagnostics = createMicDiagnostics({ onReport: (event) => reports.push(event) });
  diagnostics.calibrated({ noiseFloor: 0.005, threshold: 0.03 });
  reports.length = 0;
  let clock = 0;
  for (let i = 0; i < 100; i += 1) {
    diagnostics.tick({ rms: 0, threshold: 0.03, bargeThreshold: 0.054, muted: true, at: clock });
    clock += TICK_MS;
  }
  for (let i = 0; i < 20; i += 1) {
    diagnostics.tick({ rms: 0.004, threshold: 0.03, bargeThreshold: 0.054, at: clock });
    clock += TICK_MS;
  }
  diagnostics.speechStarted({ avatarSpeaking: false });
  diagnostics.flush();
  assert.equal(reports[0].quietS, 1);
  assert.equal(reports[0].noiseRms, null);
  assert.equal(reports[0].noiseShiftDb, null);
  assert.equal(reports[0].adaptiveThreshold, null);
});

test("najcichszy i najgłośniejszy kawałek okna pokazują hałas włączony w trakcie minuty", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics();
  feed(0.004, 100);
  feed(0.03, 100);
  diagnostics.speechStarted({ avatarSpeaking: false });
  diagnostics.flush();
  const [stats] = reports;
  assert.equal(stats.noiseMinRms, 0.004);
  assert.equal(stats.noiseMaxRms, 0.03);
});

test("okno bez aktywności trafia do logu tylko wtedy, gdy tło wyraźnie się zmieniło", async () => {
  const { diagnostics, reports, feed } = await calibratedDiagnostics({ windowMs: 5000 });
  feed(0.005, 101);
  assert.equal(reports.length, 0);
  feed(0.012, 100);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].noiseRms, 0.012);
  assert.equal(reports[0].noiseShiftDb, 7.6);
  assert.equal(reports[0].speechStarts, 0);
  feed(0.012, 100);
  assert.equal(reports.length, 1);
  feed(0.005, 100);
  assert.equal(reports.length, 2);
  assert.equal(reports[1].noiseRms, 0.005);
});

test("niedosłyszane próby mówienia: hałas czy cichy głos rozstrzyga zapas głosu nad tłem", async () => {
  const { createMicDiagnostics } = await load();
  const run = (voiceLevel, noise) => {
    const reports = [];
    const diagnostics = createMicDiagnostics({ onReport: (event) => reports.push(event) });
    diagnostics.calibrated({ noiseFloor: 0.004, threshold: 0.03, voiceLevel });
    let clock = 0;
    const feed = (rms, count) => {
      for (let i = 0; i < count; i += 1) {
        diagnostics.tick({ rms, threshold: 0.03, bargeThreshold: 0.054, at: clock });
        clock += TICK_MS;
      }
    };
    feed(noise, 110);
    for (let i = 0; i < 2; i += 1) {
      feed(0.025, 8);
      feed(noise, 20);
    }
    diagnostics.flush();
    return reports.at(-1);
  };

  const quiet = run(0.06, 0.004);
  assert.equal(quiet.nearMisses, 2);
  assert.equal(quiet.voiceMarginDb, 23.5);
  assert.equal(quiet.hintShadow, "quiet_voice");

  const noisy = run(0.06, 0.012);
  assert.equal(noisy.voiceMarginDb, 14);
  assert.equal(noisy.hintShadow, "quiet_voice");

  const loud = run(0.03, 0.012);
  assert.equal(loud.voiceMarginDb, 8);
  assert.equal(loud.hintShadow, "noisy");
  const unchecked = run(null, 0.012);
  assert.equal(unchecked.voiceMarginDb, null);
  assert.equal(unchecked.hintShadow, "noisy");
});
