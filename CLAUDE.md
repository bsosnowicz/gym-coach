# CLAUDE.md — gym-coach

Kontekst dla nowej sesji Claude. Uruchomienie i zakres Gym Coacha są w `README.md`, a dokumentacja silnika w `docs/AVATAR_TEMPLATE.md`, skąd pochodzi każdy moduł i co zostało w yoga-startup / language-coach — w `EXTRACTION_PLAN.md`.

## Czym jest projekt

Gym Coach: trener siłowy AI z rozmową głosową i awatarem. Projekt powstał z lokalnego
`avatar-template` 2026-10-28, po etapach 02e i 02g. Silnik i adaptery są identyczne
z szablonem; domena trenera mieści się w `src/coach/`.

Trener rozmawia o celu treningu, doświadczeniu i sprzęcie (etap 04). Od etapu 03
opcjonalna kamera wysyła klatki do `yolo-backend`, a uwagi ze scenariusza `standing`
wypowiada awatar jako krótkie korekty. Fazy ruchu i liczenie powtórzeń to etap 05.
Repo: `bsosnowicz/gym-coach`, katalog `~/projects/gym-coach`.

## Uruchomienie i testy

- Node 22. **Serwer bez zależności npm**; pakiety (React, Vite, `livekit-client` 2.22.3) są tylko dla strony. Nie dodawaj pakietów bez wyraźnej zgody.
- `npm install`, `npm run build:web` (strona z `web/` do `public/app`, poza gitem), `npm start` → http://127.0.0.1:3001/app/; `npm run dev:web` → Vite z odświeżaniem na żywo, `/api` idzie do serwera na 3001.
- `npm test` → testy bez sieci (`node:test`). Uruchamiaj po każdej zmianie. `npm run smoke` woła prawdziwych dostawców i zużywa limity.

## Mapa kodu

- `src/engine/` — silnik rozmowy z language-coach (tura, przerywanie, znaczniki) + `session-control.js` (przerwa i koniec głosem i przyciskiem jako nakładka na `CoachPort`). **W kopiach szablonu tego katalogu się nie zmienia** — poprawki robi się w `avatar-template` i przenosi do tego projektu (`diff -r`).
- `src/adapters/{llm,tts,stt,avatar}/` — dostawcy, silnik zna tylko ich kontrakty (`src/engine/ports.js`).
- `src/coach/` — domena projektu: `index.js` (prompt, znaczniki `[PLAN]`, `[NEXT]`, `[SWAP]`, `[SKIP]`, `[FEWER_SETS]`, `[NO_GEAR]`, `[PAIN]`), `exercises.js` (katalog: `data/exercises.json` z free-exercise-db + nakładka `data/exercises-pl.json`), `planner.js` (plan z wywiadu, różnorodność A/B, focus na partię mięśni), `progression.js` (progresja z dziennika), `schedule.js` (stały schemat, regeneracja 48 h), `workout.js` (serie, przerwy, zmiany, wynik „8 na 60 kilo”), `body-mentions.js` (wzmianki o kontuzjach bez modelu), `holdPainDuringBreak` w `index.js` (ból zgłoszony w przerwie), `injury-store.js` i `workout-log.js` (Supabase przez `supabase.js`), `cues.js` (korekty z kamery). Zasada: model tylko rozpoznaje intencję znacznikiem, decyzję i tekst zapowiedzi daje kod.
- `web/src/` — strona React: `session/useSession.js` (sesja bez wyglądu, `start(setup)`, `onEvent` na własne zdarzenia SSE), `session/texts.js` (wszystkie napisy), `session/useMouth.js` (usta maskotki), `App.jsx` (zakładki Start / Trening / Historia; ukrywane, nie odmontowywane), `screens/` (`StartScreen` ze sprawdzeniem głosu i wyborem trenera, `SessionScreen`, `HistoryScreen`), `workout/` (`plan-view.js` — zdarzenie `workout` na propsy komponentów, `WorkoutView.jsx`, zegar przerwy `useRestLeft` w `WorkoutPanel.jsx`).
- Design system „Gym Coach” z Claude Design: `web/src/ui/` (komponenty, maskotki i sceny w `art.js`) i `web/src/styles/` (`tokens.css`, `components.css`, `mascot.css`, `scene.css`, `app.css`); fonty Manrope w `public/fonts/` (serwowane pod `/fonts/`). Motyw: `data-theme` na `<html>` według systemu (`web/src/theme.js`). Wartości tylko z `tokens.css`; klasy `gc-*`.
- `public/camera/` + `web/src/camera/CameraPanel.jsx` — opcjonalna kamera (etap 03): strumień do YOLO, szkielet, pętla korekty; `src/coach/cues.js` — trasa korekty i bramka; `yolo-backend/` — serwis Python ze scenariuszami.
- `public/` — moduły przeglądarki bez Reacta, wspólne z language-coach: `session/lite-adapter.js` (LiveKit, SSE, mikrofon), `stt.js`, `api.js`, `ui/log.js`.
- Tryb bez awatara (`COACH_AVATAR=voice`, z language-coach): `src/adapters/avatar/browser-voice.js`, `public/session/{voice-player,voice-level,visemes}.js`, maskotka i scena z design systemu (`CoachStage` w `web/src/ui/coach.jsx`, `--level` ust z `useMouth.js`), stan trenera w `SessionScreen.jsx` (`coachState`).

