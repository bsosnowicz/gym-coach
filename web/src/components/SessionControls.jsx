// Start, break, microphone and Stop for a session from useSession().
// onStart: what Start does, e.g. the voice check first; the session starts at once by default.
export function SessionControls({ session, onStart = () => session.start() }) {
  const { phase, running, micMuted, texts } = session;
  return (
    <div className="controls">
      <button type="button" className="btn btn-primary" disabled={phase !== "idle"} onClick={onStart}>{texts.start}</button>
      <button type="button" className="btn" disabled={!running || session.reconnecting} onClick={session.pause}>{texts.pause}</button>
      <button type="button" className="btn" aria-pressed={micMuted} disabled={!running} onClick={session.toggleMic}>
        {micMuted ? texts.unmute : texts.mute}
      </button>
      <button type="button" className="btn btn-danger" disabled={!running} onClick={session.askEnd}>{texts.stop}</button>
    </div>
  );
}
