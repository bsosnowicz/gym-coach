// The user's camera: devices, permission, stream. From yoga-startup
// (public/posture/camera.js) without MediaPipe and without driving the DOM:
// the React view draws the button and the list, this module only opens and
// closes the camera. Frames go on through yolo-stream.js.

// NotReadableError: the browser has the permission, but the system would not
// open the camera — usually another program or tab holds it, or the browser
// tries a remembered device that no longer exists.
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

// Camera names are known only after the first permission; empty before.
export async function listCameras(mediaDevices = navigator.mediaDevices) {
  const devices = await mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Kamera ${index + 1}` }));
}

// videoEl: the preview; it holds the stream until stop().
export function createCamera(videoEl, { mediaDevices = navigator.mediaDevices } = {}) {
  let stream = null;

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    videoEl.srcObject = null;
  }

  return {
    // deviceId: "" is the default camera.
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