## Zasady współpracy z użytkownikiem

- Odpowiadaj po polsku; przed pracą przedstaw plan z listą zadań (etapy numerowane „N/M”) i poczekaj na akceptację (reszta jest w globalnym `~/.claude/CLAUDE.md`).
- Commity po angielsku, opis „co i dlaczego”, **bez dopisku `Co-Authored-By: Claude`**; każdy etap osobnym commitem z testami. Do commita dodawaj **tylko pliki zmienione w zadaniu** (`git add <ścieżki>`, nigdy `-A`) — użytkownik zmienia repo równolegle.
- Komentarze w kodzie po angielsku, tylko gdy niosą „dlaczego”; teksty dla użytkownika po polsku.
- Zmiany możliwie małe, przyczynę błędu szukaj u źródła.

## Delegowanie do Codexa

- **Claude Opus jest głównym agentem**: planuje, uzgadnia plan z użytkownikiem, sprawdza wynik i raportuje.
- Proste, izolowane zadania implementacyjne (jasny zakres, kilka plików, znany wzorzec w kodzie) Claude **może sam** zlecić `codex:codex-rescue`, bez pytania za każdym razem. Ta zgoda zastępuje domyślną zasadę „nie uruchamiaj agentów, jeśli użytkownik nie prosi” — tylko dla tego przypadku.
- **Najwyżej jedna delegacja na zadanie.** Bez automatycznych pętli review (Codex ↔ Claude); wynik Codexa Claude sprawdza sam (`git diff`, `npm test`) i sam poprawia, co trzeba.
- Codex nie robi commitów, push ani merge — commit robi Claude według zasad wyżej, push/merge tylko na prośbę użytkownika.
- Codex przez istniejący plugin `codex@openai-codex` i logowanie ChatGPT (`codex login status` → „Logged in using ChatGPT”); bez klucza API OpenAI.

## Lekcje (fakty, które kosztowały czas)

- **Wideo awatara nie może się odmontować**: element `<video>` i adapter żyją przez całą sesję; widoki tylko się ukrywa (zerwany strumień WebRTC = koniec sesji awatara).
- **React `autoFocus` w `<dialog>` otwieranym przez `showModal()` nie działa** (fokus przy montowaniu, gdy okno zamknięte; brak atrybutu `autofocus` w DOM) — `EndDialog` sam ustawia fokus na „Nie, wracamy” po `showModal()`, inaczej Enter kończył sesję.
- **Minifikator CSS Vite (Lightning CSS)** z pary `backdrop-filter` + `-webkit-backdrop-filter` zostawia tylko późniejszą — prefiks pisz pierwszy.
- Tekst złożony z kilku części w JSX (`„{x}”`) to kilka węzłów tekstowych i inny kerning niż jeden napis — przy porównaniach zrzutów używaj template stringa.
- Stany sesji bez awatara i bez kluczy: osobny build Vite z aliasem `livekit-client` na atrapę pokoju (`Room` z `connect()` od razu rozwiązanym) i w Playwright `page.route` na `/api/session/start` oraz `/api/session/events` (strumień SSE z `retry: 3600000`, zdarzenia ~800 ms po starcie). Chromium z `~/.cache/ms-playwright`, Playwright z `../yoga-startup/node_modules`. Po teście zbuduj zwykłą wersję.

## Konfiguracja lokalna

Serwer działa na porcie 3001, Vite na 5174. `.env` jest ignorowany przez Git.
Kod silnika i adapterów zmieniaj w `avatar-template`, a potem przenoś tutaj.
