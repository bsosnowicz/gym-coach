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

## Sprawdzenie

```bash
npm test
npm run build:web
npm run smoke
# Dodatkowo start i zamknięcie prawdziwego awatara:
npm run smoke -- --avatar
```

Testy `npm test` działają bez sieci. Smoke korzysta z rzeczywistych usług i limitów API.
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

Konfiguracja API, podmiana wygasającej sesji awatara, hooki `onPause` / `onResume`
i szczegóły silnika: [dokumentacja szablonu](docs/AVATAR_TEMPLATE.md).
Historia wydzielenia: [EXTRACTION_PLAN.md](EXTRACTION_PLAN.md).

Weryfikacja etapu 04: 15/15 plików testowych, build, odpowiedź rzeczywistego
modelu i test Chromium z atrapami transportu. Pełną rozmowę z rzeczywistym awatarem
sprawdź w interfejsie według instrukcji powyżej.

## Plan

- [x] 04: aplikacja z szablonu, domena Gym Coacha i polska rozmowa głosowa.
- [ ] 03: kamera i `yolo-backend` z `yoga-startup`.
- [ ] 05: fazy ruchu i liczenie powtórzeń.
- [ ] 06: scenariusze ćwiczeń i korekty techniki.

Na etapie 04 trener nie otrzymuje obrazu z kamery ani pomiarów ruchu.
