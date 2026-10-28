// The avatar video with its status line. Overlays of the app (the break, an
// exercise counter) go in as children, on top of the video.
// videoRef must stay on a mounted element for the whole session: unmounting
// the stage ends the avatar's stream.
export function AvatarStage({ videoRef, status, audioUnlockText, children }) {
  return (
    <section className="stage">
      <video id="avatar-video" ref={videoRef} autoPlay playsInline />
      <p className="stage-status">{status}</p>
      {children}
      {/* Shown and hidden by public/ui/audio-unlock.js, which the adapter calls. */}
      <button id="audio-unlock-btn" type="button" className="btn audio-unlock" hidden>{audioUnlockText}</button>
    </section>
  );
}
