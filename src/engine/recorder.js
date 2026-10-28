// Default RecorderPort: keeps session events in process memory. Replace with a
// persistent implementation when transcripts need to survive a restart.
function createMemoryRecorder() {
  const eventsBySession = new Map();
  return {
    record(session, type, payload = {}) {
      const events = eventsBySession.get(session.id) || [];
      events.push({ at: new Date().toISOString(), type, payload });
      eventsBySession.set(session.id, events);
    },
    events(sessionId) {
      return eventsBySession.get(sessionId) || [];
    },
    finish(session) {
      const events = eventsBySession.get(session.id) || [];
      console.log(`Sesja ${session.id}: zarejestrowano ${events.length} zdarzeń (tylko w pamięci procesu).`);
    },
  };
}

module.exports = { createMemoryRecorder };
