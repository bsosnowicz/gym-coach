// Kiedy głos awatara NAPRAWDĘ staje się słyszalny — wspólne dla obu adapterów.
//
// Druga, niezależna liczba obok "LATENCJA ODPOWIEDZI". Tamta kończy się na
// evencie od dostawcy, ta na realnym dźwięku — różnica między nimi to narzut
// ścieżki audio (WebRTC), którego pierwsza w ogóle nie widzi. Liczona od tego
// samego punktu (cisza użytkownika), więc obie są wprost porównywalne, a przy
// okazji porównywalne między Lite i Full.
//
// Detektor jest jeden na aplikację, bo jedna sesja działa naraz. Stan jest
// prywatny dla modułu: to jedyne miejsce, które tworzy i zwalnia AudioContext.

import { log } from "../ui/log.js";
import { createAudioOnsetDetector } from "../audio-onset.js";

let detector = null;

// Jedno wejście na podmianę i sprzątanie, bo każdy pominięty stop() zostawia
// żywy AudioContext + interval co 20 ms — a wywołań jest czworo (dwa adaptery
// × podłączenie tracka i rozłączenie sesji).
export function resetAvatarOnset(mediaStreamTrack) {
  detector?.stop();
  detector = mediaStreamTrack ? createAudioOnsetDetector(mediaStreamTrack) : null;
}

// onAudible (optional): the Lite adapter builds the turn_latency record from it
// (public/session/turn-latency.js).
export function armAvatarOnset(silenceAt, onAudible = null) {
  detector?.armFor(() => {
    log(`SŁYSZALNA ODPOWIEDŹ: ${Math.round(performance.now() - silenceAt)} ms (od ciszy, pierwszy realny dźwięk)`);
    onAudible?.();
  });
}
