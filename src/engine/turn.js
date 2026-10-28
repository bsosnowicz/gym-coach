// One conversation turn: text in, avatar speech out. The LLM reply is streamed
// sentence by sentence into TTS, and the PCM is forwarded to the avatar as it arrives.

const { ProviderFailure, httpProblem, providerFailure, publicProviderFailure } = require("./provider-failure");
const { emit, record, trimHistory, ensureTts } = require("./session");
const { createSentenceStream } = require("./sentence-stream");
const { BYTES_PER_MS, resumeOffset } = require("./resume-point");
const { isLoneCourtesy } = require("./words");

// Less than this left to say is not worth restarting the avatar for.
const MIN_RESUME_BYTES = 200 * BYTES_PER_MS;
// How long past its own length a text may take to be spoken before speakText stops waiting.
const SPOKEN_MARGIN_MS = 3000;

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

function reportFailure(session, error, fallbackService) {
  const failure = providerFailure(fallbackService, error);
  const cause = failure.cause || error?.cause || error;
  console.error(
    `Sesja ${session.id}: awaria dostawcy service=${failure.service}, code=${failure.code}, ` +
    `cause=${cause?.message || "brak szczegółów"}`
  );
  const payload = publicProviderFailure(failure, fallbackService);
  session.providerFailurePayload = payload;
  emit(session, payload);
  record(session, "provider.failure", { service: failure.service, code: failure.code });
  return failure;
}

// userText === null: the coach speaks first (greeting, or after a direction change).
function runTurn(session, userText, isRetry = false) {
  if (session.closed) return Promise.resolve();
  if (session.handover?.active) {
    emit(session, { stage: "turn_dropped", reason: "avatar_handover" });
    return Promise.resolve();
  }
  // The learner really said something during a pause: the paused reply is
  // dropped for good and this turn runs once it has wound down.
  if (session.turnInFlight && session.turnHeld && userText !== null) {
    // A bare "Dziękuję" or "mhm" is not a reason to drop what the avatar was saying.
    if (isLoneCourtesy(userText, session.coach.speech(session).courtesyWords)) {
      console.log(`Sesja ${session.id}: samo "${userText}" w trakcie wypowiedzi — awatar mówi dalej.`);
      record(session, "user.transcription", { text: userText });
      record(session, "user.turn_dropped", { reason: "courtesy" });
      session.activeTurnResume?.();
      return Promise.resolve();
    }
    const paused = session.activeTurn;
    session.activeTurnAbort?.();
    return Promise.resolve(paused).catch(() => {}).then(() => runTurn(session, userText, isRetry));
  }
  if (userText && !isRetry) record(session, "user.transcription", { text: userText });
  if (session.turnInFlight) {
    console.warn(`Sesja ${session.id}: tura zignorowana — poprzednia jeszcze trwa.`);
    emit(session, { stage: "turn_dropped" });
    return Promise.resolve();
  }
  // The greeting must play out in full; a stray sound must not take its turn.
  if (userText !== null && !session.greetingDone) {
    console.warn(`Sesja ${session.id}: tura odrzucona — powitanie jeszcze trwa.`);
    return Promise.resolve();
  }
  session.providerFailurePayload = null;
  if (userText !== null && !isRetry && session.coach.beforeTurn?.(session, userText)?.handled) {
    return Promise.resolve();
  }
  session.turnInFlight = true;
  session.activeTurn = executeTurn(session, userText, isRetry);
  return session.activeTurn;
}

