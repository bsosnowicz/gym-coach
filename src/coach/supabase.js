// The one place that talks to Supabase: plain REST (PostgREST) through fetch,
// since the server has no npm dependencies. The service_role key bypasses
// row-level security, so every caller names the user in its resource.

const REQUEST_TIMEOUT_MS = 5000;

// null without SUPABASE_URL or the key: callers then keep nothing between sessions.
function createSupabase({ url, serviceKey, fetchImpl = fetch } = {}) {
  if (!url || !serviceKey) return null;
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  return {
    async request(resource, options = {}) {
      const response = await fetchImpl(`${base}/${resource}`, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...(options.headers || {}) },
      });
      if (!response.ok) throw new Error(`Supabase ${resource.split("?")[0]}: HTTP ${response.status} ${await response.text()}`);
      return response;
    },
  };
}

module.exports = { createSupabase };
