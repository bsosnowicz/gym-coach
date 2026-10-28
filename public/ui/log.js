// Dwa strumienie logów widoczne na stronie. Jedyne miejsce, które wie, jak
// wpis trafia na ekran — reszta aplikacji woła log() i nie dotyka DOM.
//
// Poza wypisaniem na stronę log() rozsyła wpis do subskrybentów (onLog). Dzięki
// temu loader sesji może podpisywać spinner ostatnim komunikatem, a ten moduł
// nie musi o loaderze wiedzieć — inaczej "wypisz linijkę" i "pokaż postęp
// łączenia" byłyby na stałe zrośnięte i nie dałoby się ruszyć jednego bez
// drugiego.

// Looked up on every write: in the React app the panels appear only once the
// session screen is mounted, after this module has been imported.
const panel = (id) => document.getElementById(id);

const listeners = [];

// HH:MM:SS.mmm — logi są tu narzędziem pomiarowym (latencja odpowiedzi liczona
// z timestampów), więc milisekundy są istotne.
export const timestamp = () => new Date().toISOString().slice(11, 23);

export function onLog(listener) {
  listeners.push(listener);
}

export function log(msg) {
  const at = timestamp();
  const logEl = panel("log");
  if (logEl) {
    logEl.textContent += `\n[${at}] ${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log(`[${at}] ${msg}`);
  for (const listener of listeners) listener(msg);
}

// Maskuje sekrety, zanim cokolwiek z odpowiedzi dostawcy trafi na ekran —
// payloady sesji potrafią nieść tokeny, a panel bywa pokazywany na demo.
export function sanitizeProviderOutput(value) {
  const sensitiveKey = /(?:token|api[_-]?key|authorization|secret|password)/i;
  const seen = new WeakSet();
  const json = JSON.stringify(value, (key, current) => {
    if (sensitiveKey.test(key)) return "[MASKED]";
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) return "[Circular]";
      seen.add(current);
    }
    return current;
  }, 2);
  return json || String(value);
}

export function logProviderOutput(provider, event, payload) {
  const entry = `[${timestamp()}] ${provider} · ${event}\n${sanitizeProviderOutput(payload)}`;
  const providerOutputEl = panel("provider-output");
  if (providerOutputEl) {
    providerOutputEl.textContent += `\n${entry}`;
    providerOutputEl.scrollTop = providerOutputEl.scrollHeight;
  }
  console.debug(entry);
}
