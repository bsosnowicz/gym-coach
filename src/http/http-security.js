const MAX_JSON_BODY_BYTES = 1024 * 1024;

// LiveAvatar hands back a different livekit_url per session, not a fixed host
// known ahead of time, so wss:/https: stay open in connect-src for that one case.
const CONNECT_SRC = "'self' https: wss:";

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' https://esm.sh",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${CONNECT_SRC}`,
    "worker-src 'self' blob:",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  // Browsers ignore this header entirely over a plain HTTP response (per
  // spec), so it is inert in local dev and only takes effect once the
  // production reverse proxy actually terminates TLS — safe to send always.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
});

class HttpError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.expose = true;
  }
}

// The optional camera module (YOLO_POSE_WS_URL): the page may open the camera
// and stream frames to the YOLO service, which usually runs on its own port.
// Without it the camera stays blocked, as in the template.
let cameraHeaders = null;

function enableCamera(yoloUrl) {
  const url = new URL(yoloUrl, "http://localhost");
  // A relative address ("/yolo/ws/analyze") is the page's own host: 'self' covers it.
  const yoloSource = /^wss?:\/\//i.test(yoloUrl) ? ` ${url.protocol}//${url.host}` : "";
  cameraHeaders = {
    "Content-Security-Policy": SECURITY_HEADERS["Content-Security-Policy"]
      .replace(`connect-src ${CONNECT_SRC}`, `connect-src ${CONNECT_SRC}${yoloSource}`),
    "Permissions-Policy": SECURITY_HEADERS["Permissions-Policy"].replace("camera=()", "camera=(self)"),
  };
}

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...cameraHeaders })) res.setHeader(name, value);
}

function sendJson(res, status, data) {
  applySecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res, error, { statusCode, fallback = "Nie udało się obsłużyć żądania." } = {}) {
  const status = statusCode || error?.statusCode || 500;
  const message = status < 500 || error?.expose === true
    ? error?.message || fallback
    : fallback;
  if (error?.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
  sendJson(res, status, { error: message });
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        if (!rejected) {
          rejected = true;
          reject(new HttpError(`Body żądania przekracza limit ${maxBytes} bajtów.`, 413));
        }
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

/**
 * Reads a JSON request without allowing an unauthenticated-size memory spike.
 * Throws an exposed 400/413 HttpError for malformed or oversized input.
 */
function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let receivedBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        if (!rejected) {
          rejected = true;
          reject(new HttpError(`Body żądania przekracza limit ${maxBytes} bajtów.`, 413));
        }
        return;
      }
      if (!rejected) raw += chunk;
    });
    req.on("end", () => {
      if (rejected) return;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new HttpError("Nieprawidłowy JSON w body żądania.", 400));
      }
    });
    req.on("error", reject);
  });
}

function createFixedWindowRateLimiter({ limit, windowMs, message }) {
  const buckets = new Map();
  return function consume(key, now = Date.now()) {
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    if (bucket.count >= limit) {
      const error = new HttpError(message || "Zbyt wiele żądań. Spróbuj ponownie później.", 429);
      error.retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw error;
    }
    bucket.count += 1;
    buckets.set(key, bucket);

    // User ids are bounded in normal operation; this prevents stale buckets
    // from becoming an unbounded process-lifetime cache after abuse.
    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }
  };
}

module.exports = {
  HttpError,
  MAX_JSON_BODY_BYTES,
  SECURITY_HEADERS,
  applySecurityHeaders,
  enableCamera,
  createFixedWindowRateLimiter,
  readJsonBody,
  readRawBody,
  sendError,
  sendJson,
};
