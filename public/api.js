// Every call the page makes to the server. No auth: the server is local-only for now.
import { log, logProviderOutput } from "./ui/log.js";

export function apiFetch(input, init = {}) {
  return fetch(input, init);
}

function postJson(path, body) {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const parseJson = (res) => res.json().catch(() => ({}));

export async function startSession(setup = {}) {
  const res = await postJson("/api/session/start", setup);
  const data = await parseJson(res);
  logProviderOutput("server", `HTTP /api/session/start (${res.status})`, data);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// The avatar session stays active on the provider side until it is explicitly closed.
export async function endSession(sessionId) {
  if (!sessionId) return;
  try {
    const res = await postJson("/api/session/end", { sessionId });
    if (!res.ok) throw new Error((await parseJson(res)).error || `HTTP ${res.status}`);
  } catch (e) {
    log(`(Nie udało się zamknąć sesji po stronie serwera: ${e.message})`);
  }
}

export function openEvents(sessionId) {
  return new EventSource(`/api/session/events?sessionId=${encodeURIComponent(sessionId)}`);
}

// Not awaited by callers: the reply arrives over SSE and the avatar.
export function sendTurn(sessionId, text) {
  postJson("/api/session/turn", { sessionId, text })
    .then(async (res) => {
      if (!res.ok) log(`(Serwer odrzucił turę: HTTP ${res.status} — ${(await parseJson(res)).error || "brak szczegółów"})`);
    })
    .catch((e) => log(`(Nie udało się wysłać tury: ${e.message})`));
}

export function interrupt(sessionId) {
  postJson("/api/session/interrupt", { sessionId })
    .catch((e) => log(`(Nie udało się przerwać: ${e.message})`));
}

export function resume(sessionId) {
  postJson("/api/session/resume", { sessionId })
    .catch((e) => log(`(Nie udało się wznowić: ${e.message})`));
}

// The break and the end by button (see src/engine/session-control.js).
async function postSession(path, sessionId) {
  const res = await postJson(path, { sessionId });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export const pauseSession = (sessionId) => postSession("/api/session/pause", sessionId);
export const askEnd = (sessionId) => postSession("/api/session/ask-end", sessionId);
export const continueSession = (sessionId) => postSession("/api/session/continue", sessionId);
// Resolves once the goodbye has been said.
export const finishSession = (sessionId) => postSession("/api/session/finish", sessionId);

export async function handoverReady(sessionId, handoverId) {
  const res = await postJson("/api/session/handover-ready", { sessionId, handoverId });
  if (!res.ok) throw new Error(`Potwierdzenie nowego awatara: HTTP ${res.status}`);
  return parseJson(res);
}

// What only the browser knows (a hanging microphone, reply times) goes to the
// session recorder. Not awaited: a lost report must not disturb the session.
export function report(sessionId, action, details = {}) {
  if (!sessionId) return;
  postJson("/api/session/report", { sessionId, action, details })
    .then((res) => { if (!res.ok) log(`(Raport ${action} odrzucony: HTTP ${res.status})`); })
    .catch(() => {});
}
