# Plan wydzielenia: yoga-startup (+ language-coach) → avatar-template

Stan: **projekt do akceptacji** (2026-10-27). Zadanie 01 projektu Gym Coach.
Kolejne zadania: 02 zakłada w tym repo silnik i adaptery, 03 dokłada kamerę
i YOLO jako moduł opcjonalny, 04 zakłada `gym-coach` z szablonu.

Źródła:
- `/home/barte/projects/yoga-startup`, gałąź `main`, commit `4f5ef96` (wersja 0.2.41);
- `/home/barte/projects/language-coach`, gałąź `main`, commit `8aac6c0`.

Cel: `/home/barte/projects/avatar-template` — start dla kolejnych aplikacji
z awatarem: rozmowa głosowa, opcjonalnie kamera, domena w osobnym module.

> **Zmiana z 2026-10-27:** kamera i YOLO **nie trafiają do szablonu**, tylko
> prosto do gym-coach (decyzja właściciela). Sekcje o kamerze (2, 6, 7, 8)
> opisują więc, co gym-coach bierze z yoga-startup; w szablonie tych plików
> nie ma.

Ścieżki w tabelach są względne do repo podanego w kolumnie „Źródło”
(`yoga` = yoga-startup, `lc` = language-coach).

## 1. Najważniejsze ustalenia

1. **Silnika rozmowy nie wycinamy drugi raz z jogi.** W language-coach jest już
   wycięty (2026-10-08) i niezależny od dostawców: `src/engine/*` i
   `src/adapters/{llm,tts,stt,avatar}`. Domena wisi za jednym kontraktem,
   `CoachPort` w `src/engine/ports.js` (`createState`, `speech`,
   `buildMessages`, `markers`, `beforeTurn`, `afterTurn`, `onInterrupted`).
   Silnik nie zna lekcji ani języków poza komentarzami. W jodze ten sam kod
   siedzi w `server/lite-pipeline.js` (ponad 7000 linii) przemieszany z planem
   treningu — tamtędy nie idziemy.
2. **Z yoga-startup do szablonu idą trzy rzeczy:** kamera z YOLO, sterowanie
   sesją (przerwa i koniec) w dojrzalszej wersji niż w language-coach oraz
   kilka zabezpieczeń dopisanych po awariach na żywo, których language-coach
   nie ma (sekcja 5).
3. **`yolo-backend` jest ogólny, jogowe są tylko dane.** `app.py`,
   `pose_rules.py`, `stream_messages.py`, testy i Dockerfile to silnik reguł
   geometrycznych. `scenarios/*.json` (15 asan) to wiedza o jodze. Nazwa
   w README („YOLO Yoga Backend”) do zmiany.
4. **Pętla korekty postawy jest splątana z jogą w czterech miejscach:**
   reguły przychodzą z `/api/asany/detekcja` (`public/posture-rules.js`);
   kalibracja zna warianty `pelna|zlagodzona`; k-NN z maszyną stanów
   rozpoznaje pozycje statyczne; korekty idą do trzech tras serwera
   (`/api/posture-correction|affirmation|mismatch`), które składają tekst
   z `posture.js` albo z Groqa i mówią przez `speakLiteCue` z bramkami stanu
   treningu.
5. **k-NN zostaje w jodze** (decyzja z 2026-10-27). Rozpoznaje pozycje
   statyczne z nagrań kalibracyjnych — w ćwiczeniach w ruchu (przysiad,
   powtórzenia) nie ma czego tak rozpoznawać. Fazy ruchu i liczenie powtórzeń
   to osobne zadanie 05, w gym-coach.
6. **Przerwa i koniec na życzenie są w language-coach, ale w warstwie
   domeny** (`src/coach/breaks.js`, `requestPause` / `requestEnd` /
   `continueSession` / `farewell` w `src/coach/index.js`), z tekstami
   i słowami o „lekcji”. W szablonie muszą być wspólne dla każdej domeny.
   Joga ma do tego kilka dopracowań, których language-coach nie ma (sekcja 4).
7. **Licencja.** `yolo-backend/requirements.txt` ciągnie `ultralytics==8.3.179`
   — AGPL-3.0. Udostępnianie usługi z tym kodem przez sieć pociąga obowiązek
   otwarcia kodu albo licencję komercyjną Ultralytics. Dotyczy już jogi;
   szablon tylko to powiela.

## 2. Mapa modułów

### Silnik rozmowy i adaptery (źródło: language-coach)

