// "Podłoga rozmowy" — kto teraz zajmuje głos. Wspólne dla Full i Lite, bo tor
// korekty postawy działa w obu trybach: cueScheduler (cue-scheduler.js) pyta o
// to co klatkę, żeby nie wejść trenerowi w słowo.
//
// Stan był wcześniej czterema luźnymi zmiennymi ustawianymi z kilkunastu
// miejsc w dwóch adapterach. Problem nie był estetyczny: każde miejsce musiało
// pamiętać, KTÓRE z nich zmienić razem (start mówienia awatara zeruje też
// turę użytkownika, koniec wypowiedzi czyści jej tekst, ale start już nie).
// Tutaj każde przejście ma nazwę i robi komplet — nie da się ustawić połowy.

// Okno "użytkownik przejął głos, a odpowiedź jeszcze nie zaczęła się mówić" —
// od pierwszego wyniku STT do pierwszego słowa awatara. W tym oknie korekta NIE
// MOŻE wyjść: w Lite mode zajęłaby turę na serwerze (session.turnInFlight), a
// wtedy runLiteTurn odrzuciłby prawdziwą wypowiedź użytkownika ("tura
// zignorowana — poprzednia jeszcze trwa").
//
// Timestamp, nie bool: gdyby odpowiedź nigdy nie nadeszła (błąd sieci,
// porzucona tura), okno wygasa samo zamiast zablokować korekty do końca sesji —
// awaria jednego toru nie może po cichu wyłączyć drugiego.
const USER_TURN_WINDOW_MS = 12000;

// Ile awatar musi już mówić, zanim uznamy wejście użytkownika za świadome
// przerwanie. Bez tego bufora start jego własnego echa w mikrofonie przerywałby
// go w pół pierwszego słowa.
const BARGE_IN_GRACE_MS = 600;

// Ile tura może wisieć BEZ JEDNEGO SŁOWA awatara, zanim uznamy ją za zaciętą i
// pozwolimy użytkownikowi ją zastąpić. Próg jest wyraźnie wyższy od normalnej
// latencji LLM+TTS (~800 ms na Gemini Flash Lite), więc zdrowej tury nie ubije
// kaszlnięcie ani szum — dopiero powtórzenie po sekundach ciszy.
const PENDING_TURN_GRACE_MS = 2500;

// Próg pokrycia słów, powyżej którego usłyszany tekst uznajemy za echo.
const ECHO_WORD_OVERLAP = 0.6;

const words = (text) =>
  text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);

