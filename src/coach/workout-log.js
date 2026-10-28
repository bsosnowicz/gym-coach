// The workout journal in Supabase (table workout_sessions): one row per
// session, upserted after every set and every change, so a session that ends
// any way at all (Stop, a closed tab, a server restart) keeps what was done.
// The last row comes back at the next start: the coach can refer to it.

const { createSupabase } = require("./supabase");

function createWorkoutLog({ url, serviceKey, userId, fetchImpl = fetch, log = console } = {}) {
  const supabase = createSupabase({ url, serviceKey, fetchImpl });
  if (!supabase) return null;
  const { request } = supabase;
  const user = encodeURIComponent(userId);
  // Writes of one process go out one after another: an older state must not land last.
  let queue = Promise.resolve();

  return {
    // entry: { sessionId, startedAt, finished, profile, exercises, sets, changes }.
    save(entry) {
      queue = queue.then(async () => {
        try {
          await request("workout_sessions?on_conflict=session_id", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{
              session_id: entry.sessionId,
              user_id: userId,
              started_at: entry.startedAt,
              updated_at: new Date().toISOString(),
              finished: entry.finished,
              profile: entry.profile,
              exercises: entry.exercises,
              sets: entry.sets,
              changes: entry.changes,
            }]),
          });
          return true;
        } catch (error) {
          log.warn(`Dziennik treningu: zapis nieudany — ${error.message}`);
          return false;
        }
      });
      return queue;
    },

    // The newest workout of the user, or null.
    async last() {
      try {
        const response = await request(`workout_sessions?user_id=eq.${user}&select=started_at,finished,profile,exercises,sets&order=started_at.desc&limit=1`);
        return (await response.json())[0] || null;
      } catch (error) {
        log.warn(`Dziennik treningu: odczyt nieudany — ${error.message}`);
        return null;
      }
    },
  };
}

module.exports = { createWorkoutLog };