| Moduł | Źródło | Do szablonu | Uwagi |
|---|---|---|---|
| Silnik: sesja, tura, znaczniki, cięcie na zdania | lc `src/engine/session.js`, `turn.js`, `markers.js`, `sentence-stream.js`, `resume-point.js`, `index.js` | tak, 1:1 | |
| Kontrakty portów | lc `src/engine/ports.js` | tak, z modyfikacją | `CoachPort` → port domeny; dopisać hooki sterowania sesją i kamery (sekcja 6) |
| Błędy dostawców | lc `src/engine/provider-failure.js` | tak, z modyfikacją | teksty dla użytkownika do konfiguracji domeny |
| Rejestrator w pamięci | lc `src/engine/recorder.js` | tak, 1:1 | |
| LLM: Gemini, Groq (wyścig, ponowienia) | lc `src/adapters/llm/chat-completions.js`, `providers.js` | tak, 1:1 | |
| TTS: ElevenLabs | lc `src/adapters/tts/elevenlabs.js` | tak, 1:1 | |
| STT: Groq Whisper | lc `src/adapters/stt/groq-whisper.js` | tak, z modyfikacją | dopisać filtr samotnej grzeczności z jogi (sekcja 5) |
| Awatar: LiveAvatar Lite | lc `src/adapters/avatar/liveavatar-lite.js` | tak, z modyfikacją | dopisać podmianę sesji przed limitem (sekcja 5) |
| Magazyn w pamięci | lc `src/adapters/store/memory.js` | **nie** | przy przenoszeniu wyszło, że ma kształt nauki języka (słówka, lekcje, powtórki); silnik go nie używa |
| Magazyn Supabase | lc `src/adapters/store/supabase.js` | **nie** | schemat `coach_*` (słówka, lekcje) to domena języka |
| Konfiguracja, `.env` | lc `src/config.js` | tak, 1:1 | |
| Nagłówki, limity, JSON | lc `src/http/http-security.js` | tak, z modyfikacją | CSP: dopisać adres YOLO, gdy kamera włączona |
| Zużycie API | lc `src/usage.js` | tak, 1:1 | |
| Punkt wejścia | lc `server.js` | tak, z modyfikacją | zostają trasy sesji (`start`, `events`, `stt`, `turn`, `interrupt`, `resume`, `ask-end`, `continue`, `finish`, `end`); wypadają `progress`, `week`, `path`, `words`, `goals`, `direction` |
| Przeglądarka: mikrofon, VAD | lc `public/stt.js` | tak, z modyfikacją | od 02d: `onBlocked`, progi z `mic-calibration.js`, diagnostyka (sekcja 5, sekcja 12) |
| Przeglądarka: LiveKit + SSE | lc `public/session/lite-adapter.js` | tak, z modyfikacją | od 02d: zablokowany mikrofon, czas reakcji, raporty do rejestratora |
| Przeglądarka: kto ma głos, echo | lc `public/session/conversation-floor.js`, `avatar-onset.js`, `public/audio-onset.js` | tak, 1:1 | |
| Przeglądarka: drobne UI | lc `public/ui/log.js`, `audio-unlock.js`, `radio-group.js`, `theme.js`, `views.js`, `public/api.js` | tak | `api.js` bez wywołań lekcji |
| Ekran aplikacji | lc `public/main.js`, `board.js`, `index.html`, `css/` | **nie** | ekran nauki języka; szablon dostaje jedną prostą stronę sesji |
| Warstwa językowa | lc `src/coach/*` (poza `breaks.js`) | **nie** | domena; wzór, jak wypełnić port domeny |

### Kamera i YOLO (źródło: yoga-startup)

