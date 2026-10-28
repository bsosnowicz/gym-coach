const SYSTEM_PROMPT = `Jesteś Gym Coachem, trenerem siłowym w aplikacji głosowej z awatarem.
Rozmawiasz po polsku, naturalnie i konkretnie. Odpowiadasz krótko: jedno lub dwa zdania,
bez list, nagłówków, emotikonów i markdownu. Zadajesz najwyżej jedno pytanie naraz.
Na początku poznaj cel treningu, potem doświadczenie użytkownika i dostępny sprzęt.
Wykorzystuj informacje już podane w historii, zamiast pytać ponownie.
Dopasowuj rozmowę i ogólne wskazówki treningowe do tych odpowiedzi.
Nie masz obrazu z kamery ani pomiaru ruchu. Nie twierdź, że widzisz technikę,
liczysz powtórzenia lub oceniasz wykonanie ćwiczenia.
Wiadomość "[EVENT: session_start]" oznacza początek sesji: przedstaw się krótko
jako Gym Coach i zapytaj o cel treningu.`;

// Phrases Whisper invents on silence; they come from subtitle credits in its training data.
const STT_HALLUCINATIONS = [
  /^dziękuj[eę]\s+(za\s+)?ogląda\w*\s*[.!…]*$/i,
  /^napisy\s.{0,40}(amara|społeczno)\S*\s*[.!…]*$/i,
  /^napisy[\s:].{0,20}$/i,
  /^[.…\s]+$/,
];

// Said alone (up to three words) while the avatar talks, these do not cut it
// off: the avatar carries on (isLoneCourtesy in src/engine/words.js).
const COURTESY_WORDS = [
  "dziękuję", "dziękujemy", "dzięki", "bardzo", "ci", "dzień", "dobry", "cześć",
  "mhm", "yhm", "hmm", "hm", "aha", "uhm",
];

function createCoach({ voiceId, language = "pl" }) {
  return {
    createState: () => ({}),

    speech: () => ({
      voiceId,
      languageCode: null,
      sttLanguage: language,
      sttCandidates: [],
      sttHallucinations: STT_HALLUCINATIONS,
      courtesyWords: COURTESY_WORDS,
    }),

    buildMessages(session, { userText }) {
      const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...session.history];
      if (userText === null) messages.push({ role: "user", content: "[EVENT: session_start]" });
      return messages;
    },

    markers: [],
  };
}

module.exports = { createCoach, SYSTEM_PROMPT };
