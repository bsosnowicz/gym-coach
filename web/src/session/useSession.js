// The running conversation with the avatar: the Lite adapter, what the server
// sends over SSE and what a page needs to show it. No markup here: an app
// draws it its own way, or uses screens/SessionScreen.jsx as it is.
import { useEffect, useRef, useState } from "react";
import { log } from "../../../public/ui/log.js";
import { createConversationFloor } from "../../../public/session/conversation-floor.js";
import { createLiteAdapter } from "../../../public/session/lite-adapter.js";
import { SESSION_TEXTS } from "./texts.js";

// videoRef: the <video> the avatar plays in; it must stay mounted for the whole session.
// texts: overrides of SESSION_TEXTS. onEvent(data): every SSE event, the app's own stages included.
export function useSession(videoRef, { texts = {}, onEvent } = {}) {
  const TEXTS = { ...SESSION_TEXTS, ...texts };
  // Event handlers are created once; they read the latest props from here.
  const latest = useRef({ TEXTS, onEvent });
  latest.current = { TEXTS, onEvent };

  // "idle" | "connecting" | "running"
  const [phase, setPhase] = useState("idle");
  const [status, setStatus] = useState(TEXTS.idle);
  // [{ id, speaker: "user" | "coach", text }]
  const [transcript, setTranscript] = useState([]);
  // The break over the video, or the question whether to end; null: neither.
  const [hold, setHold] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  // The microphone start hangs: "permission" | "audio" | null (public/mic-start.js).
  const [micBlocked, setMicBlocked] = useState(null);
  // The goodbye is being said after "Tak, kończymy".
  const [finishing, setFinishing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // Voice mode (COACH_AVATAR=voice): no video, the coach's mascot on a drawn stage.
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const transcriptId = useRef(0);
  const closing = useRef(false);

  function reset(statusText) {
    setHold(null);
    setPhase("idle");
    setMicMuted(false);
    setMicBlocked(null);
    setReconnecting(false);
    setSpeaking(false);
    setStatus(statusText);
  }

  const adapterRef = useRef(null);
  // Who has the floor; the app's own parts (e.g. camera corrections) wait for a pause on it.
  const floorRef = useRef(null);
  if (!adapterRef.current) {
    const texts = () => latest.current.TEXTS;
    floorRef.current = createConversationFloor();
    adapterRef.current = createLiteAdapter({
      floor: floorRef.current,
      onTranscript: (speaker, text) => {
        transcriptId.current += 1;
        setTranscript((items) => [...items, { id: transcriptId.current, speaker, text }]);
      },
      onVoice: (speaking) => {
        setSpeaking(speaking);
        if (!adapterRef.current?.reconnecting) setStatus(speaking ? texts().speaking : texts().listening);
      },
      onHandover: (active, state = {}) => {
        setReconnecting(active);
        setStatus(active ? texts().reconnecting : state.paused ? texts().paused : texts().listening);
      },
      onProviderError: ({ message }) => setStatus(texts().providerError(message)),
      onDisconnected: () => reset(texts().disconnected),
      onBreakStarted: () => {
        setHold("pause");
        setStatus(texts().paused);
      },
      onEndRequested: () => setHold("end"),
      onBreakEnded: () => {
        setHold(null);
        setStatus(texts().resumed);
      },
      onSessionFinished: () => close(),
      onEvent: (data) => latest.current.onEvent?.(data),
      onMicBlocked: setMicBlocked,
      onMicUnblocked: () => setMicBlocked(null),
    });
  }
  const adapter = adapterRef.current;

  // In-app navigation aside, closing the tab must not leave a paid avatar session running.
  useEffect(() => {
    const onPageHide = () => { adapter.disconnect(); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [adapter]);

  // The single way a finished session closes: after the goodbye by voice
  // (session_finished) and after the "Tak, kończymy" button alike.
  async function close() {
    if (closing.current) return;
    closing.current = true;
    setHold(null);
    await adapter.disconnect();
    reset(latest.current.TEXTS.finished);
    closing.current = false;
  }

  // setup: whatever the app's /api/session/start takes (e.g. an exercise id).
  async function start(setup = {}) {
    setPhase("connecting");
    setTranscript([]);
    setStatus(TEXTS.connecting);
    try {
      const started = await adapter.connect(videoRef.current, setup);
      setVoiceOnly(started?.mode === "voice");
      setPhase("running");
      setStatus(TEXTS.greeting);
    } catch (error) {
      log(`Start nieudany: ${error.message}`);
      await adapter.disconnect();
      reset(TEXTS.startFailed(error.message));
    }
  }

  const pause = () => adapter.pause().catch((error) => log(`Przerwa: ${error.message}`));
  const askEnd = () => adapter.askEnd().catch((error) => log(`Stop: ${error.message}`));
  // Back from a break or from the end window; the server answers with break_ended.
  const continueSession = () => adapter.continueSession().catch((error) => log(`Powrót: ${error.message}`));

  async function finish() {
    setFinishing(true);
    setStatus(TEXTS.farewell);
    try {
      await adapter.finishSession();
    } catch (error) {
      log(`Zakończenie: ${error.message}`);
    } finally {
      setFinishing(false);
      close();
    }
  }

  function toggleMic() {
    const muted = !micMuted;
    adapter.setMicMuted(muted);
    setMicMuted(muted);
  }

  // Must stay a direct click handler: the browser resumes audio only within a gesture.
  const resumeMic = () => adapter.resumeMicAudio();

  return {
    phase, running: phase === "running", status, transcript, hold, micMuted, micBlocked, finishing, reconnecting, texts: TEXTS,
    voiceOnly, speaking,
    floor: floorRef.current, sessionId: () => adapter.sessionId,
    // The adapter's own functions: the same every render, so the mascot's frame loop is not restarted.
    voiceLevel: adapter.voiceLevel,
    voiceMouth: adapter.voiceMouth,
    start, pause, askEnd, continueSession, finish, toggleMic, resumeMic,
  };
}