| Moduł | Źródło | Linie | Do szablonu | Uwagi |
|---|---|---|---|---|
| Kamera: urządzenia, zgoda, strumień | yoga `public/posture/camera.js` | 161 | tak, z modyfikacją | bez zapasu MediaPipe: YOLO niedostępny = podgląd bez oceny postawy i komunikat w dzienniku |
| Klient strumienia YOLO (JPEG przez WebSocket) | yoga `public/posture/yolo-stream.js` | 304 | tak, z modyfikacją | `yoloPoseWsUrl()` czyta `import.meta.env.VITE_*` — szablon nie ma Vite; adres z `/api/config` |
| Dziennik YOLO z sesji | yoga `public/posture/yolo-session-log.js` | 144 | tak, 1:1 | |
| Migawka postawy do promptu | yoga `public/posture/snapshot.js` | 43 | tak, 1:1 | |
| Geometria: kąty, wygładzanie, debouncer, rysowanie, MediaPipe | yoga `public/pose-detector.js` | 305 | **nie**, poza `createDeviationDebouncer` | decyzja: tylko YOLO. Reguły liczy serwis YOLO, więc kąty i wygładzanie w przeglądarce to tor MediaPipe. Z pliku przechodzi sam debouncer (ok. 30 linii) do `public/camera/` |
| Kiedy wypada się odezwać | yoga `public/cue-scheduler.js` | 74 | tak, 1:1 | |
| Kadrowanie czarnych pasów (telefon pionowo) | yoga `web/src/integrations/camera-framing.js` | 164 | tak, 1:1 | czysty JS, bez Reacta |
| Pętla korekty | yoga `public/posture/correction-loop.js` | 455 | tak, z modyfikacją | zostaje tylko `handleYoloAnalysis`; wypada `handleFrame` (tor MediaPipe z `rulesFor()`), tor k-NN i rozjazdu, `fetchCalibrations`; `onCue` zamiast `sendPosture*` |
| Panel kalibracji | yoga `public/posture/calibration.js` | 134 | **nie** | nagrania pod k-NN, warianty `pelna|zlagodzona` |
| k-NN, maszyna stanów | yoga `public/knn.js`, `public/posture-state-machine.js` | 290 | **nie** | decyzja: k-NN zostaje w jodze |
| Reguły z asan | yoga `public/posture-rules.js` | 59 | **nie** | klient `/api/asany/detekcja`, potrzebny tylko torowi MediaPipe; w szablonie reguły są w scenariuszach YOLO |
| Wysyłka korekt do serwera | yoga `public/session/posture-cues.js` | | **nie** | w szablonie `onCue` idzie do domeny (sekcja 6) |
| Klej Reacta | yoga `web/src/integrations/pose.js` | 239 | **nie** | wzór składania modułów kamery |
| Strona testowa YOLO | yoga `public/yolo-test.html`, `yolo-test.js`, `yolo-test.css` | 888 | tak, z modyfikacją | narzędzie do strojenia progów; bez listy asan |
| Serwis YOLO | yoga `yolo-backend/app.py`, `pose_rules.py`, `stream_messages.py`, `requirements.txt`, `Dockerfile`, `README.md` | 514 | tak, z modyfikacją | README bez jogi; `scenarios/` z jednym przykładem |
| Testy serwisu YOLO | yoga `yolo-backend/tests/` | 142 | tak, z modyfikacją | testy nie mogą zależeć od scenariuszy jogi |
| Scenariusze asan | yoga `yolo-backend/scenarios/*.json` | | **nie** | dane jogi |

## 3. Co zostaje jogowe w yoga-startup

Nic z tego nie trafia do szablonu i nic nie jest usuwane z yoga-startup.

- **Plan treningu i baza pozycji:** `planner.js`, `asany.js`, `flows.js`,
  `przejscia.js`, `reguly-sesji.json`, katalogi `asany/` i `flows/` (poza repo).
- **Prowadzenie ćwiczeń:** `server/session-script.js`, `server/flow-script.js`,
  `server/plan-resume.js`, `server/session-plan.js`, `server/exercise-log.js`,
  `server/card-script.js`, `server/card-import.js`, `server/card-batch.js`,
  `server/planner-simulation.js`, `server/yolo-scenarios.js`.
- **Sesja Lite z jogą w środku:** `server/lite-pipeline.js` i
  `server/providers.js` (prompt trenerki, start sesji z planem, przeplanowanie,
  przejście do relaksu, okno rozmowy na koniec, pożegnanie z zaproszeniem).
  Mechanizmy ogólne z tych plików są wypisane w sekcjach 4 i 5 — przenosi się
  ich wzór, nie plik.
- **Korekta postawy po stronie serwera:** `posture.js` (teksty korekt),
  `calibration.js`, trasy `/api/posture-*`, `/api/asany/detekcja`,
  `/api/calibration`, `generateGroqCorrection`, `speakLiteCue`.
- **Kamera:** k-NN i kalibracja (sekcja 2), scenariusze YOLO.
- **Pamięć i historia testerki:** `memory.js`, `memory-schema.js`,
  `server/previous-session.js`, `server/ui-memory.js`, `server/feedback.js`.
- **Produkt i badanie:** `web/` (React), panel admina (`server/admin*.js`),
  `server/billing.js`, `server/pricing-survey.js`, `server/research-journey.js`,
  `server/consents.js`, `server/accounts.js`, `server/auth.js`,
  `server/transactional-email.js`, `supabase/`, `deploy/`, `e2e/`.
