// Both vendors expose the same chat-completions protocol, so they differ only
// by this table. Adding a vendor with the same protocol is one more entry.
const LLM_PROVIDERS = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKeyEnv: "GEMINI_API_KEY",
    model: (env) => env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    // Allowed values depend on the model, so it is tuned together with GEMINI_MODEL.
    extraBody: (env) => ({ reasoning_effort: env.GEMINI_REASONING_EFFORT || "minimal" }),
    // Gemini's OpenAI layer maps every "system" message to systemInstruction:
    //   [system]            -> 400 "contents is not specified"
    //   [system, assistant] -> 400 "Requests ending with a model turn are not supported"
    //   [system, user]      -> 200
    requiresUserMessage: true,
    // The same layer does not reliably combine several "system" messages; a
    // trailing one could drop the main prompt entirely.
    mergeSystemMessages: true,
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    model: (env) => env.GROQ_MODEL || "openai/gpt-oss-20b",
    // Reasoning tokens count against max_tokens; above "low" this model can
    // spend the whole budget thinking and return empty content.
    extraBody: (env) => ({ reasoning_effort: env.GROQ_REASONING_EFFORT || "low" }),
  },
};

// Returns null when the key is missing, so an optional fallback simply does not exist.
function llmConfig(name, env = process.env) {
  const provider = LLM_PROVIDERS[name];
  if (!provider) throw new Error(`Nieznany dostawca LLM: ${name}`);
  const apiKey = env[provider.apiKeyEnv];
  if (!apiKey) return null;
  return {
    name,
    url: provider.url,
    apiKey,
    model: provider.model(env),
    extraBody: provider.extraBody(env),
    requiresUserMessage: Boolean(provider.requiresUserMessage),
    mergeSystemMessages: Boolean(provider.mergeSystemMessages),
  };
}

module.exports = { LLM_PROVIDERS, llmConfig };
