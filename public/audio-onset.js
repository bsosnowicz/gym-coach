// Kiedy głos awatara NAPRAWDĘ staje się słyszalny.
//
// "LATENCJA ODPOWIEDZI" kończy się na evencie avatar_speak_started, czyli na
// komunikacie kontrolnym z backendu dostawcy (ws_url w Lite, data channel w
// Full). To pomiar tego, co dostawca RAPORTUJE, a nie tego, co użytkownik
// SŁYSZY — audio idzie osobną drogą (LiveKit/WebRTC) i ma własne opóźnienie,
// w dodatku nieznanego znaku: dostawca może zgłaszać start przed wypuszczeniem
// dźwięku albo po. Ten moduł mierzy drugą stronę tej różnicy, żeby dało się ją
// zobaczyć zamiast zakładać.
//
// Zasada działania jest ta sama co w VAD dla mikrofonu (stt.js): RMS na
// AnalyserNode, tyle że wpięty w zdalny track audio zamiast w lokalny.

const ONSET_RMS_THRESHOLD = 0.01;
const TICK_MS = 20;
// Ile ciszy musi poprzedzić dźwięk, żeby uznać go za POCZĄTEK nowej wypowiedzi.
// Bez tego barge-in psuł by pomiar: uzbrajamy detektor w chwili, gdy user
// skończył mówić, a wtedy awatar często wciąż kończy poprzednie zdanie —
// detektor odpaliłby natychmiast na jego ogonie i pokazał ~0 ms.
const REQUIRED_SILENCE_MS = 200;

export function createAudioOnsetDetector(mediaStreamTrack) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  // Zdalny track owinięty w MediaStream — MediaStreamAudioSourceNode nie
  // przyjmuje samego tracka. Track jest równolegle podpięty do elementu wideo
  // (track.attach w adapterze) i tak ma zostać: w Chrome zdalny track wpięty
  // WYŁĄCZNIE w Web Audio potrafi nie produkować próbek.
  audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack])).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let pending = null; // { onAudible, quietSince }

  const timer = setInterval(() => {
    if (!pending) return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();

    if (rms < ONSET_RMS_THRESHOLD) {
      if (pending.quietSince === null) pending.quietSince = now;
      return;
    }
    if (pending.quietSince === null || now - pending.quietSince < REQUIRED_SILENCE_MS) return;
    const { onAudible } = pending;
    pending = null;
    onAudible();
  }, TICK_MS);

  return {
    // Jednorazowe uzbrojenie: kolejne wywołanie nadpisuje poprzednie, więc
    // tura, która nie doczekała się dźwięku (przerwana, błąd), nie zostawia
    // wiszącego callbacku, który odpaliłby przy następnej wypowiedzi.
    armFor(onAudible) {
      pending = { onAudible, quietSince: null };
    },
    stop() {
      pending = null;
      clearInterval(timer);
      audioContext.close();
    },
  };
}