- **Wzmianka o bólu** (`painMention`, `holdPainNote`) — zostaje w jodze, ale
  gym-coach będzie potrzebował tego samego; to wzór do zadania w gym-coach,
  nie część szablonu.

## 4. Sterowanie sesją: przerwa i koniec na zawołanie i przyciskiem

Użytkownik musi móc w każdej chwili zrobić przerwę i zakończyć sesję — głosem
albo przyciskiem, z tym samym skutkiem. Każdy przycisk ma odpowiednik głosowy
i podpowiedź „Możesz też powiedzieć: …” (zasada z jogi z 3.10).

### Jak działa dziś

| | language-coach | yoga-startup |
|---|---|---|
| Przerwa głosem | model wstawia `[PAUSE]` | model wstawia `[PAUZA]` |
| Przerwa, bo użytkownik mówi do kogoś innego | brak | `[INNA_ROZMOWA]` → `requestPause(session, "conversation")`, osobny tekst potwierdzenia |
| Potwierdzenie przerwy | stały tekst po turze (`pauseToConfirm`) | stały tekst (`PAUSE_TEXT`), bez drugiego zapytania do modelu |
| W przerwie | nic nie idzie do modelu; powrót tylko słownikiem `resumeIntent` | to samo (`pausedResumeIntent`) + przekręcone „kontynuuj” z Whispera (`garbledContinue`) + model w zapasie (`engineFallbackIntent`, pewność ≥ 0,9) |
| Powrót | „Dobrze, wracamy.” + powtórzenie przerwanej kwestii (`interruptedLine`) | to samo; dodatkowo nie powtarza kwestii, którą i tak powie wznowione prowadzenie |
| Koniec głosem | `[END]` → okno potwierdzenia | `[KONIEC]` → okno potwierdzenia (`requestSessionEnd`) |
| Odpowiedź w oknie zakończenia | tylko przyciski | głosem: `endDialogAnswer` (przeczenie odwraca znaczenie: „nie kończymy” = wracamy), `withoutQuestions` (pytanie zwrotne „czy…” nie rozstrzyga), model w zapasie |
| Koniec przyciskiem | `/api/session/ask-end` → okno | `/api/lite-finish` |
| Powrót z okna | `/api/session/continue` | `/api/lite-resume`, `resumeAfterEndRequest` |
| Pożegnanie | stały tekst, mówiony do końca (`farewell`, `untilSpoken`) | `closingFarewell` z pytaniem o następną sesję |
| Polecenie w trakcie kwestii awatara | przerywa kwestię jak każda wypowiedź | czeka na koniec kwestii (`looksLikeCommand`, `deferCommand`) i wykonuje się, jeśli nic się nie zmieniło |
| Stan sesji w czasie pytania | `paused`, `endPending` w stanie domeny | `paused`, `endPending` + bramki w `advanceAtStepEnd`, `speakLiteCue` (kamera nie wchodzi w przerwę) |

### Co trafia do szablonu

Nowy moduł `src/engine/session-control.js` (przy silniku, bo każda domena go
potrzebuje), na bazie kodu z language-coach, z dopracowaniami z jogi:

- stany `paused` i `endPending` w sesji silnika, nie w stanie domeny;
- znaczniki `[PAUSE]`, `[END]`, `[OTHER_CONVERSATION]` zarejestrowane przez
  silnik, nie przez domenę;
- trasy `ask-end`, `continue`, `finish` (jak w language-coach) — przycisk
  i głos wołają te same funkcje;
- odpowiedzi głosem w oknie zakończenia: `endDialogAnswer` z przeczeniem
  i `withoutQuestions`;
- przekręcone „kontynuuj” (`garbledContinue`);
- powrót z powtórzeniem przerwanej kwestii;
- bramka: w przerwie i w oknie zakończenia nic nie idzie do modelu, a korekta
  z kamery milczy;
- odkładanie poleceń powiedzianych w trakcie kwestii (`deferCommand`) — tylko
  dla przerwy i końca; słownik poleceń domeny (np. „następne ćwiczenie”)
  dokłada domena.

Dostarcza domena (przez port domeny):

- teksty: potwierdzenie przerwy, powrót, pożegnanie, podpowiedzi przy przyciskach;
- słowa: dopełnienia typu „do treningu”, „do lekcji” w słowniku powrotu;
- co znaczy „wrócić”: w jodze zegar punktu i prowadzenie pozycji
  (`resumeAfterHalt`), w gym-coach np. dokończenie serii — hook
  `onPause(session)` / `onResume(session)`;
