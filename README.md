# Gym Coach

Trener siłowy AI, z którym rozmawia się głosem przez awatara LiveAvatar Lite.
Poznaje cel treningu, doświadczenie i dostępny sprzęt, a następnie dopasowuje rozmowę
oraz ogólne wskazówki. Działa po polsku, z krótkimi odpowiedziami i jednym pytaniem naraz.

## Uruchomienie

Wymagany Node 22 lub nowszy.

```bash
npm ci
test -f .env || cp .env.example .env
# Uzupełnij klucze API w .env.
npm run build:web
npm start
```

Otwórz http://127.0.0.1:3001/app/. Lokalna kopia `.env` została przygotowana
z konfiguracji szablonu; nie zastępuj jej pustym przykładem, jeśli już istnieje.
Projekt ma oddzielny port od `avatar-template`. Jednoczesne rozmowy zależą od
limitu współbieżnych sesji na koncie LiveAvatar.

Frontend z odświeżaniem na żywo:

```bash
npm start
# W drugim terminalu:
npm run dev:web
```

Vite działa na http://localhost:5174/app/ i przekazuje `/api` do serwera na 3001.

## Kamera i korekta postawy (opcjonalnie)

Bez `YOLO_POSE_WS_URL` aplikacja działa jak wcześniej, sama rozmowa, i nie pobiera
kodu kamery. Z kamerą potrzebny jest osobny serwis YOLO
([yolo-backend/README.md](yolo-backend/README.md)):

```bash
cd yolo-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

W `.env` aplikacji ustaw `YOLO_POSE_WS_URL=ws://localhost:8000/ws/analyze` i uruchom
`npm start` ponownie. Pod przyciskami sesji pojawi się panel kamery:

- kamera włącza się tylko przyciskiem; do YOLO trafiają pomniejszone klatki
  (6 na sekundę, maks. 640 px), obraz nie idzie na serwer aplikacji;
- na podglądzie widać punkty sylwetki, a pod nim uwagi ze scenariusza `standing`
  (barki nad biodrami);
- w trakcie sesji uwaga trwająca ponad 1 s trafia do awatara jako krótka korekta,
  gdy w rozmowie jest pauza; ta sama uwaga najwyżej co 15 s; w przerwie, oknie
  zakończenia i przy podmianie awatara korekty milczą;
- gdy YOLO nie działa, zostaje sam podgląd z komunikatem, a rozmowa trwa dalej.

Tekst korekty pochodzi z pola `correction` w `yolo-backend/scenarios/*.json`.
Przy Nginx na jednym hoście wystarczy adres względny, np. `/yolo/ws/analyze`.
Uwaga licencyjna: Ultralytics (YOLO) jest na licencji AGPL-3.0.

Sprawdzenie w interfejsie: Start, Włącz kamerę, stań bokiem albo przechyl się, poczekaj
na ciszę: trener powie „Stań prosto, barki nad biodrami.”. Potem Przerwa: korekty milkną.
Wyłącz serwis YOLO: panel pokazuje sam podgląd, rozmowa działa.

## Sprawdzenie

```bash
npm test
npm run build:web
npm run smoke
# Dodatkowo start i zamknięcie prawdziwego awatara:
npm run smoke -- --avatar
```

Testy `npm test` działają bez sieci. Testy serwisu YOLO:
`cd yolo-backend && python3 -m unittest discover -s tests` (wystarczą `fastapi` i `pydantic`). Smoke korzysta z rzeczywistych usług i limitów API.
W interfejsie: Start, sprawdzenie głosu, rozmowa o celu, doświadczeniu i sprzęcie,
Przerwa → Wracamy, Stop → anulowanie albo potwierdzenie zakończenia.

## Architektura

Projekt jest kopią `avatar-template` z 2026-10-28, po etapach 02e i 02g.
Własna domena znajduje się w `src/coach/`, teksty strony w `web/src/App.jsx`,
a teksty sterowania treningiem w wywołaniu `withSessionControl` w `server.js`.
Silnik rozmowy, adaptery dostawców i moduły mikrofonu pochodzą z szablonu.

Poprawki wspólnego silnika robimy w szablonie i przenosimy do tego repo:

```bash
diff -r ../avatar-template/src/engine src/engine
diff -r ../avatar-template/src/adapters src/adapters
```

Kamera mieszka w `public/camera/` (z yoga-startup: kamera, strumień YOLO, debouncer,
`cue-scheduler`, pętla korekty) i `web/src/camera/` (panel), a korekty po stronie serwera
w `src/coach/cues.js`. Etap 03 dotknął też plików wspólnych z szablonem:
`src/http/http-security.js` (`enableCamera`), `public/session/lite-adapter.js` (getter
`sessionId`), `web/src/session/useSession.js` (`floor`, `sessionId`) i
`web/src/screens/SessionScreen.jsx` (`children(session)`); `src/engine/` bez zmian.

Konfiguracja API, podmiana wygasającej sesji awatara, hooki `onPause` / `onResume`
i szczegóły silnika: [dokumentacja szablonu](docs/AVATAR_TEMPLATE.md).
Historia wydzielenia: [EXTRACTION_PLAN.md](EXTRACTION_PLAN.md).

Weryfikacja etapu 04: 15/15 plików testowych, build, odpowiedź rzeczywistego
modelu i test Chromium z atrapami transportu. Pełną rozmowę z rzeczywistym awatarem
sprawdź w interfejsie według instrukcji powyżej.

## Plan

- [x] 04: aplikacja z szablonu, domena Gym Coacha i polska rozmowa głosowa.
- [x] 03: kamera i `yolo-backend` z `yoga-startup`, korekta postawy głosem (scenariusz `standing`).
- [ ] 05: fazy ruchu i liczenie powtórzeń.
- [ ] 06: scenariusze ćwiczeń i korekty techniki.

Model rozmowy nadal nie widzi obrazu ani pomiarów; korekty z kamery wypowiada aplikacja.
