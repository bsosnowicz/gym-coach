// Closes a session nobody is attending any more.
//
// A session lives in server memory and never ends on its own: the avatar keeps
// a paid session open at the provider. Only /api/session/end, a new start by
// the same user or a crash ended it. When the tab vanished without a word
// (laptop closed, app killed, network gone), the session talked to an empty
// room — in yoga-startup for 3 h and 21 h, with dozens of new avatar sessions.
//
// The sign of a present browser is the /api/session/events stream: it is held
// for the whole session and EventSource reconnects on its own within seconds.
// No stream for CLIENT_GONE_AFTER_MS is therefore not a network blip but no
// browser. The threshold is generous on purpose: a phone with the screen off
// can suspend the tab.

const CLIENT_GONE_AFTER_MS = 3 * 60 * 1000;

function clientAttached(session) {
  clearTimeout(session.clientGoneTimer);
  session.clientGoneTimer = null;
}

// A stream closed, or the session has just started and the browser has not
// connected yet. A second tab or a reconnect before the old stream closed
// does not start the countdown.
function clientDetached(session, onGone, afterMs = CLIENT_GONE_AFTER_MS) {
  if (!session || session.closed || session.sseClients?.size > 0) return;
  clearTimeout(session.clientGoneTimer);
  session.clientGoneTimer = setTimeout(() => {
    session.clientGoneTimer = null;
    if (session.closed || session.sseClients?.size > 0) return;
    Promise.resolve()
      .then(() => onGone(session))
      // An unhandled rejection from a timer takes the whole Node process down.
      .catch((error) => console.error(`Strażnik sesji [${session.id}]: ${error.message}`));
  }, afterMs);
  session.clientGoneTimer.unref?.();
}

module.exports = { CLIENT_GONE_AFTER_MS, clientAttached, clientDetached };
