// Smoke test against the REAL providers. Run by hand, never from `npm test`:
// it spends API quota.
//
//   npm run smoke              one exchange through the LLM (Gemini, Groq as fallback)
//   npm run smoke -- --avatar  also starts and stops a LiveAvatar Lite session
//
// ENV_FILE=/path/to/.env points at a different env file.

const { loadEnvFile, requireEnv } = require("../src/config");
loadEnvFile();

const { createLlm } = require("../src/adapters/llm/chat-completions");
const { llmConfig } = require("../src/adapters/llm/providers");
const { createLiveAvatarLite } = require("../src/adapters/avatar/liveavatar-lite");
const { createCoach } = require("../src/coach");

async function smokeLlm() {
  requireEnv("GEMINI_API_KEY");
  const coach = createCoach({ voiceId: "unused" });
  const llm = createLlm({ primary: llmConfig("gemini"), fallback: llmConfig("groq") });
  const served = await llm.streamChat({
    messages: coach.buildMessages({ history: [] }, { userText: null }),
    signal: AbortSignal.timeout(30000),
    onEvent: (name, details) => console.log(`  (${name}: ${JSON.stringify(details)})`),
  });
  let reply = "";
  let ttftMs = null;
  for await (const delta of served.deltas) {
    if (ttftMs === null) ttftMs = Math.round(performance.now() - served.startedAt);
    reply += delta;
  }
  if (!reply.trim()) throw new Error("LLM zwrócił pustą odpowiedź.");
  console.log(`LLM OK · ${served.provider}/${served.model} · TTFT ${ttftMs} ms`);
  console.log(`  odpowiedź: ${reply.trim()}`);
}

async function smokeAvatar() {
  const sandbox = process.env.LIVEAVATAR_SANDBOX !== "false";
  const avatar = createLiveAvatarLite({
    apiKey: requireEnv("LIVEAVATAR_API_KEY"),
    avatarId: process.env.LIVEAVATAR_AVATAR_ID || null,
    sandbox,
  });
  const handle = await avatar.start();
  try {
    if (!handle.client.livekitUrl || !handle.client.livekitToken) throw new Error("Brak danych LiveKit w odpowiedzi.");
    console.log(`LiveAvatar OK · sesja ${handle.sessionId} · sandbox=${sandbox} · WebSocket połączony`);
  } finally {
    // Always: an account allows one concurrent session.
    await handle.stop();
    console.log("LiveAvatar: sesja zatrzymana.");
  }
}

(async () => {
  await smokeLlm();
  if (process.argv.includes("--avatar")) await smokeAvatar();
  else console.log("LiveAvatar pominięty (dodaj --avatar).");
})().catch((error) => {
  console.error(`SMOKE FAILED: ${error.message}`);
  process.exitCode = 1;
});