async function executeTurn(session, userText, isRetry) {
  const { firstTokenTimeoutMs, turnTimeoutMs, speakEndTimeoutMs, holdTimeoutMs } = session.options;
  session.turnStartedAt = performance.now();
  const controller = new AbortController();
  const whenAborted = new Promise((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
  whenAborted.catch(() => {});

  let resolveSpeakEnded = null;
  const settleSpeakEnded = () => {
    const done = resolveSpeakEnded;
    resolveSpeakEnded = null;
    done?.();
  };
  session.activeTurnAbort = () => { controller.abort(); settleSpeakEnded(); };

  const mark = (stage, details = {}) => {
    emit(session, { stage, ms: Math.round(performance.now() - session.turnStartedAt), ...details });
  };

  let utterance = null;
  let playback = null;
  let stallTimer = null;
  let stalled = false;
  let timedOut = false;
  let ttsFailure = null;
  let firstAudioSeen = false;
  let firstTokenSeen = false;
  let completed = false;
  let fullReplyText = "";

  const disarmStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = null;
  };
  const armStallTimer = () => {
    disarmStallTimer();
    stallTimer = setTimeout(() => {
      stalled = true;
      console.warn(
        `Sesja ${session.id}: LLM zamilkł na ${firstTokenTimeoutMs} ms ` +
        `(${firstTokenSeen ? "w połowie odpowiedzi" : "przed pierwszym tokenem"}) — przerywam turę.`
      );
      controller.abort();
    }, firstTokenTimeoutMs);
  };
  const watchdog = setTimeout(() => {
    timedOut = true;
    console.error(`Sesja ${session.id}: tura nie zakończyła się w ${turnTimeoutMs} ms — przerywam.`);
    controller.abort();
  }, turnTimeoutMs);

  try {
    mark("stt_ready");
    session.avatar.stopListening();
    if (userText && !isRetry) session.history.push({ role: "user", content: userText });
    trimHistory(session);

    const ttsConnection = await ensureTts(session).catch((error) => { throw providerFailure("tts", error); });
    const messages = session.coach.buildMessages(session, { userText });

    let served;
    try {
      served = await session.llm.streamChat({
        messages,
        signal: controller.signal,
        onAttemptStarted: armStallTimer,
        onRetryScheduled: disarmStallTimer,
        onEvent: (name, details) => {
          record(session, name, details);
          if (name === "llm_retry_scheduled") {
            emit(session, { stage: "llm_retry", reason: details.reason, status: details.statusCode, attempt: details.attempt, responseMs: details.responseMs, delayMs: details.delayMs });
          } else if (name === "llm_hedge") {
            console.warn(`Sesja ${session.id}: ${details.primary} nie odpowiada (${details.reason}) — dokładam ${details.fallback}.`);
            emit(session, { stage: "llm_hedge" });
          }
        },
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw providerFailure("llm", new Error(error.httpStatus ? httpProblem(error.httpStatus) : error.message));
    }

    // Everything synthesized for this reply is kept, so that after a pause
    // (barge-in that may turn out to be a cough) playback can restart mid-reply.
    session.speakStartedAt = null;
    playback = {
      chunks: [],
      speech: session.avatar.beginSpeech({ onFirstChunk: () => mark("audio_sent_to_avatar") }),
      // Byte offset in the reply at which the avatar's current speech began.
      segmentOffset: 0,
      inputDone: false,
      held: false,
      resuming: false,
      resumeAt: 0,
      whenReleased: null,
      release: null,
      holdTimer: null,
    };

    // Pause: the avatar goes quiet, while the LLM and TTS keep filling the buffer.
    session.activeTurnHold = () => {
      if (playback.held) return true;
      if (!firstAudioSeen || controller.signal.aborted) return false;
      const pcm = Buffer.concat(playback.chunks);
      const playedMs = session.speakStartedAt === null ? 0 : performance.now() - session.speakStartedAt;
      const cut = playback.segmentOffset + Math.floor(playedMs * BYTES_PER_MS);
      playback.resumeAt = resumeOffset(pcm, cut);
      console.log(
        `Sesja ${session.id}: pauza po ${(Math.min(cut, pcm.length) / BYTES_PER_MS / 1000).toFixed(2)} s wypowiedzi, ` +
        `wznowienie byłoby od ${(playback.resumeAt / BYTES_PER_MS / 1000).toFixed(2)} s.`
      );
      playback.held = true;
      session.turnHeld = true;
      playback.whenReleased = new Promise((resolve) => { playback.release = resolve; });
      // Nobody decided what the sound was: treat it as a real interruption.
      playback.holdTimer = setTimeout(() => {
        console.log(`Sesja ${session.id}: pauza bez rozstrzygnięcia przez ${holdTimeoutMs} ms — kończę wypowiedź.`);
        session.activeTurnAbort?.();
      }, holdTimeoutMs);
      emit(session, { stage: "paused" });
      record(session, "avatar.paused", {});
      return true;
    };

    const resumePlayback = async () => {
      await session.avatar.whenInterruptSettled();
      if (controller.signal.aborted) return;
      const rest = Buffer.concat(playback.chunks).subarray(playback.resumeAt);
      if (!playback.inputDone || rest.length >= MIN_RESUME_BYTES) {
        session.avatar.stopListening();
        session.speakStartedAt = null;
        playback.segmentOffset = playback.resumeAt;
        playback.speech = session.avatar.beginSpeech();
        playback.speech.push(rest);
        if (playback.inputDone) playback.speech.end();
        playback.awaitingSpeakEnd = true;
      } else {
        playback.awaitingSpeakEnd = false;
      }
      playback.held = false;
      playback.resuming = false;
      session.turnHeld = false;
      emit(session, { stage: "resumed" });
      record(session, "avatar.resumed", {});
      playback.release();
    };

    // The pause was a false alarm: carry on from where the avatar stopped.
    session.activeTurnResume = () => {
      if (!playback.held || playback.resuming) return false;
      playback.resuming = true;
      clearTimeout(playback.holdTimer);
      resumePlayback().catch((error) => {
        console.warn(`Sesja ${session.id}: wznowienie nie powiodło się — ${error.message}`);
        session.activeTurnAbort?.();
      });
      return true;
    };

    utterance = ttsConnection.startUtterance({
      signal: controller.signal,
      onAudio: (pcm) => {
        if (!firstAudioSeen) { firstAudioSeen = true; mark("tts_first_chunk"); }
        playback.chunks.push(pcm);
        if (!playback.held) playback.speech.push(pcm);
      },
    });
    // A TTS failure mid-stream must also stop the LLM stream.
    utterance.finished.catch((failure) => {
      ttsFailure = failure;
      controller.abort();
    });

    const sentences = createSentenceStream((text) => session.markers.strip(text, session));
    for await (const delta of served.deltas) {
      armStallTimer();
      if (!firstTokenSeen) {
        firstTokenSeen = true;
        const ttftMs = Math.round(performance.now() - served.startedAt);
        mark("llm_first_token", { ttftMs, attempt: served.attempt });
        record(session, "llm_first_token", { attempt: served.attempt, ttftMs, model: served.model });
      }
      fullReplyText += delta;
      for (const fragment of sentences.push(delta)) utterance.sendText(fragment);
    }
    disarmStallTimer();
    if (ttsFailure) throw ttsFailure;

    const tail = sentences.flush();
    if (tail) utterance.sendText(tail);

    const spokenText = session.markers.clean(fullReplyText);
    if (spokenText) session.lastSpokenText = spokenText;

    if (spokenText.trim()) {
      utterance.end();
      await Promise.race([utterance.finished, whenAborted]);
      playback.inputDone = true;
      playback.awaitingSpeakEnd = true;
      if (!playback.held) playback.speech.end();
    } else {
      // A reply made only of markers has nothing to say. No audio is expected,
      // so its absence is no TTS failure; the avatar was never sent anything.
      utterance.cancel();
      playback.inputDone = true;
      playback.awaitingSpeakEnd = false;
    }

    // Wait until the avatar has actually finished speaking before listening
    // again. A pause silences the avatar too, so "speak ended" only closes the
    // turn when no pause is in force.
    for (;;) {
      if (playback.held) await Promise.race([playback.whenReleased, whenAborted]);
      if (!playback.awaitingSpeakEnd) break;
      let speakEndTimer = null;
      await new Promise((resolve) => {
        resolveSpeakEnded = resolve;
        session.onSpeakEnded = resolve;
        speakEndTimer = setTimeout(resolve, speakEndTimeoutMs);
      });
      clearTimeout(speakEndTimer);
      resolveSpeakEnded = null;
      if (controller.signal.aborted) throw abortError();
      if (!playback.held) break;
    }
    if (controller.signal.aborted) throw abortError();

    if (spokenText) {
      session.history.push({ role: "assistant", content: spokenText });
      trimHistory(session);
      record(session, "avatar.transcription", { text: spokenText });
      emit(session, { stage: "avatar_transcription", text: spokenText });
    }
    session.avatar.startListening();
    completed = true;
  } catch (error) {
    if (ttsFailure || error instanceof ProviderFailure) {
      reportFailure(session, ttsFailure || error, ttsFailure ? "tts" : "llm");
    } else if (error.name === "AbortError" && timedOut) {
      const service = firstAudioSeen ? "tts" : "llm";
      reportFailure(session, providerFailure(service, error, { code: "provider_timeout" }), service);
    } else if (error.name === "AbortError" && stalled) {
      console.warn(`Sesja ${session.id}: tura przerwana — LLM nie odpowiadał.`);
    } else if (error.name === "AbortError" && session.closed) {
      console.log(`Sesja ${session.id}: tura ucięta — sesja zamknięta.`);
    } else if (error.name === "AbortError") {
      // Barge-in. Keep what the coach managed to say, so the model knows about it.
      emit(session, { stage: "interrupted" });
      record(session, "avatar.interrupted", {});
      session.coach.onInterrupted?.(session);
      const spokenBeforeCut = session.markers.clean(fullReplyText);
      if (spokenBeforeCut) {
        session.history.push({ role: "assistant", content: spokenBeforeCut });
        trimHistory(session);
      } else if (userText && !isRetry) {
        // Nothing was said: drop the user message too, or the next turn would
        // carry two user messages in a row.
        const last = session.history.at(-1);
        if (last?.role === "user" && last.content === userText) session.history.pop();
      }
    } else {
      console.error(`Sesja ${session.id}: błąd tury: ${error.message}`);
      reportFailure(session, error, firstTokenSeen ? "tts" : "llm");
    }
  } finally {
    clearTimeout(watchdog);
    disarmStallTimer();
    utterance?.cancel();
    clearTimeout(playback?.holdTimer);
    session.activeTurnHold = null;
    session.activeTurnResume = null;
    session.turnHeld = false;
    session.activeTurnAbort = null;
    session.activeTurn = null;
    session.turnInFlight = false;

    // A stalled provider gets one more chance, but only if nothing was spoken yet.
    const willRetry = stalled && !isRetry && !firstTokenSeen && !session.closed;
    if (stalled && isRetry) {
      reportFailure(session, providerFailure("llm", null, { code: "provider_timeout" }), "llm");
    }
    if (userText === null && !session.greetingDone) {
      session.greetingDone = true;
      try { session.avatar.startListening(); } catch (_) {}
      emit(session, { stage: "greeting_done" });
    }
    if (willRetry) {
      console.warn(`Sesja ${session.id}: ponawiam turę raz po zawieszeniu LLM.`);
      emit(session, { stage: "llm_retry" });
      runTurn(session, userText, true);
    } else if (completed && !session.closed) {
      Promise.resolve()
        .then(() => session.coach.afterTurn?.(session, { userText, reply: session.markers.clean(fullReplyText) }))
        .then((result) => { if (result?.coachTurn && !session.closed) runTurn(session, null); })
        .catch((error) => console.warn(`Sesja ${session.id}: coach.afterTurn — ${error.message}`));
    }
  }
}

// Cuts off the turn in progress and silences the avatar; resolves once the turn has unwound.
async function stopSpeaking(session) {
  const running = session.activeTurn;
  session.activeTurnAbort?.();
  try { session.avatar.interrupt(); } catch (_) {}
  await running?.catch(() => {});
}

// Makes the coach speak now, cutting off whatever is in progress.
async function runCoachTurn(session) {
  if (session.closed) return;
  if (session.activeTurn) await stopSpeaking(session);
  await runTurn(session, null);
}

// Says exactly this text, without the LLM. Uses a dedicated TTS socket, so it
// needs no turn lock and cannot be starved by a hanging turn.
// untilSpoken: resolves only once the avatar has said it, for words that must
// be heard before the session closes.
async function speakText(session, text, { untilSpoken = false } = {}) {
  if (session.closed || session.handover?.active) return false;
  session.directSpeechInFlight = (session.directSpeechInFlight || 0) + 1;
  try {
    return await speakDirectText(session, text, { untilSpoken });
  } finally {
    session.directSpeechInFlight -= 1;
  }
}

async function speakDirectText(session, text, { untilSpoken }) {
  session.activeTurnAbort?.();
  // Last speaker wins: a newer speakText or the end of the session cancels this one.
  const epoch = (session.speechEpoch += 1);
  const stillCurrent = () => !session.closed && epoch === session.speechEpoch;

  let pcm;
  try {
    pcm = await session.tts.synthesize(text, session.coach.speech(session));
  } catch (error) {
    console.warn(`Sesja ${session.id}: synteza komunikatu nie powiodła się — ${error.message}`);
    return false;
  }
  if (!stillCurrent()) return false;

  try {
    await session.avatar.settleAfterInterrupt();
    if (!stillCurrent()) return false;
    // A lost "speak ended" from the avatar must not hold the caller forever.
    const spoken = untilSpoken && new Promise((resolve) => {
      const timer = setTimeout(resolve, pcm.length / BYTES_PER_MS + SPOKEN_MARGIN_MS);
      session.onSpeakEnded = () => { clearTimeout(timer); resolve(); };
    });
    const speech = session.avatar.beginSpeech();
    speech.push(pcm);
    speech.end();
    await spoken;
    if (!stillCurrent()) return false;
    session.history.push({ role: "assistant", content: text });
    trimHistory(session);
    record(session, "avatar.transcription", { text });
    session.avatar.startListening();
    emit(session, { stage: "avatar_transcription", text });
    return true;
  } catch (error) {
    console.warn(`Sesja ${session.id}: nie udało się wysłać komunikatu do awatara — ${error.message}`);
    return false;
  }
}

// Barge-in: a sound was heard over the avatar. A reply that is already being
// spoken is only paused: resumeTurn() carries on if the sound was not speech,
// and a real learner turn (or a timeout) drops it. A reply that has not
// started speaking yet is dropped at once.
function interruptTurn(session) {
  if (session.closed || session.handover?.active) return { ok: true, ignored: "avatar_handover" };
  if (!session.greetingDone) return { ok: true, ignored: "greeting" };
  const held = Boolean(session.activeTurnHold?.());
  console.log(`Sesja ${session.id}: barge-in${held ? " (pauza)" : session.activeTurn ? "" : " (bez aktywnej tury)"}.`);
  if (!held) session.activeTurnAbort?.();
  try {
    session.avatar.interrupt();
    session.avatar.startListening();
  } catch (_) {}
  return { ok: true, held };
}

// The sound that paused the avatar was not speech.
function resumeTurn(session) {
  return { ok: true, resumed: Boolean(session.activeTurnResume?.()) };
}

module.exports = { runTurn, runCoachTurn, speakText, stopSpeaking, interruptTurn, resumeTurn };
