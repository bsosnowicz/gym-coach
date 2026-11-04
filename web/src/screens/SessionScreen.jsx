// The session page of the template, put together from the reusable parts.
// An app can keep it, add its own parts around it, or compose its own screen.
import { useRef, useState } from "react";
import { AvatarStage } from "../components/AvatarStage.jsx";
import { BreakOverlay } from "../components/BreakOverlay.jsx";
import { CoachStage } from "../components/Mascot.jsx";
import { DevLog } from "../components/DevLog.jsx";
import { EndDialog } from "../components/EndDialog.jsx";
import { MicBlockedOverlay } from "../components/MicBlockedOverlay.jsx";
import { SessionControls } from "../components/SessionControls.jsx";
import { Transcript } from "../components/Transcript.jsx";
import { VoiceCheck } from "../components/VoiceCheck.jsx";
import { useSession } from "../session/useSession.js";
import { getMascotId } from "../../../public/ui/mascots.js";
import { DEFAULT_SCENE } from "../../../public/ui/scenes.js";

// The mascot's state from what the session already knows. Joy (cheer) outranks the speech it
// comes with, or it would hardly ever be seen. The microphone is open the whole session, so
// "listening" means it is the user's turn; "thinking": the user spoke last, no answer yet.
function mascotState(session, cheer) {
  if (session.hold === "pause") return "paused";
  if (cheer) return "happy";
  if (session.speaking) return "speaking";
  if (!session.running) return "idle";
  if (session.transcript.at(-1)?.speaker === "user") return "thinking";
  return session.micMuted ? "idle" : "listening";
}

// texts: overrides of session/texts.js; onEvent(data): the app's own SSE stages.
// children(session): the app's own parts below the controls (e.g. a camera panel).
// overlay: the app's own layer on the avatar video (e.g. a rest countdown).
// cheer: the mascot's joy in voice mode (e.g. a finished set).
export function SessionScreen({ texts, onEvent, children, overlay = null, cheer = false }) {
  const videoRef = useRef(null);
  const session = useSession(videoRef, { texts, onEvent });
  const t = session.texts;
  const [checking, setChecking] = useState(false);
  return (
    <>
      <main className="app">
        <AvatarStage
          videoRef={videoRef}
          status={session.status}
          audioUnlockText={t.audioUnlock}
          backdrop={(
            <CoachStage
              hidden={!session.running || !session.voiceOnly}
              mascotId={getMascotId()}
              sceneId={DEFAULT_SCENE}
              state={mascotState(session, cheer)}
              getLevel={session.voiceLevel}
              getShape={session.voiceMouth}
            />
          )}
        >
          <BreakOverlay open={session.hold === "pause"} onContinue={session.continueSession} texts={t} reconnecting={session.reconnecting} />
          <MicBlockedOverlay reason={session.micBlocked} onResume={session.resumeMic} texts={t} />
          {overlay}
        </AvatarStage>
        <SessionControls session={session} onStart={() => setChecking(true)} />
        <p className="hint">{t.voiceHint}</p>
        {children?.(session)}
        <Transcript items={session.transcript} />
        <DevLog title={t.devLog} />
      </main>
      <EndDialog
        open={session.hold === "end"}
        finishing={session.finishing}
        reconnecting={session.reconnecting}
        onFinish={session.finish}
        onContinue={session.continueSession}
        texts={t}
      />
      <VoiceCheck
        open={checking}
        onDone={() => { setChecking(false); session.start(); }}
        onClose={() => setChecking(false)}
        texts={t}
      />
    </>
  );
}