- dodatkowe opcje okna zakończenia (w jodze „przejdź do relaksu”).

Testy do przeniesienia razem z kodem: yoga `test/lite-end-dialog-voice.test.js`,
`test/lite-conversation-pause.test.js` (w wersji bez planu jogi).

## 5. Inne mechanizmy do przeniesienia

Ogólne zabezpieczenia z yoga-startup, dopisane po awariach na żywo, których
language-coach nie ma.

| Mechanizm | Źródło | Decyzja | Co w nim jogowe |
|---|---|---|---|
| Sesja bez przeglądarki zamyka się po 3 min (brak strumienia SSE) | yoga `server/session-watchdog.js` + `test/session-watchdog.test.js` | tak, 1:1 | nic; wpięcie przy trasie `events` |
| Łagodne zamknięcie przy SIGTERM: zamknąć sesje awatara w 8 s | `shutdownGracefully` w yoga `server.js` | tak, z modyfikacją | wpis `server_restart` do Supabase → do rejestratora |
| Mikrofon wiszący bez błędu → „Zezwól na mikrofon” / „Włącz mikrofon” | yoga `public/mic-start.js` + `test/mic-start.test.js`, `onBlocked` w `public/stt.js` | tak, 1:1 | nic |
| Sprawdzenie głosu przed sesją | yoga `public/voice-check.js`, `public/mic-calibration.js`, `public/mic-diagnostics.js` + testy | tak, z modyfikacją | `components/MicCheck.jsx` jest w React — w szablonie prosty widok |
| Czas reakcji awatara po każdej turze (`turn_latency`) | yoga `public/session/turn-latency.js` + `test/turn-latency.test.js` | tak, 1:1 | raport w panelu admina zostaje w jodze |
| VAD tylko ścisza awatara, przerwanie dopiero na prawdziwą wypowiedź | yoga `public/session/barge-duck.js`, `confirmBargeTurn` | najpierw porównać | language-coach robi podobnie inaczej: pauza na VAD i `resumeTurn` przy fałszywym alarmie. Szablon bierze wersję z language-coach; z jogi tylko to, czego tam brak |
| Samo „Dziękuję” / „mhm” nie przerywa awatara | `isLoneCourtesy` w yoga `server/lite-pipeline.js` | tak | słowa po polsku → do listy per język |
| Podmiana sesji awatara przed limitem LiveAvatar (~20 min) | `handoverDue`, `handoverAvatar` w yoga `server/lite-pipeline.js` | tak, z modyfikacją | „granica” (między ćwiczeniami) i pytanie o przerwę — granicę wskazuje domena hookiem |
| Klasyfikator intencji modelem obok słownika (cień i zapas) | yoga `server/intent-shadow.js`, `engineFallbackIntent` | opcjonalnie, później | lista intencji i progi pewności od domeny — pytanie 3 |
| Przeładowanie strony po wdrożeniu (404 leniwych modułów) | yoga `web/src/integrations/version.js` | nie | dotyczy buildu Vite; szablon nie ma kroku budowania |

## 6. Granica szablon ↔ domena

Zależności idą w jedną stronę: `server.js` → silnik → porty ← adaptery,
domena za portem domeny. Silnik nie importuje niczego z `src/coach/`.

**Rozmowa** — port domeny = dzisiejszy `CoachPort` z language-coach
(`createState`, `speech`, `buildMessages`, `markers`, `beforeTurn`,
`afterTurn`, `onInterrupted`), plus:

- `texts` — teksty sterowania sesją (sekcja 4);
- `onPause(session)`, `onResume(session)` — co domena wstrzymuje i wznawia;
- `atBoundary(session)` — czy teraz można podmienić sesję awatara (sekcja 5).

**Kamera** — moduł w przeglądarce, który domena składa sama:

- reguły to pliki scenariuszy w `yolo-backend/scenarios/` (jeden plik na
  ćwiczenie: punkty, progi i gotowy tekst korekty w polu `correction`);
  przeglądarka wybiera scenariusz, serwis YOLO go ocenia i odsyła błędy
  razem z tekstem korekty;
- `onCue({ kind, exercise, deviation, correction })` — domena decyduje, czy
  powiedzieć gotowy tekst ze scenariusza, czy złożyć własny, i woła trasę
  serwera, która mówi przez `speakText` silnika;
- bramka „czy teraz wolno się odezwać” (odpowiednik bramek `speakLiteCue`):
  silnik sprawdza `paused` / `endPending` i to, czy trwa tura; domena może
  dołożyć własne stany.

