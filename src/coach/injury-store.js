// Injuries and pain the user reported, kept between sessions in Supabase
// (table user_injuries, supabase/migrations/), as in yoga-startup: one row per
// user and body part, active or resolved. Active ones shape the next plan
// (exercises loading that part are left out) and the coach's prompt.
//
// Plain REST (PostgREST) through fetch: the server has no npm dependencies.
// The service_role key bypasses row-level security, so every request names the
// user explicitly. Until there are accounts the user is GYM_COACH_USER_ID.
//
// A failing database never stops a session: reads come back empty, writes are
// logged — the current session has already adapted to what the user said.

const REQUEST_TIMEOUT_MS = 5000;
const SEVERITIES = ["low", "medium", "high"];
const MAX_NOTE_LENGTH = 300;

function createInjuryStore({ url, serviceKey, userId, fetchImpl = fetch, log = console } = {}) {
  if (!url || !serviceKey) return null;
  const base = `${url.replace(/\/$/, "")}/rest/v1`;

  async function request(resource, options = {}) {
    const response = await fetchImpl(`${base}/${resource}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`Supabase ${resource.split("?")[0]}: HTTP ${response.status} ${await response.text()}`);
    return response;
  }

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
