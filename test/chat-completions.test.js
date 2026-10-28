const test = require("node:test");
const assert = require("node:assert/strict");

const { createLlm, prepareMessages } = require("../src/adapters/llm/chat-completions");
const { sseStream } = require("./helpers");

const provider = (name, extra = {}) => ({
  name,
  url: `https://${name}.invalid/chat`,
  apiKey: "test-key",
  model: `${name}-model`,
  extraBody: {},
  retryDelaysMs: [0, 0],
  retryJitterMs: 0,
  ...extra,
});

async function withFetch(fake, run) {
  const previous = global.fetch;
  global.fetch = fake;
  try { return await run(); } finally { global.fetch = previous; }
}

async function readAll(served) {
  let text = "";
  for await (const delta of served.deltas) text += delta;
  return text;
}

const messages = [{ role: "system", content: "s" }, { role: "user", content: "u" }];

test("LLM ponawia 429/503 dwa razy i oddaje numer udanej trzeciej próby", async () => {
  let calls = 0;
  const events = [];
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async () => {
    calls += 1;
    if (calls === 1) return new Response("{}", { status: 429 });
    if (calls === 2) return new Response("{}", { status: 503 });
    return sseStream("Gotowe.");
  }, async () => {
    const served = await llm.streamChat({ messages, onEvent: (name, details) => events.push([name, details]) });
    assert.equal(served.attempt, 3);
    assert.equal(await readAll(served), "Gotowe.");
  });
  assert.equal(calls, 3);
  assert.deepEqual(events.map(([name, details]) => [name, details.statusCode]), [
    ["llm_retry_scheduled", 429],
    ["llm_retry_scheduled", 503],
  ]);
});

test("LLM respektuje krótki Retry-After dostawcy", async () => {
  let calls = 0;
  const events = [];
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async () => {
    calls += 1;
    if (calls === 1) return new Response("{}", { status: 429, headers: { "Retry-After": "0.05" } });
    return sseStream("ok");
  }, () => llm.streamChat({ messages, onEvent: (name, details) => events.push(details) }));
  assert.equal(calls, 2);
  assert.equal(events[0].delayMs, 50);
});

test("LLM rezygnuje z ponowienia, gdy Retry-After przekracza sensowny pułap", async () => {
  let calls = 0;
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async () => {
    calls += 1;
    return new Response("{}", { status: 429, headers: { "Retry-After": "30" } });
  }, () => assert.rejects(llm.streamChat({ messages }), (error) => error.httpStatus === 429));
  assert.equal(calls, 1);
});

test("LLM ponawia błąd sieci, a po wyczerpaniu prób go zgłasza", async () => {
  let calls = 0;
  const events = [];
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  }, () => assert.rejects(llm.streamChat({ messages, onEvent: (name) => events.push(name) }), /ECONNRESET/));
  assert.equal(calls, 3);
  assert.deepEqual(events, ["llm_retry_scheduled", "llm_retry_scheduled", "llm_request_failed"]);
});

test("przejściowy 429 ponawia się u tego samego dostawcy, bez budzenia zapasu", async () => {
  const calls = { primary: 0, fallback: 0 };
  const events = [];
  const llm = createLlm({ primary: provider("primary"), fallback: provider("fallback") });
  await withFetch(async (url) => {
    if (String(url).includes("primary")) {
      calls.primary += 1;
      return calls.primary === 1 ? new Response("{}", { status: 429 }) : sseStream("Z głównego.");
    }
    calls.fallback += 1;
    return sseStream("Z zapasu.");
  }, async () => {
    const served = await llm.streamChat({ messages, onEvent: (name) => events.push(name) });
    assert.equal(served.provider, "primary");
  });
  assert.deepEqual(calls, { primary: 2, fallback: 0 });
  assert.ok(!events.includes("llm_hedge"));
});

test("milczący dostawca przegrywa wyścig z zapasowym i zostaje anulowany", async () => {
  const events = [];
  let primaryAborted = false;
  const llm = createLlm({ primary: provider("primary"), fallback: provider("fallback"), hedgeDelayMs: 20 });
  await withFetch(async (url, init) => {
    if (String(url).includes("primary")) {
      // An overloaded provider: no refusal, just silence.
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          primaryAborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        }, { once: true });
      });
    }
    return sseStream("Z zapasu.");
  }, async () => {
    const served = await llm.streamChat({ messages, onEvent: (name) => events.push(name) });
    assert.equal(served.provider, "fallback");
    assert.equal(await readAll(served), "Z zapasu.");
  });
  assert.ok(events.includes("llm_hedge"));
  assert.equal(primaryAborted, true);
});

test("szybki dostawca zamyka turę bez budzenia zapasu", async () => {
  let fallbackCalls = 0;
  const llm = createLlm({ primary: provider("primary"), fallback: provider("fallback"), hedgeDelayMs: 200 });
  await withFetch(async (url) => {
    if (String(url).includes("fallback")) fallbackCalls += 1;
    return sseStream("Z głównego.");
  }, async () => {
    assert.equal((await llm.streamChat({ messages })).provider, "primary");
  });
  assert.equal(fallbackCalls, 0);
});

test("complete bez strumienia też ściga się z zapasowym, gdy główny dostawca milczy", async () => {
  const bodies = [];
  const llm = createLlm({ primary: provider("primary"), fallback: provider("fallback"), hedgeDelayMs: 20 });
  const answer = await withFetch(async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (String(url).includes("primary")) {
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
    }
    return Response.json({ choices: [{ message: { content: '{"lessons":[]}' } }] });
  }, () => llm.complete({ messages, maxTokens: 2000 }));
  assert.equal(answer, '{"lessons":[]}');
  assert.deepEqual(bodies.map((body) => [body.stream, body.max_tokens]), [[undefined, 2000], [undefined, 2000]]);
});

test("LLM liczy tokeny: ze strumienia ostatnią sumę (Gemini powtarza ją w każdym fragmencie), z complete pole usage", async () => {
  const chunk = (text, usage) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }], usage })}\n\n`;
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (!body.stream) {
      return Response.json({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } } });
    }
    assert.deepEqual(body.stream_options, { include_usage: true });
    return new Response(chunk("Guten", { prompt_tokens: 10, completion_tokens: 2 }) + chunk(" Tag", { prompt_tokens: 10, completion_tokens: 7 }) + "data: [DONE]\n\n");
  }, async () => {
    assert.equal(await readAll(await llm.streamChat({ messages })), "Guten Tag");
    await llm.complete({ messages });
  });
  assert.deepEqual(llm.usage(), { "primary-model": { calls: 2, inputTokens: 110, cachedTokens: 64, outputTokens: 27 } });
});

test("complete zgłasza odrzucony klucz jako błąd z kodem HTTP", async () => {
  const llm = createLlm({ primary: provider("primary") });
  await withFetch(async () => new Response("{}", { status: 401 }), () => assert.rejects(
    llm.complete({ messages }),
    (error) => error.httpStatus === 401 && /wygasły klucz/.test(error.message),
  ));
});

test("prepareMessages zwija wiadomości system i dokłada wiadomość user, gdy dostawca tego wymaga", () => {
  const quirky = { mergeSystemMessages: true, requiresUserMessage: true };
  const input = [
    { role: "system", content: "A" },
    { role: "assistant", content: "cześć" },
    { role: "system", content: "B" },
  ];
  assert.deepEqual(prepareMessages(quirky, input, "(continue)"), [
    { role: "system", content: "A\n\nB" },
    { role: "assistant", content: "cześć" },
    { role: "user", content: "(continue)" },
  ]);
  assert.equal(prepareMessages({}, input, "(continue)"), input);
});
