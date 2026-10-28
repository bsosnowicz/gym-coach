// LLM adapter for the chat-completions protocol that both Gemini and Groq
// expose: streaming, retries on 429/503 and network errors, and a race against
// a fallback provider.

const { httpProblem } = require("../../engine/provider-failure");

const RETRY_DELAYS_MS = [300, 800];
const RETRY_JITTER_MS = 150;
const RETRYABLE_STATUSES = new Set([429, 503]);
// A provider out of quota may ask for tens of seconds; in a live conversation
// that is a failure, so above this cap we do not retry at all.
const RETRY_AFTER_MAX_MS = 2500;
// After this much silence from the primary, the fallback joins the race.
const HEDGE_DELAY_MS = 2500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = () => {};

// Retry-After is either seconds or an HTTP date (RFC 7231).
function parseRetryAfterMs(response) {
  const raw = response.headers?.get?.("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function waitWithAbort(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function foldSystemMessages(messages) {
  const systemParts = [];
  const rest = [];
  for (const message of messages) {
    if (message.role === "system") systemParts.push(message.content);
    else rest.push(message);
  }
  const merged = systemParts.filter(Boolean).join("\n\n");
  if (!merged || systemParts.length <= 1) return messages;
  return [{ role: "system", content: merged }, ...rest];
}

// Applies per-provider quirks so the engine can send the same messages to anyone.
function prepareMessages(provider, messages, fillerUserMessage) {
  const prepared = provider.mergeSystemMessages ? foldSystemMessages(messages) : messages;
  if (provider.requiresUserMessage && prepared.at(-1)?.role !== "user") {
    return [...prepared, { role: "user", content: fillerUserMessage }];
  }
  return prepared;
}

// Returns the start time of the LAST attempt, so time-to-first-token is measured
// from the request that actually answered.
async function fetchWithRetry(provider, request, signal, hooks = {}) {
  const onEvent = hooks.onEvent || noop;
  const delays = Array.isArray(provider.retryDelaysMs) ? provider.retryDelaysMs : RETRY_DELAYS_MS;
  const jitterMs = Number.isFinite(provider.retryJitterMs) ? Math.max(0, provider.retryJitterMs) : RETRY_JITTER_MS;
  const base = { provider: provider.name, model: provider.model };
  for (let attempt = 1; ; attempt += 1) {
    hooks.onAttemptStarted?.(attempt);
    const startedAt = performance.now();
    const retryIndex = attempt - 1;
    let response;
    try {
      response = await request();
    } catch (error) {
      if (signal?.aborted) throw error;
      const responseMs = Math.round(performance.now() - startedAt);
      if (retryIndex >= delays.length) {
        onEvent("llm_request_failed", { ...base, attempt, reason: "network_error", responseMs });
        throw error;
      }
      hooks.onRetryScheduled?.(attempt);
      const delayMs = Math.round(Math.max(0, Number(delays[retryIndex]) || 0) + Math.random() * jitterMs);
      onEvent("llm_retry_scheduled", { ...base, attempt, reason: "network_error", responseMs, delayMs });
      await waitWithAbort(delayMs, signal);
      continue;
    }
    const responseMs = Math.round(performance.now() - startedAt);
    const retryable = RETRYABLE_STATUSES.has(response.status);
    const retryAfterMs = retryable ? parseRetryAfterMs(response) : null;
    const retryAfterTooLong = retryAfterMs !== null && retryAfterMs > RETRY_AFTER_MAX_MS;
    if (retryable && retryIndex < delays.length && !retryAfterTooLong) {
      hooks.onRetryScheduled?.(attempt);
      // Retry-After raises the floor but never removes the jitter, otherwise
      // every session hit by the same spike returns in the same millisecond.
      const baseDelay = Math.max(0, Number(delays[retryIndex]) || 0);
      const delayMs = Math.round(Math.max(baseDelay, retryAfterMs ?? 0) + Math.random() * jitterMs);
      onEvent("llm_retry_scheduled", { ...base, attempt, reason: "http_status", statusCode: response.status, responseMs, delayMs });
      try { await response.body?.cancel(); } catch (_) {}
      await waitWithAbort(delayMs, signal);
      continue;
    }
    if (!response.ok) {
      onEvent("llm_request_failed", { ...base, attempt, reason: "http_status", statusCode: response.status, responseMs });
    }
    return { response, attempt, startedAt };
  }
}

// onUsage gets the token counts of the stream once it ends, also when the
// reader stops early (barge-in). Gemini repeats the running total in every
// chunk and Groq sends it once at the end, so the last one seen is the total.
async function* readDeltas(response, onUsage = noop) {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  try {
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        let json;
        try { json = JSON.parse(data); } catch (_) { continue; }
        if (json?.usage) usage = json.usage;
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    if (usage) onUsage(usage);
  }
}

function createLlm({
  primary,
  fallback = null,
  temperature = 0.35,
  maxTokens = 250,
  hedgeDelayMs = HEDGE_DELAY_MS,
  fillerUserMessage = "(continue)",
}) {
  if (!primary) throw new Error("createLlm: brak konfiguracji głównego dostawcy LLM.");

  // Tokens of every answered call since the process started, per model. A
  // race loser cancelled mid-answer is billed too, but its count never arrives.
  const usage = {};
  function countUsage(model, reported) {
    if (!reported) return;
    const total = (usage[model] ||= { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    total.calls += 1;
    total.inputTokens += reported.prompt_tokens || 0;
    total.cachedTokens += reported.prompt_tokens_details?.cached_tokens || 0;
    total.outputTokens += reported.completion_tokens || 0;
  }

  function post(provider, messages, signal, stream, tokens = maxTokens) {
    return fetch(provider.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      signal,
      body: JSON.stringify({
        model: provider.model,
        temperature,
        max_tokens: tokens,
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        messages: prepareMessages(provider, messages, fillerUserMessage),
        ...provider.extraBody,
      }),
    });
  }

  // One contestant of the race. It owns its AbortController so the loser can be
  // cancelled alone, while an outer abort (barge-in, watchdog) still stops both.
  // request: { stream, tokens } of the call being raced.
  function startRequest(provider, messages, outerSignal, hooks, request) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", forwardAbort, { once: true });

    // Retries live INSIDE the contestant: a transient 429 on the primary is
    // retried there and does not hand the turn to the fallback.
    const promise = fetchWithRetry(provider, () => post(provider, messages, controller.signal, request.stream, request.tokens), controller.signal, hooks)
      .then((result) => {
        // An unusable response must reject, or Promise.any would pick it as the winner.
        if (!result.response.ok || !result.response.body) {
          const error = new Error(httpProblem(result.response.status));
          error.httpStatus = result.response.status;
          throw error;
        }
        return { provider, ...result };
      });
    // The loser rejects after the winner is chosen, with nobody listening.
    promise.catch(noop);

    return {
      provider,
      promise,
      cancel() {
        outerSignal.removeEventListener("abort", forwardAbort);
        controller.abort();
      },
    };
  }

  // A provider under load may accept the request and answer with a valid HTTP 200
  // after many seconds. No error handler can tell that from a healthy reply, only
  // the clock can, so past the threshold a second provider is asked in parallel.
  // The primary still wins if it answers first.
  async function race(messages, signal, hooks, request = { stream: true, tokens: maxTokens }) {
    const first = startRequest(primary, messages, signal, hooks, request);
    if (!fallback) return first.promise;

    const early = await Promise.race([
      first.promise.then((won) => ({ won }), (error) => ({ error })),
      sleep(hedgeDelayMs).then(() => ({ slow: true })),
    ]);
    if (early.won) return early.won;
    if (signal.aborted) throw early.error || new DOMException("Aborted", "AbortError");

    const second = startRequest(fallback, messages, signal, { onEvent: hooks.onEvent }, request);
    hooks.onEvent?.("llm_hedge", {
      primary: primary.model,
      fallback: fallback.model,
      reason: early.slow ? "slow" : early.error.message,
    });
    try {
      // Promise.any, not race: one provider's rejection is exactly when we wait for the other.
      const winner = await Promise.any([first.promise, second.promise]);
      (winner.provider === primary ? second : first).cancel();
      return winner;
    } catch (aggregate) {
      throw early.error || aggregate.errors?.[0] || aggregate;
    }
  }

  return {
    primary,
    fallback,
    usage: () => structuredClone(usage),

    // Resolves once a provider accepted the request; `deltas` then yields text fragments.
    async streamChat({ messages, signal = new AbortController().signal, onEvent = noop, onAttemptStarted, onRetryScheduled }) {
      const served = await race(messages, signal, { onEvent, onAttemptStarted, onRetryScheduled });
      return {
        deltas: readDeltas(served.response, (reported) => countUsage(served.provider.model, reported)),
        attempt: served.attempt,
        startedAt: served.startedAt,
        model: served.provider.model,
        provider: served.provider.name,
      };
    },

    // Non-streaming call, for work off the critical path (lesson material, goal
    // matching, summaries). Raced like a reply: a primary that is slow for
    // everyone would otherwise make each of these calls run out of time.
    // maxTokens: structured output (JSON) needs far more room than a spoken reply.
    async complete({ messages, signal = new AbortController().signal, onEvent = noop, maxTokens: tokens = maxTokens }) {
      const served = await race(messages, signal, { onEvent }, { stream: false, tokens });
      const completion = await served.response.json();
      countUsage(served.provider.model, completion?.usage);
      return completion?.choices?.[0]?.message?.content || "";
    },
  };
}

module.exports = { createLlm, foldSystemMessages, prepareMessages, parseRetryAfterMs };
