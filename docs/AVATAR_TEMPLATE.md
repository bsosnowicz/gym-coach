# Avatar engine

Szablon aplikacji z awatarem AI, z którym rozmawia się głosem. Użytkownik mówi do mikrofonu, awatar odpowiada głosem i twarzą. Repo zawiera działający silnik rozmowy z wymienialnymi dostawcami, przerwę i koniec sesji (głosem i przyciskiem), prostą stronę sesji i przykładową domenę: zwykłego rozmówcę.

Nowy projekt powstaje przez skopiowanie tego repo i podmianę katalogu `src/coach/` (instrukcja niżej). Kod pochodzi z `language-coach` i `yoga-startup`; co skąd, opisuje `EXTRACTION_PLAN.md`.

## Uruchomienie

Wymagany Node 22 lub nowszy (natywny `WebSocket`). Serwer nie ma zależności npm; pakiety (React, Vite, LiveKit) służą tylko stronie i jej budowaniu.

```bash
cp .env.example .env    # uzupełnij klucze
npm install             # React, Vite, LiveKit (raz)
npm run build:web       # strona do public/app; po każdej zmianie w web/
npm start               # http://127.0.0.1:3000 (przekierowuje na /app/)
npm run dev:web         # albo strona z odświeżaniem na żywo: http://localhost:5173/app/ (serwer na 3000)
npm test                # testy, bez sieci
npm run smoke           # jedna wymiana przez prawdziwy LLM (zużywa limity)
npm run smoke -- --avatar   # dodatkowo start i stop sesji LiveAvatar
```

Serwer nie ma kont ani logowania i domyślnie słucha tylko na `127.0.0.1`. Nie wystawiaj go do sieci w tym stanie: każdy, kto go dosięgnie, zużywa płatne API.

### Zmienne środowiskowe

| Zmienna | Wymagana | Domyślnie | Do czego |
|---|---|---|---|
| `GEMINI_API_KEY` | tak | | główny LLM |
| `GEMINI_MODEL`, `GEMINI_REASONING_EFFORT` | nie | `gemini-3.5-flash-lite`, `minimal` | dozwolone wartości zależą od modelu |
| `GROQ_API_KEY` | tak | | rozpoznawanie mowy (Whisper) i zapasowy LLM |
| `GROQ_STT_MODEL` | nie | `whisper-large-v3-turbo` | |
| `GROQ_MODEL`, `GROQ_REASONING_EFFORT` | nie | `openai/gpt-oss-20b`, `low` | zapasowy LLM |
| `ELEVENLABS_API_KEY` | tak | | synteza mowy |
| `ELEVENLABS_VOICE_ID` | tak | | głos awatara |
| `ELEVENLABS_MODEL_ID` | nie | `eleven_multilingual_v2` | |
| `LIVEAVATAR_API_KEY` | tak | | awatar (tryb Lite) |
| `LIVEAVATAR_SANDBOX` | nie | sandbox włączony | wpisz `false`, żeby używać prawdziwego awatara i kredytów |
| `LIVEAVATAR_AVATAR_ID` | poza sandboxem | w sandboxie awatar Wayne | |
| `LIVEAVATAR_VIDEO_QUALITY` | nie | `medium` | |
| `LIVEAVATAR_SESSION_LIMIT_S` | nie | limit zwrócony przez LiveAvatar | skraca limit lokalnie na potrzeby testu podmiany; nie przedłuża limitu dostawcy |
| `HOST`, `PORT` | nie | `127.0.0.1`, `3000` | |
| `LLM_FIRST_TOKEN_TIMEOUT_MS`, `LLM_HEDGE_DELAY_MS`, `TURN_TIMEOUT_MS`, `STT_TIMEOUT_MS` | nie | `8000`, `2500`, `31100`, `15000` | progi czasowe |

## Nowa apka z szablonu

1. **Skopiuj repo bez historii** i załóż własne:

   ```bash
   cd ~/projects
   rsync -a --exclude .git --exclude node_modules --exclude .env avatar-template/ moja-apka/
   cd moja-apka
   git init -b main
   git remote add origin https://github.com/<konto>/moja-apka.git
   ```

2. **Zmień nazwę i opis** w `package.json` oraz tytuł strony w `web/index.html`.

