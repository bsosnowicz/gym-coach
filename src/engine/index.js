const { startSession, endSession, closeAllSessions, getSession, emit, record } = require("./session");
const { runTurn, runCoachTurn, speakText, stopSpeaking, interruptTurn, resumeTurn } = require("./turn");
const { withSessionControl } = require("./session-control");
const { CLIENT_GONE_AFTER_MS, clientAttached, clientDetached } = require("./session-watchdog");

// The greeting waits a moment so the browser can join the video room first;
// otherwise the opening words are cut off.
const GREETING_DELAY_MS = 1500;

async function startConversation({ greetingDelayMs = GREETING_DELAY_MS, ...options }) {
  const session = await startSession(options);
  session.greetingTimer = setTimeout(() => { runTurn(session, null); }, greetingDelayMs);
  return session;
}

module.exports = {
  startConversation,
  endSession,
  closeAllSessions,
  getSession,
  emit,
  record,
  runTurn,
  runCoachTurn,
  speakText,
  stopSpeaking,
  interruptTurn,
  resumeTurn,
  withSessionControl,
  CLIENT_GONE_AFTER_MS,
  clientAttached,
  clientDetached,
};
