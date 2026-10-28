// Rozpoznawanie mowy przez serwer (Groq Whisper) zamiast Web Speech API.
// Web Speech istnieje wyłącznie w Chrome i Edge — w Firefoksie nie ma go w
// ogóle, a w Safari/Operze albo nie działa, albo działa cicho i nieprzewidywalnie
// (patrz komentarz przy adapterze Lite w index.html). Cały tryb Lite był przez
// to zamknięty w jednej przeglądarce.
//
// Ten moduł odtwarza w przeglądarce dokładnie te dwa sygnały, które dawało Web
// Speech, a bez których pipeline Lite nie działa:
//   - START MOWY (odpowiednik onspeechstart) — po nim rozpoznajemy, że głos
//     przejął użytkownik,
//   - CISZA (odpowiednik onspeechend) — od niej liczona jest "LATENCJA
//     ODPOWIEDZI", więc musi znaczyć to samo co dotąd, inaczej pomiary
//     przestałyby być porównywalne z adapterem FULL.
// Oba biorą się z VAD na głośności (AnalyserNode), samą transkrypcję robi
// POST /api/stt.

import { apiFetch } from "./api.js";
import { reportIfStuck, waitForRunningAudio } from "./mic-start.js";
import { createMicDiagnostics, describePlatform, describeTrack } from "./mic-diagnostics.js";
import { MAX_RMS_THRESHOLD, MIN_RMS_THRESHOLD, micAudioConstraints, rmsOf, sessionThresholds, voiceCheckFor } from "./mic-calibration.js";

// Ile ciszy kończy wypowiedź. To jest wprost dopłata do latencji — każda
// wypowiedź czeka tyle, zanim w ogóle ruszy transkrypcja — więc jest osobno
// pokazywana w logu ("w tym X ms na wykrycie ciszy") i jest pierwszym
// pokrętłem do kręcenia, gdyby odpowiedzi wydawały się ospałe. Niżej niż
// ~500ms zaczyna ucinać naturalne pauzy w środku zdania.
// Zmierzone na żywo: przy typowej turze ~2900 ms od ciszy do pierwszego dźwięku
// ta jedna stała odpowiada za ~24% budżetu — najwięcej ze wszystkiego, co jest
// pod naszą kontrolą (LiveAvatar to kolejne ~33%, ale tego nie ruszymy).
// Komentarz wyżej ostrzega, że poniżej ~500 ms zaczyna ucinać naturalne pauzy,
// więc 500 to dolna granica do strojenia uchem, nie punkt wyjścia do dalszego
// schodzenia.
export const SILENCE_HOLD_MS = 500;

// Krótsze "wypowiedzi" to zwykle stuknięcie w biurko albo kaszlnięcie.
// Whisper na takim wejściu potrafi skonfabulować całe zdanie (klasyk dla
// polskiego: napisy od społeczności), więc odrzucamy je zanim wyjdą z
// przeglądarki.
//
// 300 ms było ZA WYSOKO i wycinało odpowiedzi, na których stoi cała szybka
// ścieżka. speechMs (niżej) mierzy odstęp między pierwszym a ostatnim GŁOŚNYM
// tickiem, a nie długość słowa: w "tak" progu RMS nie przebijają ani "t", ani
// "k", więc liczy się samo "a" — przy VAD_TICK_MS = 50 ms wychodziło 150-250 ms
// i nagranie szło do kosza. Zmierzone na żywo: pięć kolejnych "tak" pod rząd,
// pięć razy "Zaczynasz mówić..." i ani jednej transkrypcji.
//
// To trafiało dokładnie w ADVANCE_WORDS/STAY_WORDS ("tak", "nie", "ok", "no"),
// czyli w odpowiedzi, dla których zbudowano prefetch. Asymetria kosztów jest tu
// odwrotna, niż zakładał pierwotny próg: zgubione "tak" kosztuje całą turę
// rozmowy, a nadmiarowa halucynacja i tak wpada w filtr po stronie serwera.
const MIN_SPEECH_MS = 150;

const VAD_TICK_MS = 50;

