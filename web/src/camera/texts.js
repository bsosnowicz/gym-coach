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
};
