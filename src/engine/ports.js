// Contracts between the engine and everything it does not own. The engine
// imports nothing from adapters/ or coach/; it only calls these shapes.

/**
 * @typedef {{ role: "system" | "user" | "assistant", content: string }} Message
 */

/**
 * @typedef {object} LlmPort
 * @property {(args: {
 *   messages: Message[], signal: AbortSignal,
 *   onEvent?: (name: string, details: object) => void,
 *   onAttemptStarted?: (attempt: number) => void,
 *   onRetryScheduled?: (attempt: number) => void,
 * }) => Promise<{ deltas: AsyncIterable<string>, attempt: number, startedAt: number, model: string, provider: string }>} streamChat
 * @property {(args: { messages: Message[], signal?: AbortSignal }) => Promise<string>} complete
 */

/**
 * @typedef {{ voiceId: string, languageCode?: string | null }} SpeechVoice
 *
 * @typedef {object} TtsUtterance
 * @property {Promise<void>} finished Resolves when all audio arrived; rejects with ProviderFailure.
 * @property {(text: string) => void} sendText
 * @property {() => void} end
 * @property {() => void} cancel
 *
 * @typedef {object} TtsConnection
 * @property {string} key
 * @property {() => boolean} isOpen
 * @property {(args: { onAudio: (pcm: Buffer, letters?: Letters | null) => void, signal?: AbortSignal }) => TtsUtterance} startUtterance
 * @property {() => void} close
 *
 * @typedef {object} TtsPort
 * @property {(voice: SpeechVoice) => string} keyFor
 * @property {(voice: SpeechVoice) => Promise<TtsConnection>} open
 * @property {(text: string, voice: SpeechVoice & { signal?: AbortSignal }) => Promise<Buffer>} synthesize PCM 16-bit 24 kHz mono.
 */

/**
 * @typedef {object} SttPort
 * @property {(args: { audio: Buffer, contentType?: string, language?: string | null, candidates?: { code: string, name: string }[], hallucinations?: RegExp[] })
 *   => Promise<{ text: string, language: string | null }>} transcribe
 */

/**
 * @typedef {object} Letters When each letter of a chunk's text is said.
 * @property {string} chars
 * @property {number[]} ms From the start of the chunk the letters came with; may run past its end.
 *
 * @typedef {object} AvatarSpeech
 * @property {(pcm: Buffer, letters?: Letters | null) => void} push letters: only an avatar the page draws uses them.
 * @property {() => void} end
 *
 * @typedef {object} AvatarHandle
 * @property {string} sessionId
 * @property {number} [expiresAt] Provider deadline, milliseconds since Unix epoch.
 * @property {number} [durationMs] Lifetime used to schedule replacement before expiresAt.
 * @property {object} client Whatever the browser needs to show the avatar.
 * @property {(args?: { onFirstChunk?: () => void }) => AvatarSpeech} beginSpeech
 * @property {() => void} interrupt
 * @property {() => Promise<void>} settleAfterInterrupt
 * @property {() => Promise<void>} whenInterruptSettled Waits out the last interrupt without sending another.
 * @property {() => void} startListening
 * @property {() => void} stopListening
 * @property {() => Promise<void>} stop
 *
 * @typedef {object} AvatarPort
 * @property {(args: { onSpeakStarted: () => void, onSpeakEnded: () => void, send: (payload: object) => void }) => Promise<AvatarHandle>} start
 *   send: an event to the page of this session, for an avatar the page itself plays.
 */

/**
 * The domain layer. Everything specific to the app (src/coach/) lives behind this.
 *
 * @typedef {object} CoachPort
 * @property {(setup: object) => object} createState Becomes session.coachState; the engine never reads it.
 * @property {(session: object) => boolean} [atBoundary] Safe to replace an expiring avatar; defaults to between replies. The emergency deadline overrides this hint.
 * @property {(session: object) => SpeechVoice & { sttLanguage: string | null, sttCandidates: { code: string, name: string }[], sttHallucinations: RegExp[], courtesyWords?: string[] }} speech
 *   courtesyWords: said alone (up to three words) while the avatar talks, they do not cut it off.
 * @property {(session: object, turn: { userText: string | null }) => Message[]} buildMessages
 *   userText === null means the coach speaks first (greeting, or after a direction change).
 * @property {{ pattern: RegExp, handle?: (session: object, match: string[]) => void }[]} [markers]
 *   In-band markers the model may emit; stripped before TTS. Patterns must be global.
 * @property {(session: object, userText: string) => ({ handled?: boolean } | void)} [beforeTurn] Synchronous.
 * @property {(session: object) => void} [onInterrupted] The learner cut the coach off mid-reply.
 * @property {(session: object) => void} [onPause] Synchronous. Suspend domain activity on a break or end confirmation; once per transition out of running.
 * @property {(session: object) => void} [onResume] Synchronous. Resume domain activity after a break or cancelled end; once per transition back to running.
 * @property {(session: object) => Promise<unknown> | unknown} [onSessionEnd] The session was closed; not awaited.
 * @property {(session: object, turn: { userText: string | null, reply: string })
 *   => (Promise<{ coachTurn?: boolean } | void> | { coachTurn?: boolean } | void)} [afterTurn]
 *   Return { coachTurn: true } to make the coach speak again right away.
 */

/**
 * @typedef {object} RecorderPort
 * @property {(session: object, type: string, payload: object) => void} record
 * @property {(session: object) => void} [finish]
 */

module.exports = {};