3. **Napisz swoją domenę w `src/coach/`.** To jedyne miejsce na logikę projektu. Silnik widzi tylko kontrakt `CoachPort` (`src/engine/ports.js`):
   - `createState(setup)` — stan sesji projektu (silnik go nie czyta);
   - `speech(session)` — głos i język rozpoznawania mowy, filtr halucynacji Whispera (`sttHallucinations`) i słowa, które powiedziane same nie przerywają awatara (`courtesyWords`, np. „dziękuję”, „mhm”; lista dla języka projektu);
   - `buildMessages(session, { userText })` — prompt i historia dla modelu; `userText === null` znaczy, że awatar mówi pierwszy (powitanie);
   - opcjonalnie `markers` (znaczniki od modelu, np. `[NEXT_SET]`), `beforeTurn`, `afterTurn`, `onInterrupted`.
   - opcjonalnie synchroniczne `onPause(session)` i `onResume(session)` — zatrzymanie
     oraz wznowienie logiki projektu przy przerwie i oknie zakończenia (opis niżej).

   Wzór minimalny: obecny `src/coach/index.js`. Wzór rozbudowany: `src/coach/` w `language-coach`.

4. **Dopasuj teksty przerwy i końca** w `server.js`, w wywołaniu `withSessionControl`:

   ```js
   const coach = engine.withSessionControl(createCoach({ ... }), {
     texts: { pause: "Dobrze, robimy przerwę w treningu. …", farewell: "Dobry trening! …" },
   });
   ```

   Domyślne teksty i instrukcja znaczników są w `DEFAULT_TEXTS` w `src/engine/session-control.js`.

5. **Uzupełnij `.env`** (`cp .env.example .env`), potem `npm test` i `npm start`.

6. **Interfejs projektu** piszesz w `web/src/`. Strona szablonu jest złożona z części do wielokrotnego użytku:
   - `session/useSession.js` — sesja bez wyglądu: status, transkrypcja, przerwa, okno zakończenia, mikrofon. `start(setup)` przekazuje dane do `/api/session/start` projektu (np. ćwiczenie), a `onEvent(data)` dostaje każde zdarzenie SSE, także własne zdarzenia projektu (np. `rep_counted`, wysłane na serwerze przez `emit(session, { stage: "rep_counted", … })` z `src/engine`).
   - `components/` — `AvatarStage` (wideo i status; nakładki projektu, np. licznik powtórzeń, idą jako `children`), `BreakOverlay`, `EndDialog`, `MicBlockedOverlay` (mikrofon czeka na zgodę albo gest), `VoiceCheck` (sprawdzenie głosu przed Startem; `SessionControls` dostaje wtedy `onStart`), `SessionControls`, `Transcript`, `DevLog`.
   - `screens/SessionScreen.jsx` — gotowa strona złożona z tych części; zostaw ją, dołóż swoje części albo złóż własny ekran.
   - `session/texts.js` — wszystkie napisy strony; projekt podmienia wybrane przez prop `texts`.

   Więcej widoków: router na `#hash` jak w language-coach (`web/src/router.js`). Wszystkie widoki zostają zamontowane, a nieaktywne tylko ukryte, bo odmontowanie `<video>` kończy strumień awatara. Moduły w `public/session/`, `public/stt.js` i `public/ui/` zostaw bez zmian.

**Nie zmieniaj w kopii `src/engine/` ani `src/adapters/`.** Poprawkę silnika zrób w szablonie i przenieś do projektów. Różnice sprawdzisz tak:

```bash
diff -r ~/projects/avatar-template/src/engine src/engine
diff -r ~/projects/avatar-template/src/adapters src/adapters
```

## Architektura

Jedna tura rozmowy przechodzi przez cztery ogniwa:

```
mikrofon ─► STT (Groq Whisper) ─► LLM (Gemini, zapas: Groq) ─► TTS (ElevenLabs) ─► awatar (LiveAvatar Lite)
```

LiveAvatar w trybie Lite tylko rysuje twarz z gotowego dźwięku; słuchanie, myślenie i głos są po naszej stronie. Dzięki temu silnik decyduje, co i kiedy awatar mówi (np. stałe potwierdzenie przerwy bez pytania modelu).

```
server.js                      trasy /api/session/*, pliki statyczne
src/engine/                    silnik: tura, przerywanie, znaczniki, przerwa i koniec
  session-control.js           przerwa i koniec (głos i przycisk) jako nakładka na CoachPort
src/adapters/{llm,tts,stt,avatar}/   dostawcy; silnik zna tylko ich kontrakty (ports.js)
src/coach/                     domena projektu (tu: przykładowy rozmówca)
web/src/                       strona React: session/ (useSession, texts), components/, screens/
public/                        moduły przeglądarki bez Reacta: session/lite-adapter.js (LiveKit, SSE, mikrofon), stt.js, styles.css; app/ to build (poza gitem)
test/                          node:test, bez sieci
```

