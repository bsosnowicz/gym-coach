// Events only the browser knows (POST /api/session/report), on their way to the
// session recorder. The page is not trusted: only listed actions get through,
// and details are cut down to flat, short values.

const { HttpError } = require("./http-security");

const REPORT_ACTIONS = new Set(["mic_blocked", "mic_unblocked", "turn_latency", "mic_calibrated", "mic_stats"]);
const MAX_DETAIL_KEYS = 30;
const MAX_STRING_LENGTH = 200;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

function cleanValue(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  return undefined;
}

function browserReport(body) {
  const action = body?.action;
  if (!REPORT_ACTIONS.has(action)) throw new HttpError("Nieznany rodzaj raportu.", 400);
  const details = {};
  const source = body.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : {};
  for (const [key, value] of Object.entries(source).slice(0, MAX_DETAIL_KEYS)) {
    const clean = cleanValue(value);
    if (KEY_PATTERN.test(key) && clean !== undefined) details[key] = clean;
  }
  return { action, details };
}

module.exports = { REPORT_ACTIONS, browserReport };