export function createConversationFloor() {
  // Jedna flaga zamiast dwóch (osobno "mówi" i "blokuj echo"): dwa niezależne
  // stany "czy awatar mówi" trzeba by trzymać w zgodzie ręcznie i pierwszy
  // przeoczony event rozjechałby je po cichu.
  let avatarSpeaking = false;
  let avatarStartedAt = 0;
  let avatarUtterance = "";
  let userTurnStartedAt = null;
  // Kiedy wypowiedź poszła na serwer i wciąż czeka na pierwsze słowo awatara.
  // NIE to samo co userTurnStartedAt: tamto liczy się od startu MOWY
  // użytkownika i jest kasowane przy każdej kolejnej wypowiedzi, więc nie da
  // się po nim poznać, że poprzednia tura wisi. To jest jedyny ślad po turze,
  // która nie odpowiedziała.
  let turnPendingAt = null;

  return {
    // Użytkownik zaczął mówić — tura trwa aż do pierwszego słowa awatara.
    userStartedSpeaking() {
      userTurnStartedAt = performance.now();
    },

    // Wypowiedź wysłana na serwer — od teraz czekamy na odpowiedź.
    turnSent() {
      turnPendingAt = performance.now();
    },

    // Tura rozstrzygnięta bez mowy awatara: silnik przejął ją własną ścieżką
    // (przerwa, okno "czy kończymy?"). Nie ma już na co czekać, więc kolejna
    // wypowiedź nie ma czego przerywać.
    turnSettled() {
      turnPendingAt = null;
    },

    // Tura użytkownika domyka się dopiero tutaj, nie na jego ciszy: między
    // ciszą a pierwszym słowem awatara leci jeszcze LLM+TTS i to też nie jest
    // moment na korektę.
    avatarStartedSpeaking() {
      avatarSpeaking = true;
      avatarStartedAt = performance.now();
      userTurnStartedAt = null;
      turnPendingAt = null;
    },

    // Tekst wypowiedzi czyścimy DOPIERO na jej końcu, nie na starcie mówienia.
    // Kolejność avatar_transcription vs avatar_speak_started zależy od dostawcy
    // LLM: Groq strumieniuje token po tokenie, więc transkrypcja dochodzi PO
    // starcie; Gemini oddaje całość jednym chunkiem, więc PRZED (zmierzone:
    // 599 ms vs 1244 ms). Czyszczenie na starcie kasowało tekst potrzebny do
    // wykrycia echa i mikrofon przerywał awatarowi w pół słowa.
    avatarStoppedSpeaking() {
      avatarSpeaking = false;
      avatarUtterance = "";
      turnPendingAt = null;
    },

    // Treść, którą awatar właśnie mówi — jedyne, po czym poznajemy echo.
    setAvatarUtterance(text) {
      avatarUtterance = text || "";
    },

    // Awatar zamilkł nie dlatego, że skończył: przerwanie i błąd pipeline'u
    // zwalniają też turę użytkownika, żeby korekty nie czekały na coś, co już
    // nie nadejdzie.
    reset() {
      avatarSpeaking = false;
      userTurnStartedAt = null;
      turnPendingAt = null;
    },

    isAvatarSpeaking() {
      return avatarSpeaking;
    },

    isBusy() {
      return avatarSpeaking
        || (userTurnStartedAt !== null && performance.now() - userTurnStartedAt < USER_TURN_WINDOW_MS);
    },

    // Bez słuchawek głos awatara leci z głośników z powrotem do mikrofonu — STT
    // potrafi to usłyszeć jako wypowiedź użytkownika, przerwać awatara jego
    // własnymi słowami i wysłać ten (zniekształcony) tekst jako "user turn" do
    // LLM-a, który odpowiada nie na temat. Bufor czasowy łapie tylko START
    // echa; dopóki awatar mówi dalej, mikrofon słyszy resztę tej samej
    // wypowiedzi, więc porównujemy też słowa.
    isEcho(heardText) {
      if (!avatarSpeaking || !avatarUtterance) return false;
      const heardWords = words(heardText);
      if (heardWords.length < 2) return false; // zbyt krótkie, by odróżnić od realnego "stop"/"czekaj"
      const avatarWords = new Set(words(avatarUtterance));
      const overlap = heardWords.filter((word) => avatarWords.has(word)).length;
      return overlap / heardWords.length >= ECHO_WORD_OVERLAP;
    },

    // Czy wolno teraz przerwać awatara. Pytane na SYGNALE VAD (start mowy), nie
    // na gotowym transkrypcie — patrz onSpeechStart w adapters/lite.js.
    //
    // Nie mutuje stanu: podłogę zwalnia zdarzenie "interrupted" z serwera, więc
    // jedno źródło prawdy zostaje po stronie, która faktycznie wie, czy
    // przerwanie doszło. Poprzednia wersja (takeOverFromAvatar) gasiła flagę
    // sama, "w nadziei", i rozjeżdżała się, gdy żądanie nie dotarło.
    // Drugi warunek (tura wisi bez dźwięku) jest tu dlatego, że sam
    // avatarSpeaking zostawiał użytkownika bez wyjścia w oknie "skończyłem
    // mówić, awatar jeszcze nie zaczął". W tym oknie serwer trzyma
    // session.turnInFlight, a runLiteTurn odrzuca KAŻDĄ kolejną wypowiedź
    // ("tura zignorowana — poprzednia jeszcze trwa") po cichu, bez zdarzenia
    // do przeglądarki. Gdy LLM się zaciął (8 s do pierwszego tokenu + jedno
    // ponowienie), to okno trwa kilkanaście sekund — a że awatar wtedy MILCZY,
    // canBargeIn() było fałszem i przerwanie nigdy nie szło. Objaw: mówisz raz
    // za razem i nic nie wraca.
    //
    // /api/lite-interrupt zwalnia blokadę bezwarunkowo (server.js, "pas i
    // szelki"), więc wystarczyło go w tej sytuacji w ogóle zawołać: powtórzenie
    // ZASTĘPUJE zaciętą turę, zamiast wpadać do kosza.
    canBargeIn() {
      if (avatarSpeaking) return performance.now() - avatarStartedAt > BARGE_IN_GRACE_MS;
      return turnPendingAt !== null && performance.now() - turnPendingAt > PENDING_TURN_GRACE_MS;
    },
  };
}
