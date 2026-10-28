// The microphone start hangs (public/mic-start.js). Without this the user heard
// the greeting, talked into the void and closed the tab. The browser's
// permission prompt cannot be answered from the page, so only suspended audio
// gets a button.
export function MicBlockedOverlay({ reason, onResume, texts }) {
  const permission = reason === "permission";
  return (
    <div className="overlay" hidden={!reason} role="alert">
      <p className="overlay-title">{permission ? texts.micPermissionTitle : texts.micAudioTitle}</p>
      <p className="hint">{permission ? texts.micPermissionText : texts.micAudioText}</p>
      {!permission && (
        <button type="button" className="btn btn-primary" onClick={onResume}>{texts.micAudioButton}</button>
      )}
    </div>
  );
}
