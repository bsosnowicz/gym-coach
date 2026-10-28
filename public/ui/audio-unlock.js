// Przeglądarki blokują autoplay DŹWIĘKU niezależnie od wideo (dlatego usta
// się ruszają, a głosu brak) — to dotyka LiveAvatar. Wcześniej jedynym
// sygnałem był wpis w logu + niewidoczny nasłuch na "kliknij gdziekolwiek" —
// łatwo przegapić, stąd "czasem się nie podłącza". Widoczny przycisk jest
// trudniejszy do przeoczenia.

import { log } from "./log.js";

// Looked up on every call: in the React app the button appears only once the
// session screen is mounted, after this module has been imported.
const unlockButton = () => document.getElementById("audio-unlock-btn");

// resumePlayback wstrzykuje adapter, bo odblokowanie dźwięku należy do jego
// pokoju LiveKit (room.startAudio()) — ten moduł odpowiada tylko za przycisk.
export function showAudioUnlock(resumePlayback) {
  const unlockBtn = unlockButton();
  if (!unlockBtn) return;
  unlockBtn.hidden = false;
  unlockBtn.onclick = () => {
    resumePlayback().then(() => {
      log("Dźwięk włączony.");
      unlockBtn.hidden = true;
    });
  };
}

export function hideAudioUnlock() {
  const unlockBtn = unlockButton();
  if (unlockBtn) unlockBtn.hidden = true;
}