## 7. Docelowa struktura

```
avatar-template/
├── EXTRACTION_PLAN.md
├── README.md                     # nowa apka z szablonu w kilku krokach (zadanie 02)
├── package.json                  # bez zależności produkcyjnych, Node 22+
├── .env.example
├── server.js                     # trasy sesji, pliki statyczne
├── src/
│   ├── config.js
│   ├── usage.js
│   ├── engine/                   # z language-coach + session-control.js, session-watchdog.js
│   ├── adapters/{llm,tts,stt,avatar}/
│   ├── http/http-security.js
│   └── coach/                    # przykładowa domena: zwykły rozmówca; nowy projekt pisze tu swoją
├── public/
│   ├── index.html, main.js, api.js       # jedna prosta strona sesji
│   ├── stt.js, mic-start.js, voice-check.js, mic-calibration.js, mic-diagnostics.js, audio-onset.js
│   ├── session/                  # lite-adapter, conversation-floor, avatar-onset, turn-latency
│   ├── ui/
│   └── camera/                   # OPCJONALNIE (zadanie 03): camera, yolo-stream, deviation-debouncer,
│                                 # correction-loop, cue-scheduler, snapshot, camera-framing, yolo-session-log
├── yolo-backend/                 # OPCJONALNIE (zadanie 03): serwis Python + scenariusz standing.json
└── test/
```

## 8. Kamera jako moduł opcjonalny

- Apka bez kamery działa bez `public/camera/` i bez `yolo-backend` — strona
  ładuje moduł kamery `import()` tylko, gdy `/api/config` mówi, że kamera jest
  włączona (adres YOLO ustawiony).
- `yolo-backend` uruchamia się osobno (Docker albo `uvicorn`), tak jak dziś
  w jodze; serwer Node z nim nie rozmawia, łączy się przeglądarka.
- Testy `yolo-backend/tests` przechodzą bez scenariuszy jogi.

## 9. Zmienne środowiskowe

Jak w language-coach (`GEMINI_*`, `GROQ_*`, `ELEVENLABS_*`, `LIVEAVATAR_*`,
progi czasowe, `HOST`, `PORT`, opcjonalnie `SUPABASE_*`), bez `COACH_*`. Nowe:

| Zmienna | Wymagana | Do czego |
|---|---|---|
| `YOLO_POSE_WS_URL` | nie | adres strumienia YOLO; pusty = kamera wyłączona |
| `LIVEAVATAR_SESSION_LIMIT_S` | nie | skrócony limit sesji awatara do testów podmiany |
| `YOLO_MODEL`, `CORS_ORIGINS` | nie | w `yolo-backend` |

## 10. Ryzyka

1. **AGPL Ultralytics** (punkt 1.7) — każda apka z kamerą z szablonu dziedziczy
   ten warunek.
2. **Rozjazd kopii.** Po wydzieleniu poprawki w jodze i language-coach nie
   trafiają same do szablonu (i odwrotnie). Ograniczam to, przenosząc testy
   razem z kodem i opisując w README, skąd pochodzi każdy moduł.
3. **Przenoszenie dopracowań z `lite-pipeline.js`.** Przerwa, okno
   zakończenia i podmiana awatara mają w jodze poprawki po konkretnych
   sesjach, często z warunkami o planie. Przy przepisywaniu na silnik
   language-coach łatwo zgubić warunek — dlatego najpierw testy z jogi,
   potem kod.
4. **Dwa sposoby przerywania awatara** (ściszenie w jodze, pauza
   w language-coach). Szablon bierze jeden; drugi zostaje w swoim repo.
5. **Python i model YOLO na serwerze** — osobny kontener, waga modelu
   pobierana przy pierwszym starcie; przy GPU inne wymagania niż w jodze.
6. **Bez zapasu dla kamery.** Gdy serwis YOLO nie działa, apka nie ocenia
   postawy wcale (w jodze przejmował MediaPipe). Rozmowa działa dalej.

## 11. Otwarte pytania

1. **MediaPipe jako zapas w szablonie?** Rekomendacja: tak, `pose-detector.js`
   i tak przenosimy (geometria), a zapas działa, gdy YOLO jest niedostępny.
   O: Nie, zostawmy tylko yolo do biomechaniki
   Decyzja: tylko YOLO — sekcja 2 (kamera) i sekcja 6 poprawione.

