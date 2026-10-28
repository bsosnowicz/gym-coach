// Kamera użytkownika: lista urządzeń, zgoda, strumień. Z yoga-startup
// (public/posture/camera.js) bez MediaPipe i bez DOM-u przycisków: widok
// (React) sam rysuje przycisk i listę, ten moduł tylko otwiera i zamyka kamerę.
// Co się dzieje z klatkami — yolo-stream.js i correction-loop.js.

// NotReadableError = przeglądarka widzi kamerę (ma zgodę), ale system nie
// pozwolił jej otworzyć — najczęściej trzyma ją inny program albo karta, albo
// przeglądarka próbuje otworzyć zapamiętane, już nieistniejące urządzenie.
export function describeCameraError(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
    return "Brak zgody na kamerę — sprawdź uprawnienia strony w przeglądarce.";
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
    return "Nie znaleziono wybranej kamery — wybierz inną z listy.";
  if (error.name === "NotReadableError" || error.name === "TrackStartError")
    return "Kamera jest zajęta przez inny program albo kartę — zamknij je i spróbuj ponownie.";
  if (error.name === "OverconstrainedError")
    return "Wybrana kamera nie obsługuje żądanych parametrów — wybierz inną z listy.";
  return error.message;
}

// Nazwy kamer są dostępne dopiero po pierwszej zgodzie; wcześniej puste.
export async function listCameras(mediaDevices = navigator.mediaDevices) {
  const devices = await mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Kamera ${index + 1}` }));
}

// videoEl: podgląd; strumień należy do niego, dopóki nie wywołasz stop().
export function createCamera(videoEl, { mediaDevices = navigator.mediaDevices } = {}) {
  let stream = null;

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    videoEl.srcObject = null;
  }

  return {
    // deviceId: "" = domyślna kamera.
    async start(deviceId = "") {
      stop();
      const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: true };
      stream = await mediaDevices.getUserMedia(constraints);
      videoEl.srcObject = stream;
      await videoEl.play();
      return { width: videoEl.videoWidth, height: videoEl.videoHeight };
    },
    stop,
    isRunning: () => stream !== null,
  };
}