// The speech and barge-in thresholds (noise margin, floor and ceiling, barge-in
// multiplier) live in public/mic-calibration.js: sessionThresholds() computes
// them from the noise measured at start and the voice from the check before Start.

// Ile GŁOŚNYCH ticków pod rząd musi paść, żeby przerwać trenera. Chroni przed
// pojedynczym trzaskiem: stuknięcie w biurko czy klaśnięcie przebija nawet
// podniesiony próg, ale trwa jeden tick. Mowa trwa dłużej.
//
// Dotyczy WYŁĄCZNIE przerywania — zwykły start wypowiedzi (gdy trener milczy)
// leci od pierwszego ticka, żeby nie dokładać opóźnienia tam, gdzie nie trzeba.
const BARGE_IN_TICKS = 3;

// Nasłuch bez mowy nagrywa samą ciszę — bez tego plik rósłby przez całą
// sesję i pierwsza wypowiedź szłaby na serwer razem z minutami tła.
const IDLE_RESTART_MS = 10000;

// Próg głośności zależy od mikrofonu i pomieszczenia, więc zamiast jednej
// sztywnej liczby mierzymy tło zaraz po starcie i stawiamy próg nad nim.
const NOISE_CALIBRATION_MS = 400;

// MEDIANA, nie maksimum. Pierwsza wersja brała z okna kalibracji peak i to był
// błąd, który kładł całe STT: pojedynczy trzask przy uruchamianiu mikrofonu
// podnosił "tło" do 0.21, próg wychodził 0.84 (przy mowie rzędu 0.02-0.15) i
// VAD nie odpalał się już nigdy — aplikacja milczała bez jednego błędu w logu.
// Mediana ignoruje takie pojedyncze skoki z definicji.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// Gdy VAD milczy tak długo, to prawie na pewno próg jest za wysoko. Bez tego
// jedynym objawem jest cisza w logu — dokładnie ten sam tryb awarii, który
// wcześniej miało Web Speech w Operze i który miał tu własny watchdog.
const NO_SPEECH_WARNING_MS = 15000;

// Pierwszy format wspierany przez przeglądarkę wygrywa. Opus (Chrome/Firefox)
// jest kilkukrotnie mniejszy od reszty, mp4/AAC to jedyne, co potrafi Safari.
// Groq /audio/transcriptions przyjmuje wszystkie te kontenery.
const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
];