2. **Nazwa katalogu domeny:** `src/domain/` czy `src/coach/` jak
   w language-coach? Rekomendacja: `src/domain/`, bo nie każda apka to coach.
   O: tutaj chyba nie ma sensu tych domen nie jestem pewny bo myslalem bardziej ze bede sobie kopiował to repo poprostu jako template nowego projektu
   Decyzja: repo kopiujemy jako start nowego projektu; kod projektu siedzi w `src/coach/`
   (ta sama nazwa co w language-coach), reszta zostaje nietknięta, żeby poprawki silnika
   dało się przenosić między repo.

3. **Klasyfikator intencji modelem** (`intent-shadow.js`) w szablonie od razu?
   Rekomendacja: nie w MVP; sam słownik + znaczniki modelu wystarczą, model
   jako zapas dołożyć, gdy gym-coach pokaże w dzienniku, że słownik nie
   wystarcza.
   O: nie wiem do czego to jest rozjaśnij troche jak mozesz
   Decyzja: nie w MVP; wraca, gdy dziennik pokaże, że słownik nie łapie poleceń.
4. **Przykładowy scenariusz YOLO:** neutralna „stojąca sylwetka” (sprawdza
   tylko widoczność punktów) czy od razu przysiad z gym-coach?
   Rekomendacja: neutralna sylwetka; przysiad należy do gym-coach (zadania 05–06).
   O: chyba tak jak mówisz, trochę nie rozumiem tego
   Decyzja: `yolo-backend/scenarios/standing.json` — stojąca sylwetka, jedna
   reguła (barki nad biodrami). Służy do sprawdzenia, że kamera, YOLO
   i korekta głosem działają; prawdziwe ćwiczenia dokłada projekt.

## 12. Kolejność prac

- [x] 01: ten dokument
- [x] 02a: szkielet repo, silnik i adaptery z language-coach, przykładowy coach,
      trasy sesji, testy silnika i adapterów
- [x] 02b: `session-control.js` (przerwa, koniec: głos i przycisk) z testami z jogi
- [x] 02c: strona sesji w `public/` (awatar, mikrofon, przyciski przerwy i końca),
      README „nowa apka z szablonu”
- [x] 02f: strona sesji na React + Vite (jak language-coach): `web/`, części do
      wielokrotnego użytku (`useSession`, `components/`, `texts.js`), stara strona
      usunięta, `/` → `/app/`
- [x] 02d: strażnik sesji, SIGTERM, `isLoneCourtesy`, `mic-start.js`, sprawdzenie
      głosu, `turn-latency.js`
  - [x] 1/6 strażnik sesji bez przeglądarki (`src/engine/session-watchdog.js`) i puls SSE co 20 s
  - [x] 2/6 łagodne zamknięcie przy SIGTERM/SIGINT (sesje awatara w 8 s, wpis do rejestratora)
  - [x] 3/6 sama grzeczność („Dziękuję”, „mhm”) przy wstrzymanym awatarze wznawia jego
        kwestię zamiast ją porzucać; słowa w `speech().courtesyWords` w `src/coach/`
  - [x] 4/6 trasa `/api/session/report` (zdarzenia przeglądarki do rejestratora) i mikrofon
        wiszący bez błędu (`mic-start.js`, komunikat z przyciskiem)
  - [x] 5/6 czas reakcji po każdej turze (`turn-latency.js`)
  - [x] 6/6 sprawdzenie głosu przed Startem: progi z `sessionThresholds` (przerywanie ×1,8
        jak w jodze), `mic-diagnostics.js`, komponent `VoiceCheck.jsx`; suwak czułości
        wycięty (decyzja z 2026-10-27)

  **Rozjazd z language-coach od 02d.** `public/stt.js` i `public/session/lite-adapter.js`
  nie są już kopiami z language-coach: mają start mikrofonu z `mic-start.js`, progi
  z `mic-calibration.js`, diagnostykę słyszenia, pomiar czasu reakcji i raporty
  przez `/api/session/report`. Nowsza wersja jest w szablonie; language-coach
  może ją wziąć stąd (`diff`), nie odwrotnie.

  **Barge-in — stan i znane dziury (sprawdzone 2026-10-27, szablon = language-coach).**
  Awatar mówi, VAD słyszy dźwięk → kwestia wstrzymana. Dźwięk krótszy niż 150 ms,
  pusty tekst, halucynacja Whispera albo echo → kwestia wraca od ostatniej pauzy
  w mowie; konkretna wypowiedź → model odpowiada na nią; 8 s bez rozstrzygnięcia →
  zwykłe przerwanie. Dziury:
  - przekręcony, ale niepusty tekst z Whispera (bełkot) liczy się jak konkretna
    wypowiedź; filtr pewności Whispera nie pomaga (joga: halucynacje przychodzą
    z `no_speech_prob = 0`), samą grzeczność łapie etap 3/6;
  - wypowiedź w pierwszych 0,6 s mowy awatara albo w pierwszych 2,5 s czekania na
    odpowiedź modelu przepada (`turn_dropped`).
  **Decyzja:** bez kolejkowania wypowiedzi (w praktyce wychodzi źle); dziury
  zostają opisane, wracamy do nich później innym sposobem.
