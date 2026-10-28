// Kolejka "kiedy wypada się odezwać" dla korekt postawy. Czysta logika na
// timestampach (performance.now() od wołającego), bez DOM i bez sieci — ta sama
// granica co w posture-state-machine.js, więc da się to testować bez kamery.
//
// Problem, który rozwiązuje: reguły kątowe (pose-detector.js) potwierdzają
// odchylenie w losowym momencie rozmowy — także w połowie zdania trenera.
// Wysyłanie korekty od razu (dawniej z interrupt:true) ucinało wypowiedź w pół
// słowa: awatar tłumaczył wejście w pozycję i nagle przeskakiwał na "opuść
// biodra". Tutaj korekta czeka na naturalne okno: nikt nie mówi i minęła
// jeszcze krótka pauza oddechowa.
//
// QUIET_AFTER_SPEECH_MS jest celowo dłuższy niż przerwy MIĘDZY zdaniami
// awatara: w Lite mode odpowiedź leci do TTS zdanie po zdaniu, więc w logu
// widać "Awatar skończył mówić" / "Awatar zaczyna mówić" co ~400-500 ms w
// obrębie JEDNEJ wypowiedzi. Krótsza pauza wstrzeliłaby korektę dokładnie w
// taką dziurę, czyli znów w środek wypowiedzi.
//
// Trzymamy TYLKO JEDNĄ oczekującą korektę (nowsze zgłoszenie wypiera starsze):
// mówimy o tym, co widać na kamerze TERAZ, a nie odtwarzamy kolejki zaległych
// uwag — trener, który po minucie wraca do trzech starych uwag naraz, brzmi
// gorzej niż trener, który powie jedną aktualną.
//
// Dwa powody porzucenia korekty bez wygłoszenia:
//   cancel(key) — odchylenie zniknęło, zanim doczekaliśmy okna (użytkownik sam
//     się poprawił); korekta po fakcie brzmi jak nieuwaga trenera,
//   MAX_WAIT_MS — okno nie nadeszło na czas (długi monolog, ciągła rozmowa),
//     więc uwaga jest już nieaktualna.
const QUIET_AFTER_SPEECH_MS = 1200;
const MAX_WAIT_MS = 15000;

export function createCueScheduler({ quietMs = QUIET_AFTER_SPEECH_MS, maxWaitMs = MAX_WAIT_MS } = {}) {
  let pending = null; // { key, payload, requestedAt }
  let lastBusyAt = -Infinity;

  function request(key, payload, now) {
    pending = { key, payload, requestedAt: now };
  }

  // Zwraca porzucone zgłoszenie (do zalogowania) albo null, gdy nic nie czekało
  // pod tym kluczem — wołający nie musi sam pytać, czy jest co anulować.
  function cancel(key) {
    if (!pending || pending.key !== key) return null;
    const dropped = pending;
    pending = null;
    return dropped;
  }

  function reset() {
    pending = null;
  }

  // busy = "ktoś teraz zajmuje głos" (awatar mówi albo użytkownik ma turę).
  // Wołać CO KLATKĘ, nie tylko gdy coś czeka: lastBusyAt musi znać moment
  // zakończenia CUDZEJ wypowiedzi, także tej sprzed zgłoszenia korekty.
  function tick(now, busy) {
    if (busy) lastBusyAt = now;
    if (!pending) return { cue: null, expired: null };
    if (now - pending.requestedAt >= maxWaitMs) {
      const expired = pending;
      pending = null;
      return { cue: null, expired };
    }
    if (busy || now - lastBusyAt < quietMs) return { cue: null, expired: null };
    const cue = pending;
    pending = null;
    // Wydana korekta liczy się jak cudza wypowiedź: awatar zacznie ją mówić
    // dopiero za ~1-2 s (Groq + TTS), więc do tego czasu flaga busy jest
    // jeszcze false. Bez tego druga korekta mogłaby wyjść w tę samą dziurę.
    lastBusyAt = now;
    return { cue, expired: null };
  }

  return { request, cancel, reset, tick };
}
