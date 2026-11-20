// Texts of the camera module; like session/texts.js, kept apart because the module is optional.
export const CAMERA_TEXTS = {
  title: "Kamera",
  enable: "Włącz kamerę",
  disable: "Wyłącz kamerę",
  defaultDevice: "(domyślna kamera)",
  deviceLabel: "Kamera",
  off: "Kamera wyłączona. Obraz zostaje w przeglądarce, do analizy trafiają tylko pomniejszone klatki.",
  starting: "Włączam kamerę…",
  on: "Kamera włączona.",
  connecting: "Łączę z analizą sylwetki…",
  analysing: "Analiza sylwetki działa.",
  noPerson: "Nie widzę sylwetki w kadrze — odsuń się, żeby było widać całe ciało.",
  postureOk: "Postawa bez uwag.",
  deviation: (label) => `Do poprawy: ${label}.`,
  yoloUnavailable: "Analiza sylwetki niedostępna — widzisz sam podgląd, rozmowa działa normalnie.",
  yoloLost: "Połączenie z analizą sylwetki zerwane — widzisz sam podgląd.",
  failed: (message) => `Kamera: ${message}`,
  view: (view) => (view === "front" ? "Kamera z przodu" : "Kamera z boku"),
  reps: (count) => `powtórzenia: ${count}`,
  angles: ({ name, value = null, min = null, max = null, low, high }) => {
    const deg = (n) => (n === null ? "—" : `${Math.round(n)}°`);
    return `${name}: ${deg(value)} · w serii min ${deg(min)}, max ${deg(max)} · progi: dół < ${low}°, góra > ${high}°`;
  },
};

// The camera test page (#test-kamery): no avatar, no conversation, only the camera and the counter.
export const CAMERA_TEST_TEXTS = {
  title: "Test kamery",
  intro: "Bez awatara i bez rozmowy: wybierz ćwiczenie, włącz kamerę i rób powtórzenia. Licznik działa jak w serii treningu; "
    + "kąt pokazuje, czy progi pasują do Twojego ruchu (dół przysiadu poniżej progu „dół”, stanie powyżej progu „góra”).",
  exercise: "Ćwiczenie",
  option: (item) => `${item.label} (kamera ${item.view === "front" ? "z przodu" : "z boku"})`,
  newSet: "Nowa seria",
  back: "Wróć do treningu",
  noCamera: "Kamera jest wyłączona na serwerze: ustaw YOLO_POSE_WS_URL w .env i uruchom serwer ponownie.",
  loading: "Wczytuję konfigurację…",
  noScenarios: "Serwer nie podał listy ćwiczeń kamery — działa w starszej wersji. Zatrzymaj `npm start` (Ctrl+C), uruchom ponownie i odśwież stronę.",
  link: "Test kamery (bez sesji)",
  log: "Dziennik",
  withCoach: "Test kamery z trenerem",
  startWithCoach: "Start testu",
};