- [x] 02e: podmiana sesji awatara przed limitem (`atBoundary`) — 2026-10-28
  - limit z `max_session_duration`, skracany do testów przez `LIVEAVATAR_SESSION_LIMIT_S`;
  - dogodny moment między wypowiedziami + hook domeny, z awaryjnym terminem przed wygaśnięciem;
  - podmiana samego awatara i pokoju LiveKit; historia, identyfikator rozmowy,
    stan domeny, przerwa, transkrypcja i ustawienia mikrofonu pozostają;
  - potwierdzenie gotowości audio, odtworzenie stanu po ponownym połączeniu SSE,
    sprzątanie przy błędzie i końcu w trakcie podmiany;
  - testy bez usług zewnętrznych: adapter dostawcy, silnik i adapter przeglądarki;
    instrukcja rzeczywistej rozmowy ze skróconym limitem w README.
  - użytkownik potwierdził działanie podmiany z prawdziwym awatarem (2026-10-28).
- [x] 02g: hooki domeny `onPause` / `onResume` — 2026-10-28
  - zatrzymanie przy przerwie i oknie zakończenia, wznowienie po powrocie;
  - wspólne dla głosu i przycisków, raz na zmianę między aktywnością a zatrzymaniem;
  - bez drugiego zatrzymania przy przejściu z przerwy do okna zakończenia;
  - test zegara domeny, powtarzanych żądań i błędów hooków; kontrakt i przykład w README.
- [x] 04: `gym-coach` z szablonu — 2026-10-28
  - projekt w `/home/barte/projects/gym-coach`, zachowany istniejący Git i remote;
  - polski trener w `src/coach/`: cel, doświadczenie, sprzęt; teksty aplikacji i przerwy;
  - silnik i adaptery identyczne z szablonem po 02e i 02g;
  - oddzielne porty: serwer 3001, Vite 5174; lokalny `.env` ignorowany przez Git;
  - 15/15 plików testowych i build przechodzą; prawdziwy model odpowiedział jako Gym Coach;
  - Chromium: strona na 3001, dwie podmiany i Stop podczas przełączania (atrapy transportu);
  - pełna rozmowa głosowa z rzeczywistym awatarem pozostaje do sprawdzenia w interfejsie.
- [x] 03 (w gym-coach, nie w szablonie): kamera i `yolo-backend` z yoga-startup — 2026-10-28
  - [x] 1/5 `yolo-backend` bez asan; `standing.json` z jedną regułą (barki nad biodrami);
        9 testów Pythona bez scenariuszy jogi
  - [x] 2/5 panel kamery (przycisk, wybór urządzenia, lustrzany podgląd, nakładka);
        `YOLO_POSE_WS_URL` → `GET /api/config` → `lazy()`; nagłówki wpuszczają kamerę
        i adres YOLO tylko z ustawionym adresem
  - [x] 3/5 klatki przez `yolo-stream.js` (adres z `/api/config`), szkielet na podglądzie;
        bez YOLO sam podgląd z komunikatem
  - [x] 4/5 `correction-loop.js` (tylko tor YOLO), debouncer i `cue-scheduler` z jogi;
        `POST /api/session/cue` z bramką na stanie sesji, tekst z pliku scenariusza
        (`src/coach/cues.js`); cisza w przerwie, oknie końca, pożegnaniu i podmianie awatara
  - [x] 5/5 149 testów JS, 9 Pythona, build; Chromium ze sztuczną kamerą: prawdziwy
        `app.py` z atrapą modelu (szkielet, uwaga, korekta do `/api/session/cue`), przerwa
        (brak korekty), YOLO wyłączony (sam podgląd)
  - nie przeniesione: `snapshot.js` (migawka do promptu), `yolo-session-log.js`,
    `camera-framing.js`, strona testowa YOLO — wrócą, gdy będą potrzebne (05–06);
  - do sprawdzenia na żywo: prawdziwy model YOLO z kamerą i korekta wypowiedziana
    przez rzeczywistego awatara.
