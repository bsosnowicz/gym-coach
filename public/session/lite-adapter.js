// Browser side of a conversation: avatar video over LiveKit, pipeline events
// over SSE, and the microphone. The browser only records speech and detects
// its boundaries; STT, LLM and TTS all run on the server.

import { Room, RoomEvent } from "https://esm.sh/livekit-client@2";
import { log, logProviderOutput } from "../ui/log.js";
import { showAudioUnlock, hideAudioUnlock } from "../ui/audio-unlock.js";
import { startSession, endSession, openEvents, sendTurn, interrupt, resume, pauseSession, askEnd, continueSession, finishSession, handoverReady, report } from "../api.js";
import { createSpeechRecorder, SILENCE_HOLD_MS } from "../stt.js";
import { resumeBlockedAudio } from "../mic-start.js";
import { armAvatarOnset, resetAvatarOnset } from "./avatar-onset.js";
import { createTurnLatencyTracker, turnLatencyBreakdown } from "./turn-latency.js";

export function createLiteAdapter({
  floor,
  onTranscript = () => {},
  onProviderError = () => {},
  onDisconnected = () => {},
  // A break or the end asked for by voice or a button; onBreakEnded closes either.
  onBreakStarted = () => {},
  onEndRequested = () => {},
  onBreakEnded = () => {},
  // The end was confirmed and the goodbye has been said: the page closes the session.
  onSessionFinished = () => {},
  // Every SSE event after the adapter has handled it, the app's own stages
  // included: an app reacts to them without changing this shared module.
  onEvent = () => {},
  onHandover = () => {},
  // (speaking: boolean): the avatar started or stopped speaking.
  onVoice = () => {},
  // (reason: "permission" | "audio"): the microphone start hangs (public/mic-start.js);
  // onMicUnblocked: it has started after all.
  onMicBlocked = () => {},
  onMicUnblocked = () => {},
}) {
  let room = null;
  let videoEl = null;
  let handoverInProgress = false;
  let currentHandoverId = null;
  let roomTask = null;
  let cancelAudioWait = null;
  let utterancesAfter = 0;
  let connectionEpoch = 0;
  let sessionId = null;
  let eventSource = null;
  let recorder = null;
  let recorderActive = false;
  let userSpeakEndedAt = null;
  let disconnectRequested = false;
  let greetingSpoken = false;
  let providerPaused = false;
  // Muted by the learner (setMicMuted); a provider failure mutes on top of it.
  let micMuted = false;
  // An interrupt was sent and it is not yet known whether the sound was speech.
  let bargeInPending = false;
  // One turn_latency record per answered utterance: in the log here and in the session recorder.
  const turnLatency = createTurnLatencyTracker({
    onReport: ({ action, ...details }) => {
      const parts = turnLatencyBreakdown(details);
      const segments = [["STT", parts.sttMs], ["sieć", parts.networkMs], ["LLM", parts.llmMs], ["TTS", parts.ttsMs],
        ["wysyłka", parts.sendMs], ["awatar", parts.avatarMs], ["dźwięk", parts.audioPathMs]]
        .filter(([, ms]) => ms !== null).map(([name, ms]) => `${name} ${ms}`).join(", ");
      log(`CZAS REAKCJI: ${parts.totalMs} ms (${details.path}${segments ? `: ${segments}` : ""})`);
      report(sessionId, action, details);
    },
  });

  function resumeAfterFalseAlarm() {
    if (!bargeInPending || handoverInProgress) return;
    bargeInPending = false;
    log("(To nie była mowa — awatar wraca do wypowiedzi.)");
    resume(sessionId);
  }

  // A provider failure pauses the conversation instead of ending it.
  function pauseForProviderFailure({ service = "llm", message = "" } = {}) {
    providerPaused = true;
    recorder?.setMuted(true);
    floor.reset();
    onProviderError({ service, message });
  }

  function handlePipelineEvent(data) {
    const { livekitToken, ...details } = data;
    logProviderOutput("pipeline", `SSE ${data.stage}`, details);
    if (data.stage === "avatar_handover_started") startHandover();
    else if (data.stage === "avatar_handover") {
      if (data.handoverId !== currentHandoverId) {
        startHandover();
        currentHandoverId = data.handoverId;
        roomTask = swapRoom(data);
      } else {
        const epoch = connectionEpoch;
        roomTask?.then(() => {
          if (epoch === connectionEpoch && !disconnectRequested && sessionId && currentHandoverId === data.handoverId) {
            handoverReady(sessionId, data.handoverId).then(() => {
              if (epoch === connectionEpoch && data.completed) finishHandover(data);
            }).catch(() => { if (epoch === connectionEpoch) loseAvatar(); });
          }
        });
      }
    } else if (data.stage === "avatar_handover_ended") {
      finishHandover(data);
    } else if (data.stage === "avatar_handover_failed") loseAvatar();
    turnLatency.stage(data);
    if (data.stage === "stt_ready") log(`  ↳ tura przyjęta: ${data.ms} ms`);
    else if (data.stage === "llm_first_token") {
      const attempt = data.attempt > 1 ? `, próba ${data.attempt}` : "";
      log(`  ↳ LLM pierwszy token (TTFT): ${data.ttftMs} ms${attempt}`);
    }
    else if (data.stage === "tts_first_chunk") log(`  ↳ TTS pierwszy chunk: ${data.ms} ms`);
    else if (data.stage === "audio_sent_to_avatar") log(`  ↳ Audio wysłane do awatara: ${data.ms} ms`);
    else if (data.stage === "llm_retry") {
      if (data.reason === "http_status") log(`  ↳ LLM HTTP ${data.status} — ponawiam za ${data.delayMs} ms (po próbie ${data.attempt}).`);
      else if (data.reason === "network_error") log(`  ↳ LLM błąd sieci — ponawiam za ${data.delayMs} ms (po próbie ${data.attempt}).`);
      else log("  ↳ LLM nie odpowiadał — ponawiam turę.");
    }
    else if (data.stage === "llm_hedge") log("  ↳ Główny model milczy — dokładam zapasowego.");
    else if (data.stage === "turn_dropped") log("  ↳ Wypowiedź pominięta — poprzednia tura jeszcze trwa.");
    else if (data.stage === "avatar_speak_started") {
      floor.avatarStartedSpeaking();
      recorder?.setAvatarSpeaking(true);
      onVoice(true);
      log(`Awatar zaczyna mówić... (serwer: ${data.ms} ms od startu tury)`);
      if (userSpeakEndedAt !== null) {
        log(`LATENCJA ODPOWIEDZI: ${Math.round(performance.now() - userSpeakEndedAt)} ms (od ciszy)`);
        userSpeakEndedAt = null;
      }
    }
    else if (data.stage === "avatar_speak_ended") {
      floor.avatarStoppedSpeaking();
      recorder?.setAvatarSpeaking(false);
      onVoice(false);
      greetingSpoken = true;
      log("Awatar skończył mówić.");
    }
    else if (data.stage === "greeting_done") {
      if (!greetingSpoken) log("(Awatar gotów — mikrofon odblokowany.)");
      greetingSpoken = true;
    }
    else if (data.stage === "provider_error") {
      log(`(Dostawca ${data.service} niedostępny.)`);
      pauseForProviderFailure(data);
    }
    else if (data.stage === "paused") {
      floor.reset();
      recorder?.setAvatarSpeaking(false);
      onVoice(false);
      log("(Awatar wstrzymany — sprawdzam, czy to była mowa.)");
    }
    else if (data.stage === "resumed") log("(Awatar wznawia wypowiedź.)");
    else if (data.stage === "break_started") {
      log(data.reason === "conversation" ? "Przerwa — rozmowa z kimś obok." : "Przerwa — czekam na „kontynuujmy”.");
      onBreakStarted(data.reason);
    }
    else if (data.stage === "end_requested") {
      log("Prośba o zakończenie — czekam na potwierdzenie.");
      onEndRequested();
    }
    else if (data.stage === "break_ended") {
      log("Wracamy do sesji.");
      onBreakEnded();
    }
    else if (data.stage === "session_finished") {
      log("Pożegnanie wybrzmiało — zamykam sesję.");
      onSessionFinished();
    }
    else if (data.stage === "interrupted") {
      bargeInPending = false;
      floor.reset();
      recorder?.setAvatarSpeaking(false);
      onVoice(false);
      log("(Przerwano wypowiedź awatara.)");
    }
    else if (data.stage === "avatar_transcription") {
      log(`AWATAR: ${data.text}`);
      floor.setAvatarUtterance(data.text);
      onTranscript("coach", data.text);
    }
    onEvent(data);
  }

  function handleUtterance({ text, silenceAt, sttMs }) {
    if (!recorderActive || providerPaused || handoverInProgress) return;
    if (silenceAt < utterancesAfter) return;
    if (!greetingSpoken) {
      log("(Awatar jeszcze się wita — czekam z odpowiedzią.)");
      return;
    }
    if (floor.isEcho(text)) {
      log("(Zignorowano echo głosu awatara w mikrofonie.)");
      resumeAfterFalseAlarm();
      return;
    }
    const bargeIn = bargeInPending;
    bargeInPending = false;
    log(`TY: ${text}`);
    onTranscript("user", text);
    log(`  ↳ narzut STT (cisza → tekst gotowy): ${sttMs} ms (w tym ${SILENCE_HOLD_MS} ms na wykrycie ciszy)`);
    userSpeakEndedAt = silenceAt;
    turnLatency.start({ silenceAt, sttMs, bargeIn });
    armAvatarOnset(silenceAt, () => turnLatency.audible());
    floor.turnSent();
    sendTurn(sessionId, text);
  }

  async function micPermissionState() {
    try {
      return (await navigator.permissions.query({ name: "microphone" })).state;
    } catch (_) {
      return "unknown";
    }
  }

  async function micBlocked(reason, { audioState = null } = {}) {
    log(reason === "permission"
      ? "(Mikrofon: przeglądarka czeka na zgodę — sprawdź okienko albo pasek adresu.)"
      : "(Mikrofon: dźwięk wstrzymany do pierwszego kliknięcia.)");
    onMicBlocked(reason);
    report(sessionId, "mic_blocked", { reason, permission: await micPermissionState(), audioState: audioState || "unknown" });
  }

  function micUnblocked(reason, waitedMs) {
    log(`(Mikrofon ruszył po ${Math.round(waitedMs / 100) / 10} s.)`);
    onMicUnblocked();
    report(sessionId, "mic_unblocked", { reason, waitedMs });
  }

  function teardownLocal() {
    recorderActive = false;
    handoverInProgress = false;
    cancelAudioWait?.();
    cancelAudioWait = null;
    providerPaused = false;
    bargeInPending = false;
    floor.reset();
    userSpeakEndedAt = null;
    turnLatency.reset();
    resetAvatarOnset(null);
    hideAudioUnlock();
    if (recorder) { recorder.stop(); recorder = null; }
    if (eventSource) { eventSource.close(); eventSource = null; }
  }

  function startHandover() {
    if (handoverInProgress) return;
    handoverInProgress = true;
    recorder?.setMuted(true);
    recorder?.setAvatarSpeaking(false);
    bargeInPending = false;
    userSpeakEndedAt = null;
    floor.reset();
    turnLatency.reset();
    resetAvatarOnset(null);
    onHandover(true);
    log("Krótka przerwa — odnawiam połączenie z awatarem.");
  }

  function finishHandover(data) {
    if (disconnectRequested || data.handoverId !== currentHandoverId || !handoverInProgress) return;
    handoverInProgress = false;
    utterancesAfter = performance.now();
    recorder?.setMuted(micMuted || providerPaused);
    onHandover(false, data);
    log("Połączenie z awatarem odnowione.");
  }

  function loseAvatar() {
    if (disconnectRequested || !sessionId) return;
    connectionEpoch += 1;
    disconnectRequested = true;
    const endedSessionId = sessionId;
    teardownLocal();
    const oldRoom = room;
    room = null;
    oldRoom?.disconnect();
    sessionId = null;
    endSession(endedSessionId);
    onDisconnected();
  }

  async function joinRoom(session, waitForAudio = false) {
    const thisRoom = new Room();
    room = thisRoom;
    let audioSubscribed = false;
    let resolveAudio;
    const audioReady = new Promise((resolve) => { resolveAudio = resolve; });
    const audioChanged = () => {
      if (room !== thisRoom || disconnectRequested) return;
      if (thisRoom.canPlaybackAudio) {
        hideAudioUnlock();
        if (audioSubscribed) resolveAudio(true);
      } else showAudioUnlock(() => thisRoom.startAudio());
    };
    cancelAudioWait = () => resolveAudio(false);
    thisRoom.on(RoomEvent.TrackSubscribed, (track) => {
      if (room !== thisRoom || disconnectRequested) return;
      track.attach(videoEl);
      if (track.kind === "audio") {
        audioSubscribed = true;
        resetAvatarOnset(track.mediaStreamTrack);
        audioChanged();
      }
    });
    thisRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (room === thisRoom) track.detach(videoEl);
    });
    // A stutter heard along with a poor connection is the network; with a good
    // one and no "dziura w dopływie audio" in the server log, it is the avatar's side.
    thisRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      log(`LiveKit: jakość połączenia ${participant?.isLocal ? "przeglądarki" : "awatara"} — ${quality}.`);
    });
    thisRoom.on(RoomEvent.AudioPlaybackStatusChanged, audioChanged);
    thisRoom.on(RoomEvent.Disconnected, () => {
      log("LiveKit: rozłączono.");
      resolveAudio(false);
      if (disconnectRequested || room !== thisRoom || handoverInProgress) return;
      loseAvatar();
    });
    await thisRoom.connect(session.livekitUrl, session.livekitToken);
    if (disconnectRequested || room !== thisRoom) {
      thisRoom.disconnect();
      resolveAudio(false);
      return false;
    }
    log("Połączono z pokojem (wideo).");
    if (!thisRoom.canPlaybackAudio) showAudioUnlock(() => thisRoom.startAudio());

    return waitForAudio ? audioReady : true;
  }

  async function swapRoom(data) {
    const epoch = connectionEpoch;
    try {
      cancelAudioWait?.();
      const oldRoom = room;
      room = null;
      oldRoom?.disconnect();
      if (!await joinRoom(data, true) || epoch !== connectionEpoch || disconnectRequested || !sessionId) return;
      await handoverReady(sessionId, data.handoverId);
      if (epoch === connectionEpoch && data.completed) finishHandover(data);
    } catch (error) {
      if (epoch !== connectionEpoch) return;
      log(`Nie udało się odnowić połączenia: ${error.message}`);
      loseAvatar();
    }
  }

  return {
    async connect(video, setup = {}) {
      const epoch = ++connectionEpoch;
      videoEl = video;
      currentHandoverId = null;
      roomTask = null;
      handoverInProgress = false;
      utterancesAfter = 0;
      disconnectRequested = false;
      micMuted = false;
      greetingSpoken = false;
      log("Startuję sesję...");
      const session = await startSession(setup);
      if (epoch !== connectionEpoch || disconnectRequested) { await endSession(session.sessionId); return session; }
      sessionId = session.sessionId;
      log("Sesja OK. Łączę z pokojem LiveKit (tylko wideo, bez publikowania mikrofonu)...");

      if (!await joinRoom(session)) return session;

      eventSource = openEvents(sessionId);
      eventSource.onmessage = (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch (_) { return; }
        handlePipelineEvent(data);
      };
      eventSource.onerror = () => {
        if (eventSource?.readyState === 2) loseAvatar();
      };

      recorderActive = true;
      recorder = await createSpeechRecorder({
        log,
        sessionId,
        onSpeechStart: () => {
          if (handoverInProgress) return;
          floor.userStartedSpeaking();
          if (floor.canBargeIn()) {
            log("(Przerywasz awatara...)");
            bargeInPending = true;
            interrupt(sessionId);
          } else if (floor.isAvatarSpeaking()) {
            log("(Mowa wykryta, ale awatar dopiero zaczął — za wcześnie na przerwanie.)");
          }
        },
        onError: (e) => {
          log(`(STT: ${e.message})`);
          pauseForProviderFailure({ service: "stt", message: e.message });
        },
        onUtterance: handleUtterance,
        onNoSpeech: resumeAfterFalseAlarm,
        onBlocked: (reason, details) => { micBlocked(reason, details); },
        onUnblocked: micUnblocked,
        onDiagnostics: ({ action, ...details }) => report(sessionId, action, details),
      });
      if (disconnectRequested) { recorder.stop(); recorder = null; }
      else recorder.setMuted(micMuted || providerPaused || handoverInProgress);
      return session;
    },

    resumeAfterProviderFailure() {
      providerPaused = false;
      recorder?.setMuted(micMuted || handoverInProgress);
    },

    // The learner's own mute; while a provider failure pauses the session, the mic stays off anyway.
    setMicMuted(muted) {
      micMuted = muted;
      recorder?.setMuted(muted || providerPaused || handoverInProgress);
    },

    // The "Włącz mikrofon" button. Must be called right in the click handler:
    // the browser resumes audio only within a user gesture. The avatar's own
    // audio is unlocked too, since the overlay may cover its unlock button.
    resumeMicAudio() {
      resumeBlockedAudio();
      if (room && !room.canPlaybackAudio) room.startAudio().catch(() => {});
    },

    // Whether a session is up, for a Stop that asks before ending.
    get connected() {
      return Boolean(sessionId);
    },
    get reconnecting() { return handoverInProgress; },
    get sessionId() { return sessionId; },
    pause: () => pauseSession(sessionId),
    askEnd: () => askEnd(sessionId),
    continueSession: () => continueSession(sessionId),
    finishSession: () => finishSession(sessionId),

    async disconnect() {
      connectionEpoch += 1;
      disconnectRequested = true;
      teardownLocal();
      if (room) {
        room.disconnect();
        room = null;
      }
      await endSession(sessionId);
      sessionId = null;
    },
  };
}