W CSS deklaracja `-webkit-backdrop-filter` musi stać przed `backdrop-filter`: minifikator CSS Vite (Lightning CSS) zostawia tylko późniejszą z dwóch, a sam prefiks działa tylko w Safari.

### Przerwa i koniec sesji

- **Głosem:** model rozpoznaje prośbę i odpowiada samym znacznikiem `[PAUSE]`, `[END]` albo `[OTHER_CONVERSATION]` (użytkownik mówi do kogoś obok). Potwierdzenie to stały tekst, bez drugiego zapytania do modelu.
- **Przyciskiem:** Przerwa (`/api/session/pause`), Stop (`/api/session/ask-end`), Wracamy (`/api/session/continue`), Tak, kończymy (`/api/session/finish`).
- **W przerwie i w oknie „Na pewno kończymy?”** nic nie trafia do modelu; odpowiedź czyta słownik. Przeczenie odwraca znaczenie („nie kończymy” = wracamy), pytanie zwrotne („Czy już koniec?”) niczego nie rozstrzyga, „kończymy” w przerwie otwiera okno zakończenia.
- Po powrocie awatar powtarza kwestię, którą użytkownik mógł usłyszeć tylko w części; pożegnanie wybrzmiewa do końca przed zamknięciem sesji.

#### Zatrzymanie i wznowienie logiki projektu

Coach może udostępnić dwa opcjonalne hooki: `onPause(session)` i
`onResume(session)`. To synchroniczne funkcje, np. do zatrzymania zegara ćwiczenia
i wznowienia go od zapamiętanego miejsca. Silnik wywołuje je po zmianie
`session.control`, przed wysłaniem zdarzenia do przeglądarki.

- `onPause` działa raz po wejściu w przerwę lub otwarciu okna zakończenia aktywnej
  sesji, także gdy użytkownik zaczyna rozmawiać z kimś obok.
- Przejście z przerwy do okna zakończenia nie wywołuje drugiego `onPause`.
- `onResume` działa raz po powrocie z przerwy lub anulowaniu zakończenia.
  Potwierdzenie końca nie wznawia logiki projektu.
- Głos i przyciski korzystają z tych samych funkcji. Powtórzone żądania nie
  powtarzają hooków; zwykłe wejście w słowo i techniczna podmiana awatara
  nie są zmianami stanu przerwy.

Przykład metod dodawanych do obiektu zwracanego przez `createCoach`:

```js
createState: () => ({ elapsedMs: 0, runningSince: Date.now() }),
onPause(session) {
  const state = session.coachState;
  state.elapsedMs += Date.now() - state.runningSince;
},
onResume(session) {
  session.coachState.runningSince = Date.now();
},
```

Hooki aktualizują stan i timery domeny; nie powinny generować wypowiedzi awatara
ani zwracać Promise. Sprzątanie po definitywnym zamknięciu sesji należy do
istniejącego `onSessionEnd`. Wyjątek synchroniczny z hooka jest logowany i
zapisywany jako `control.hook_failed`, a sterowanie sesją działa dalej.

### Podmiana sesji awatara przed limitem (02e)

Sesja rozmowy trwa dłużej niż pojedyncze połączenie z LiveAvatar. Adapter odczytuje
`max_session_duration` z odpowiedzi dostawcy (przy braku poprawnej wartości przyjmuje
1200 s, jak w yoga-startup). Silnik w `src/engine/avatar-handover.js` szuka dogodnego
momentu od 90 s przed limitem, a najpóźniej 45 s przed limitem rozpoczyna podmianę.
Dla krótkich sesji te marginesy wynoszą odpowiednio najwyżej 40% i 20% ich czasu.

Domyślnie dogodny moment oznacza zakończone powitanie i brak trwającej wypowiedzi
lub generowania odpowiedzi. Domena może dodać synchroniczny hook
`atBoundary(session)` w `src/coach/`, zwracający `true`, np. między ćwiczeniami.
To dodatkowy warunek, nie polecenie natychmiastowej podmiany. Termin awaryjny
może przerwać wypowiedź, gdy bezpieczny moment nie nadejdzie; pożegnanie kończące
rozmowę nie uruchamia kolejnej podmiany.

