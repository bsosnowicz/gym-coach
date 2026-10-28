// What one session used of the paid services: the difference of two snapshots
// of the adapters' counters ({ llm: { [model]: counts }, tts, stt }), as one
// line for the server log. The counters are process-wide, so a session running
// at the same time would be counted in too; with one learner there is none.

const minus = (after, before = {}) => Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] || 0)]));

function diffUsage(before, after) {
  const llm = Object.fromEntries(Object.entries(after.llm)
    .map(([model, total]) => [model, minus(total, before.llm[model])])
    .filter(([, spent]) => spent.calls > 0));
  return { llm, tts: minus(after.tts, before.tts), stt: minus(after.stt, before.stt) };
}

function usageLine({ llm, tts, stt }, minutes) {
  const models = Object.entries(llm).map(([model, spent]) =>
    `${model}: ${spent.calls} wywołań, wejście ${spent.inputTokens} tokenów (z cache ${spent.cachedTokens}), wyjście ${spent.outputTokens}`);
  return [
    ...(models.length ? models : ["LLM: brak wywołań"]),
    `TTS: ${tts.characters} znaków`,
    `STT: ${stt.requests} zapytań, ${Math.round(stt.audioSeconds)} s nagrań (${Math.round(stt.billedSeconds)} s do rozliczenia)`,
    `czas sesji: ${minutes.toFixed(1)} min`,
  ].join(" · ");
}

module.exports = { diffUsage, usageLine };
