// The one place that talks to Supabase: plain REST (PostgREST) through fetch,
// since the server has no npm dependencies. The server key bypasses
// row-level security, so every caller names the user in its resource.

const REQUEST_TIMEOUT_MS = 5000;

// null without SUPABASE_URL or the key: callers then keep nothing between sessions.
function createSupabase({ url, serviceKey, fetchImpl = fetch } = {}) {
  if (!url || !serviceKey) return null;
  // Tolerates the REST address pasted whole ("…/rest/v1"), which would double the path.
  const base = `${url.replace(/\/+$/, "").replace(/\/rest\/v1$/, "")}/rest/v1`;
  // A secret key (sb_secret_…) is not a JWT: it goes in apikey only.
  const headers = { apikey: serviceKey };
  if (!serviceKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${serviceKey}`;
  return {
    async request(resource, options = {}) {
      const response = await fetchImpl(`${base}/${resource}`, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { ...headers, ...(options.headers || {}) },
      });
      if (!response.ok) throw new Error(`Supabase ${resource.split("?")[0]}: HTTP ${response.status} ${await response.text()}`);
      return response;
    },
  };
}

// What is wrong with the Supabase settings, before any request: [{ level, text }].
// For scripts/check-supabase.js; level "error" means nothing can be saved.
function checkSupabaseEnv(env) {
  const problems = [];
  const keyName = env.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null;
  const key = keyName ? env[keyName] : "";
  const error = (text) => problems.push({ level: "error", text });
  const warn = (text) => problems.push({ level: "warn", text });

  if (!env.SUPABASE_URL) error("Brak SUPABASE_URL.");
  else {
    let url = null;
    try { url = new URL(env.SUPABASE_URL); } catch (_) { error(`SUPABASE_URL to nie adres: „${env.SUPABASE_URL}”.`); }
    if (url && url.pathname.replace(/\/$/, "") && url.pathname.replace(/\/$/, "") !== "/rest/v1") error(`SUPABASE_URL ma ścieżkę „${url.pathname}” — wpisz sam adres projektu, np. https://abcd.supabase.co (bez /rest/v1).`);
    if (url && url.pathname.replace(/\/$/, "") === "/rest/v1") warn("SUPABASE_URL kończy się na /rest/v1 — działa, ale wystarczy sam adres projektu.");
    if (url && url.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) warn("SUPABASE_URL bez https.");
  }

  if (!keyName) {
    error(env.SUPABASE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
      ? "Klucz jest pod nazwą, której serwer nie czyta. Użyj SUPABASE_SECRET_KEY (sb_secret_…) albo SUPABASE_SERVICE_ROLE_KEY (JWT)."
      : "Brak SUPABASE_SECRET_KEY (ani SUPABASE_SERVICE_ROLE_KEY).");
  } else if (key.startsWith("sb_publishable_")) {
    error(`${keyName} to klucz publishable — on nie może zapisywać. Weź Secret key (sb_secret_…) z Project Settings → API Keys.`);
  } else if (key.startsWith("eyJ")) {
    let role = null;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role; } catch (_) { error(`${keyName} wygląda na JWT, ale nie da się go odczytać.`); }
    if (role && role !== "service_role") error(`${keyName} to klucz z rolą „${role}” — potrzebny service_role (albo sb_secret_…).`);
  } else if (!key.startsWith("sb_secret_")) {
    warn(`${keyName} nie wygląda ani na sb_secret_…, ani na JWT — sprawdź, czy skopiowany w całości.`);
  }
  if (/\s|["']/.test(key)) error(`${keyName} zawiera spację albo cudzysłów w środku.`);
  if (!env.GYM_COACH_USER_ID) warn("Brak GYM_COACH_USER_ID — zapisy idą na użytkownika „local”.");
  return { keyName, problems };
}

// A failed request in words: what to fix for the usual PostgREST answers.
function explainSupabaseError(status, body) {
  if (/PGRST205|42P01|Could not find the table/i.test(body)) return "tabeli nie ma — uruchom migracje z supabase/migrations/ (SQL Editor).";
  if (status === 401 || /Invalid API key|JWT/i.test(body)) return "Supabase nie przyjmuje klucza — zły klucz albo z innego projektu niż SUPABASE_URL.";
  if (/42501|permission denied/i.test(body)) return "brak uprawnień — klucz nie jest serwerowy (service_role / sb_secret_) albo migracja nie nadała grantów.";
  if (/23514|check constraint/i.test(body)) return "wartość spoza listy w tabeli (np. body_part) — migracja jest starsza niż kod?";
  if (status === 404) return "zły adres — SUPABASE_URL nie wskazuje projektu Supabase.";
  return "nieznany błąd, treść odpowiedzi wyżej.";
}

module.exports = { createSupabase, checkSupabaseEnv, explainSupabaseError };