Najpierw zamykane jest stare połączenie, potem tworzone nowe. Identyfikator rozmowy,
historia, stan coacha, przerwa i okno zakończenia pozostają zachowane. Przeglądarka
przepina pokój LiveKit na tym samym elemencie wideo, zachowuje mikrofon i jego
ustawienia oraz transkrypcję. Podczas przełączania pokazuje komunikat i chwilowo
wycisza mikrofon; nie odtwarza ponownie powitania. Stop nadal pozwala zakończyć
sesję. W trakcie podmiany koniec odbywa się bez głosowego pożegnania.

Nowe połączenie jest gotowe dopiero po potwierdzeniu ścieżki audio i odblokowanego
odtwarzania w przeglądarce (`/api/session/handover-ready`). Brak potwierdzenia przez
20 s albo błąd podmiany zamyka sesję i pokazuje komunikat o utracie połączenia.
Ponowne połączenie SSE odtwarza stan podmiany; spóźnione zdarzenia starego pokoju
nie kończą nowej sesji. Rejestrator zapisuje `avatar.handover_started`,
`avatar.handover_ended` i `avatar.handover_failed` bez tokenów dostawcy.

Test bez płatnych usług:

```bash
node --test test/avatar-adapter.test.js test/avatar-handover.test.js test/avatar-handover-browser.test.js
```

Test z rzeczywistym awatarem (korzysta z usług z `.env`):

```bash
npm run build:web
LIVEAVATAR_SESSION_LIMIT_S=90 npm start
```

Otwórz `/app/`, rozpocznij rozmowę i powiedz coś, do czego wrócisz po podmianie.
Przy limicie 90 s pierwsza próba podmiany nastąpi około 54 s od startu awatara,
a wymuszona około 72 s. Sprawdź dalszą rozmowę, zachowanie transkrypcji, wyciszenia
mikrofonu i przerwy oraz Stop podczas przełączania. Poczekaj także na drugą podmianę.
Jeśli dostawca zwróci krótszy limit, obowiązuje krótszy. Po teście uruchom zwykłe
`npm start`, aby wrócić do limitu dostawcy; nie trzeba zmieniać `.env`.

### Pozostałe zabezpieczenia sesji

Z yoga-startup, po awariach na żywo:

- **Przeglądarka zniknęła** (zamknięta karta bez Stop, zerwana sieć): brak strumienia `/api/session/events` przez 3 min zamyka sesję (`src/engine/session-watchdog.js`, wpis `session.client_gone`). Puls SSE co 20 s nie pozwala proxy zerwać cichego strumienia.
- **Zatrzymanie serwera** (SIGTERM przy wdrożeniu, Ctrl+C): sesje awatara zamykają się w 8 s (`closeAllSessions`, wpis `session.server_stop`). Drugi Ctrl+C kończy od razu.
- **Samo „Dziękuję” albo „mhm”** w trakcie wypowiedzi awatara nie przerywa jej: awatar mówi dalej (`courtesyWords`). Gdy awatar milczy, takie słowa idą do modelu jak każda wypowiedź.
- **Mikrofon wisi bez błędu** (pytanie o zgodę bez odpowiedzi, dźwięk wstrzymany do gestu): po 4 s na wideo „Zezwól na mikrofon” albo „Włącz mikrofon” z przyciskiem (`public/mic-start.js`).
- **Sprawdzenie głosu przed Startem** mierzy głos użytkownika i obniża pod niego próg mowy (`public/mic-calibration.js`, `public/voice-check.js`). Wynik jest pamiętany na urządzeniu osobno dla każdego mikrofonu; udany pomiar z ostatnich 30 min startuje jednym kliknięciem.

Przeglądarka zgłasza do rejestratora sesji (`POST /api/session/report`, wpisy `browser.<akcja>`) to, co tylko ona wie: `mic_blocked` / `mic_unblocked`, `turn_latency` (czas reakcji awatara od ciszy po wypowiedzi do pierwszego dźwięku, z rozbiciem na STT, sieć, LLM, TTS, wysyłkę i awatara; ta sama linia `CZAS REAKCJI` jest w Dzienniku na stronie), `mic_calibrated` i `mic_stats` (progi i co mikrofon słyszał, raz na minutę, gdy coś się działo). Trasa przyjmuje tylko akcje z listy w `src/http/browser-report.js`.
