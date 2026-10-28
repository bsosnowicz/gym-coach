// Messages shown to the user; override with configureProviderMessages().
const PROVIDER_MESSAGES = {
  stt: "Nie mogę teraz rozpoznać mowy. Usługa transkrypcji jest chwilowo niedostępna — spróbuj ponownie za chwilę.",
  llm: "Nie mogę teraz przygotować odpowiedzi. Model językowy jest chwilowo niedostępny — spróbuj ponownie za chwilę.",
  tts: "Nie mogę teraz odtworzyć głosu. Synteza mowy jest chwilowo niedostępna — spróbuj ponownie za chwilę.",
  avatar: "Nie mogę teraz połączyć się z awatarem. Usługa jest chwilowo niedostępna — spróbuj ponownie za chwilę.",
};

function configureProviderMessages(overrides = {}) {
  Object.assign(PROVIDER_MESSAGES, overrides);
}

// The message is always the safe public text; provider details stay in `cause`.
class ProviderFailure extends Error {
  constructor(service, { cause = null, code = "provider_unavailable" } = {}) {
    const normalizedService = Object.hasOwn(PROVIDER_MESSAGES, service) ? service : "avatar";
    super(PROVIDER_MESSAGES[normalizedService], cause ? { cause } : undefined);
    this.name = "ProviderFailure";
    this.service = normalizedService;
    this.code = code;
    this.statusCode = 503;
    this.expose = true;
  }
}

// A provider's HTTP status as the server log shows it. A rejected key is a
// configuration problem, not an outage: retrying will not help, so it says so.
function httpProblem(status) {
  return status === 401 || status === 403 ? `HTTP ${status} — nieprawidłowy albo wygasły klucz API` : `HTTP ${status}`;
}

function providerFailure(service, cause = null, options = {}) {
  if (cause instanceof ProviderFailure) return cause;
  return new ProviderFailure(service, { cause, ...options });
}

function publicProviderFailure(error, fallbackService) {
  const failure = providerFailure(error?.service || fallbackService, error);
  return {
    stage: "provider_error",
    service: failure.service,
    code: failure.code,
    message: failure.message,
    retryable: true,
  };
}

module.exports = {
  PROVIDER_MESSAGES,
  ProviderFailure,
  configureProviderMessages,
  httpProblem,
  providerFailure,
  publicProviderFailure,
};