function pickMimeType() {
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

// onSpeechStart()            — VAD wykrył początek mowy
// onUtterance({text, silenceAt, sttMs}) — gotowy transkrypt jednej wypowiedzi
// onError(error)             — błąd transkrypcji (nasłuch leci dalej)
// onBlocked(reason, {audioState}) / onUnblocked(reason, waitedMs): the start
// hangs longer than MIC_BLOCKED_HINT_MS (public/mic-start.js) — "permission"
// (the permission prompt is unanswered) or "audio" (audio suspended until a gesture).
// onDiagnostics(event): a hearing report for the session recorder (public/mic-diagnostics.js).
export async function createSpeechRecorder({ onSpeechStart, onUtterance, onNoSpeech, onError, onBlocked, onUnblocked, onDiagnostics, log, sessionId = null, inputDeviceId = "" }) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Ta przeglądarka nie wspiera MediaRecorder — nagrywanie mowy niemożliwe.");
  }
  // echoCancellation to pierwsza (sprzętowa/systemowa) linia obrony przed
  // głosem awatara wracającym z głośników do mikrofonu. Druga, tekstowa, to
  // isLikelyEcho w index.html — sam AEC nie wystarcza bez słuchawek.
  //
  // autoGainControl WYŁĄCZONE celowo. AGC podbija wzmocnienie właśnie wtedy,
  // gdy jest cicho, więc mierzone "tło" to nie tło, tylko wzmocniony szum —
  // przy włączonym AGC kalibracja odczytała 0.210 zamiast typowych ~0.005 i
  // ustawiła próg tak wysoko, że mowa nie miała szans go przebić. Poza tym
  // ruchome wzmocnienie sprawia, że próg zmierzony raz na starcie przestaje
  // pasować kilka sekund później. VAD potrzebuje stabilnej skali, nie ładnego
  // poziomu.

  let stream;
  let selectedInputDeviceId = inputDeviceId || "";
  const stuckCallbacks = { onBlocked, onUnblocked };

  // The voice check before Start (voice-check.js) uses the same settings, so it
  // measures the signal the threshold later works on.
  async function openMicStream() {
    const audio = micAudioConstraints(selectedInputDeviceId);
    return reportIfStuck(navigator.mediaDevices.getUserMedia({ audio }), "permission", () => ({}), stuckCallbacks);
  }

  try {
    stream = await openMicStream();
  } catch (error) {
    const wrapped = new Error(
      error?.name === "NotAllowedError"
        ? "Brak dostępu do mikrofonu — sprawdź uprawnienia w przeglądarce i w ustawieniach telefonu."
        : `Nie udało się uruchomić mikrofonu (${error?.name || error?.message || "nieznany błąd"}).`
    );
    wrapped.code = "MIC_ACCESS_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }

  const mimeType = pickMimeType();
  const audioContext = new AudioContext();
  if (audioContext.state !== "running") {
    await reportIfStuck(waitForRunningAudio(audioContext), "audio", () => ({ audioState: audioContext.state }), stuckCallbacks);
  }
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  let sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let stopped = false;
  let active = null; // { rec, chunks, startedAt }
  let speaking = false;
  let speechStartedAt = 0;
  let lastLoudAt = 0;
  let threshold = MIN_RMS_THRESHOLD;
  // The threshold while the avatar speaks: higher, as part of what the mic hears is its echo.
  let bargeThreshold = MIN_RMS_THRESHOLD;
  // Inputs of both thresholds: the noise from the calibration at start (and after
  // a device change) and the voice from the check before Start, for THIS microphone.
  let noiseFloor = 0;
  let voiceCheck = { outcome: "none", voiceLevel: null };
  let recalibratingAfterDeviceChange = false;
  // Czy trener właśnie mówi — ustawiane z adaptera na avatar_speak_started/ended.
  // Steruje progiem i wymogiem ciągłości (patrz stałe barge-in wyżej).
  let avatarSpeaking = false;
  // Licznik głośnych ticków pod rząd i moment PIERWSZEGO z nich. Pierwszy, bo
  // od niego liczy się długość wypowiedzi — gdyby speechStartedAt brał tick
  // N-ty, krótkie "tak" wpadłoby poniżej MIN_SPEECH_MS i przepadło.
  let loudTicks = 0;
  let firstLoudAt = 0;
  // Numer BIEŻĄCEJ wypowiedzi. Rośnie przy każdym starcie mowy i unieważnia
  // transkrypcje poprzednich — patrz transcribe() niżej.
  let speechEpoch = 0;
  let micMuted = false;
  let peakWhileAvatarSpoke = 0;
  // Diagnostics are an extra: a failing report must not stop listening.
  const diagnostics = createMicDiagnostics({
    onReport: (event) => {
      try { onDiagnostics?.(event); } catch (_) { /* see above */ }
    },
  });

  function currentRms() {
    analyser.getFloatTimeDomainData(samples);
    return rmsOf(samples);
  }

  // Nagrywanie leci CIĄGLE, także w ciszy przed wypowiedzią. Start dopiero na
  // sygnale mowy gubiłby pierwszą sylabę: między realnym początkiem słowa a
  // przekroczeniem progu VAD mija jeden tick. Ceną jest cisza na początku
  // pliku, którą Whisper ignoruje.
  function startRecorder() {
    // Nagrywarkę wznawiamy w onstop poprzedniej, a stop() sesji może wypaść
    // dokładnie w tej szczelinie — bez tego wartownika wskrzesilibyśmy
    // nagrywanie na już zamkniętym strumieniu.
    if (stopped) return;
    const chunks = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    rec.start();
    active = { rec, chunks, startedAt: performance.now() };
  }

  // MediaRecorder dosyła ostatnią porcję danych w ondataavailable TUŻ PRZED
  // onstop, więc dopiero w onstop tablica chunks jest kompletna. Każde
  // nagranie ma własną tablicę (nie współdzieloną zmienną), bo nasłuch
  // wznawiamy natychmiast — spóźniony chunk starego nagrania wpadłby inaczej
  // do bufora następnej wypowiedzi.
  function stopRecorder(onBlob) {
    if (!active) return;
    const { rec, chunks } = active;
    active = null;
    rec.onstop = () => onBlob(new Blob(chunks, { type: rec.mimeType || mimeType }));
    rec.stop();
  }

  function stopRecorderSilently() {
    if (!active) return;
    const { rec } = active;
    active = null;
    rec.ondataavailable = null;
    rec.onstop = null;
    try { rec.stop(); } catch (_) {}
  }

  // epoch — numer wypowiedzi, z której pochodzi to nagranie (patrz speechEpoch).
  async function transcribe(blob, silenceAt, epoch) {
    try {
      const res = await apiFetch("/api/stt", {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          ...(sessionId ? { "X-Session-Id": sessionId } : {}),
        },
        body: blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Transkrypt, który wrócił już po rozłączeniu, nie należy do żadnej
      // sesji — ten sam powód, dla którego Web Speech ignorowało wyniki po
      // stop().
      if (stopped) return;
      // NIEAKTUALNA transkrypcja — użytkownik zdążył zacząć mówić coś nowego,
      // zanim ta wróciła z Groq.
      //
      // Bez tego wartownika trener odpowiadał na pytanie sprzed kilku
      // wypowiedzi: transkrypcja trwa ~300 ms, więc szybka seria zdań albo
      // poprawienie się w pół słowa ("a nie, znaczy...") wysyłało na serwer
      // WSZYSTKIE wersje po kolei, a odpowiadał on na tę, która dotarła.
      //
      // Liczy się ostatnia wypowiedź: skoro użytkownik mówi dalej, to właśnie
      // ona jest pytaniem, na które czeka.
      if (epoch !== speechEpoch) {
        diagnostics.staleTranscript();
        log?.("(Pominięto nieaktualną transkrypcję — w międzyczasie zacząłeś mówić co innego.)");
        return;
      }
      const text = (data.text || "").trim();
      if (!text) {
        diagnostics.emptyTranscript();
        onNoSpeech?.();
        return;
      }
      onUtterance({ text, silenceAt, sttMs: Math.round(performance.now() - silenceAt) });
    } catch (e) {
      if (!stopped) onError?.(e);
    }
  }

  const calibrationSamples = [];
  let calibrating = true;
  let calibrationUntil = performance.now() + NOISE_CALIBRATION_MS;
  // Najgłośniejsze, co mikrofon w ogóle zarejestrował — sam w sobie nic nie
  // robi, ale bez niego ostrzeżenie o braku mowy nie mówiłoby, czy mikrofon
  // słyszy za cicho, czy próg jest za wysoko.
  let peakSeen = 0;
  let heardAnySpeech = false;
  let noSpeechWarningAt = 0;

  const vadTimer = setInterval(() => {
    if (stopped) return;
    const rms = currentRms();
    const now = performance.now();
    peakSeen = Math.max(peakSeen, rms);

    if (calibrating) {
      calibrationSamples.push(rms);
      if (now < calibrationUntil) return;
      calibrating = false;
      noiseFloor = median(calibrationSamples);
      const track = stream.getAudioTracks()[0];
      voiceCheck = voiceCheckFor(track?.label);
      const tuned = sessionThresholds({ noiseFloor, voiceLevel: voiceCheck.voiceLevel });
      threshold = tuned.threshold;
      bargeThreshold = tuned.bargeThreshold;
      diagnostics.calibrated({
        noiseFloor,
        threshold,
        bargeThreshold,
        clamped: tuned.clamped,
        deviceChanged: recalibratingAfterDeviceChange,
        voiceCheck: voiceCheck.outcome,
        voiceLevel: voiceCheck.voiceLevel,
        platform: describePlatform(navigator.userAgent, navigator.maxTouchPoints),
        track: describeTrack(track, navigator.mediaDevices?.getSupportedConstraints?.() || {}),
      });
      recalibratingAfterDeviceChange = false;
      noSpeechWarningAt = now + NO_SPEECH_WARNING_MS;
      log?.(
        `Mikrofon aktywny (próg mowy: ${threshold.toFixed(3)}, przy mówiącym awatarze: ${bargeThreshold.toFixed(3)}, ` +
        `tło: ${noiseFloor.toFixed(3)}, ${voiceCheck.voiceLevel ? `głos ze sprawdzenia: ${voiceCheck.voiceLevel.toFixed(3)}` : "bez sprawdzenia głosu"}). Mów!`
      );
      if (tuned.clamped) {
        log?.(`⚠️ Tło jest głośne — próg przycięty do ${MAX_RMS_THRESHOLD}. Mowa powinna być wykrywana, ale hałas też może ją udawać.`);
      }
      startRecorder();
      return;
    }

    // Two thresholds instead of one: see BARGE_IN_SENSITIVITY in mic-calibration.js.
    const activeThreshold = avatarSpeaking ? bargeThreshold : threshold;
    diagnostics.tick({ rms, threshold, bargeThreshold, avatarSpeaking, speaking, muted: micMuted, at: now });
    if (avatarSpeaking && !speaking) peakWhileAvatarSpoke = Math.max(peakWhileAvatarSpoke, rms);
    if (rms >= activeThreshold) {
      if (loudTicks === 0) firstLoudAt = now;
      loudTicks += 1;
      lastLoudAt = now;
      // Przerwanie wymaga ciągłości, zwykły start wypowiedzi nie.
      const ticksNeeded = avatarSpeaking ? BARGE_IN_TICKS : 1;
      if (!speaking && loudTicks >= ticksNeeded) {
        speaking = true;
        heardAnySpeech = true;
        speechStartedAt = firstLoudAt;
        // Nowa wypowiedź unieważnia transkrypcje wszystkich poprzednich.
        speechEpoch += 1;
        diagnostics.speechStarted({ avatarSpeaking });
        onSpeechStart?.();
      }
      return;
    }
    // Cichy tick przerywa serię — ale tylko dopóki nie uznaliśmy mowy za
    // rozpoczętą. Potem o jej końcu decyduje SILENCE_HOLD_MS niżej.
    if (!speaking) loudTicks = 0;

    // Zbyt wysoki próg nie daje żadnego błędu — daje ciszę, a cisza wygląda
    // identycznie jak "user nic nie mówi". Peak w komunikacie rozstrzyga, czy
    // to próg jest za wysoko, czy mikrofon w ogóle nic nie łapie.
    if (!heardAnySpeech && noSpeechWarningAt && now > noSpeechWarningAt) {
      noSpeechWarningAt = 0;
      log?.(
        `⚠️ Przez ${NO_SPEECH_WARNING_MS / 1000}s nie wykryto mowy (próg ${threshold.toFixed(3)}, ` +
        `najgłośniejszy sygnał ${peakSeen.toFixed(3)}). Jeśli mówiłeś — próg jest za wysoki; ` +
        `jeśli peak jest bliski zeru — przeglądarka nie dostaje dźwięku z mikrofonu.`
      );
    }

    if (speaking && now - lastLoudAt >= SILENCE_HOLD_MS) {
      speaking = false;
      loudTicks = 0;
      // Znacznik ciszy to moment, w którym użytkownik NAPRAWDĘ ucichł
      // (lastLoudAt), a nie moment, w którym my to zauważyliśmy. Inaczej
      // "LATENCJA ODPOWIEDZI" zaniżałaby się o całe SILENCE_HOLD_MS i nie
      // dałaby się porównać z adapterem FULL.
      const silenceAt = lastLoudAt;
      const speechMs = lastLoudAt - speechStartedAt;
      // Zapamiętane TERAZ, bo zanim transkrypcja wróci, speechEpoch może już
      // wskazywać kolejną wypowiedź.
      const epochOfUtterance = speechEpoch;
      stopRecorder((blob) => {
        startRecorder();
        // Odrzucenie MUSI być widoczne. Dopóki było nieme, wyglądało dla
        // użytkownika identycznie jak "system mnie nie usłyszał" — i właśnie
        // tak przez długi czas ginęło każde krótkie "tak".
        if (speechMs < MIN_SPEECH_MS) {
          diagnostics.tooShort();
          log?.(`(Pominięto zbyt krótki dźwięk: ${Math.round(speechMs)} ms < ${MIN_SPEECH_MS} ms — stuknięcie albo urwane słowo.)`);
          onNoSpeech?.();
          return;
        }
        diagnostics.utteranceSent();
        transcribe(blob, silenceAt, epochOfUtterance);
      });
      return;
    }

    // Wznowienie w onstop, a nie zaraz po stop(): dwie nagrywarki na tym samym
    // strumieniu naraz to niepotrzebne ryzyko, a dzieje się to i tak w ciszy.
    if (!speaking && active && now - active.startedAt > IDLE_RESTART_MS) {
      stopRecorder(() => startRecorder());
    }
  }, VAD_TICK_MS);

  return {
    stop() {
      // The last, partial diagnostics window, before listening goes away.
      diagnostics.flush();
      stopped = true;
      clearInterval(vadTimer);
      if (active) {
        try { active.rec.stop(); } catch (_) {}
        active = null;
      }
      stream.getTracks().forEach((track) => track.stop());
      audioContext.close();
    },

    // Wyciszenie mikrofonu z UI. `track.enabled = false` to standardowy sposób
    // WebRTC na uciszenie ścieżki BEZ zatrzymywania nagrywania — MediaRecorder
    // i AnalyserNode nadal działają, ale dostają samą ciszę. Dzięki temu VAD
    // nie odpala onSpeechStart w trakcie wyciszenia (rms spada do ~0) i nic nie
    // trafia do transkrypcji, a po odciszeniu wszystko wraca bez ponownej
    // kalibracji progu czy restartu MediaRecordera.
    setMuted(muted) {
      micMuted = Boolean(muted);
      stream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    },

    async setInputDevice(deviceId = "") {
      const nextDeviceId = deviceId || "";
      if (nextDeviceId === selectedInputDeviceId) return;
      const previousDeviceId = selectedInputDeviceId;
      selectedInputDeviceId = nextDeviceId;
      let nextStream;
      try {
        nextStream = await openMicStream();
      } catch (error) {
        selectedInputDeviceId = previousDeviceId;
        throw error;
      }
      if (stopped) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      stopRecorderSilently();
      stream.getTracks().forEach((track) => track.stop());
      stream = nextStream;
      stream.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      speaking = false;
      loudTicks = 0;
      firstLoudAt = 0;
      lastLoudAt = 0;
      threshold = MIN_RMS_THRESHOLD;
      bargeThreshold = MIN_RMS_THRESHOLD;
      recalibratingAfterDeviceChange = true;
      calibrationSamples.length = 0;
      calibrating = true;
      calibrationUntil = performance.now() + NOISE_CALIBRATION_MS;
      peakSeen = 0;
      heardAnySpeech = false;
      noSpeechWarningAt = 0;
      speechEpoch += 1;
      log?.(`Mikrofon zmieniony — kalibruję nowe wejście audio.`);
    },

    // Adapter melduje, czy trener mówi (avatar_speak_started/ended). Od tego
    // zależy, ile trzeba, żeby wejść mu w słowo — patrz stałe barge-in wyżej.
    setAvatarSpeaking(speakingNow) {
      if (avatarSpeaking && !speakingNow && !speaking && peakWhileAvatarSpoke >= threshold) {
        log?.(
          `(Mikrofon słyszał dźwięk w trakcie wypowiedzi awatara, ale za cichy na przerwanie: ` +
          `szczyt ${peakWhileAvatarSpoke.toFixed(3)}, potrzeba ${bargeThreshold.toFixed(3)} ` +
          `przez ${BARGE_IN_TICKS * VAD_TICK_MS} ms.)`
        );
      }
      peakWhileAvatarSpoke = 0;
      avatarSpeaking = Boolean(speakingNow);
    },
  };
}
