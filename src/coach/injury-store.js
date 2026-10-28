// Injuries and pain the user reported, kept between sessions in Supabase
// (table user_injuries, supabase/migrations/), as in yoga-startup: one row per
// user and body part, active or resolved. Active ones shape the next plan
// (exercises loading that part are left out) and the coach's prompt.
//
// Until there are accounts the user is GYM_COACH_USER_ID (src/coach/supabase.js
// says why every request names the user).
//
// A failing database never stops a session: reads come back empty, writes are
// logged — the current session has already adapted to what the user said.

const { createSupabase } = require("./supabase");

const SEVERITIES = ["low", "medium", "high"];
const MAX_NOTE_LENGTH = 300;

function createInjuryStore({ url, serviceKey, userId, fetchImpl = fetch, log = console } = {}) {
  const supabase = createSupabase({ url, serviceKey, fetchImpl });
  if (!supabase) return null;
  const { request } = supabase;
  const user = encodeURIComponent(userId);

  return {
    userId,

    // [{ body_part, severity, note }] — active only, newest first.
    async active() {
      try {
        const response = await request(`user_injuries?user_id=eq.${user}&status=eq.active&select=body_part,severity,note&order=reported_at.desc`);
        return await response.json();
      } catch (error) {
        log.warn(`Kontuzje: odczyt nieudany — ${error.message}`);
        return [];
      }
    },

    // One report per body part: a new one updates the row (UNIQUE user_id, body_part).
    async report({ bodyPart, status = "active", severity = null, note = null, sessionId = null }) {
      const now = new Date().toISOString();
      try {
        await request("user_injuries?on_conflict=user_id,body_part", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{
            user_id: userId,
            body_part: bodyPart,
            status,
            severity: SEVERITIES.includes(severity) ? severity : null,
            note: note ? String(note).slice(0, MAX_NOTE_LENGTH) : null,
            source_session_id: sessionId,
            reported_at: now,
            resolved_at: status === "resolved" ? now : null,
          }]),
        });
        return true;
      } catch (error) {
        log.warn(`Kontuzje: zapis nieudany (${bodyPart}) — ${error.message}`);
        return false;
      }
    },
  };
}

module.exports = { createInjuryStore, SEVERITIES };
