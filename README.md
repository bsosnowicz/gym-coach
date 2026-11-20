# Gym Coach

Trener siłowy AI, z którym rozmawia się głosem przez awatara LiveAvatar Lite.
Poznaje cel treningu, doświadczenie, sprzęt i czas, układa plan i prowadzi trening
seria po serii: przerwy odlicza sam, zmienia ćwiczenia na prośbę, przy bólu przerywa
i pamięta kontuzje między sesjami. Działa po polsku, z krótkimi odpowiedziami.

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

### Tryb bez awatara (`COACH_AVATAR=voice`)

Z `COACH_AVATAR=voice` w `.env` (i restartem serwera) trener nie ma wideo LiveAvatar:
jego głos gra przeglądarka, a w miejscu wideo stoi rysowana maskotka na scenie.
Klucz `LIVEAVATAR_API_KEY` nie jest wtedy potrzebny; nie ma limitu czasu ani jednej sesji
naraz z sandboxu, a minuta wychodzi ok. 3× taniej. Przy starcie serwer pisze, który tryb działa.

- Serwer (`src/adapters/avatar/browser-voice.js`) wysyła dźwięk w zdarzeniach SSE
  kawałkami po 250 ms (`audio`, `audio_stop` przy przerwaniu); „zaczął/skończył mówić” liczy
  zegar: długość wysłanego dźwięku + 300 ms. Podmiana awatara przed limitem się nie włącza.
- Strona gra kawałki przez Web Audio (`public/session/voice-player.js`). Usta maskotki
  układają się według liter mówionych w danej chwili (czasy liter przychodzą od ElevenLabs
  razem z dźwiękiem, `public/session/visemes.js`), a bez nich według głośności
  (`public/session/voice-level.js`).
- Stan maskotki: przerwa, radość przez 2 s po skończonej serii i treningu, mówi, myśli
  (użytkownik mówił ostatni), słucha (mikrofon włączony), spoczynek.
- Maskotki i tła (`public/ui/mascots.js`, `public/ui/scenes.js`, `public/css/mascot.css`,
  `public/css/scene.css`) są tymczasowo z language-coach, do czasu własnych z Claude Design;
  kontrakt animacji opisuje nagłówek `mascot.css`.

## Plan tygodnia (etap 12)

Dwa rodzaje rozmowy. Bez aktywnego planu (albo po przycisku **Nowy plan / wywiad**, głosem
„ułóż nowy plan”) trener prowadzi **wywiad**: cel, staż, ile dni i które, ile minut, sprzęt,
wiek, wzrost, waga, płeć, partie priorytetowe, kontuzje. Model pisze
`[PROFILE goal=… level=… equipment=… days=… minutes=… weekdays=… age=… sex=… height=… weight=… priorities=…]`,
trener czyta podsumowanie, a po „tak” kod układa plan na tydzień (`src/coach/week-plan.js`),
zapisuje profil i plan (wariant A) i pyta, czy zacząć dzisiejszy trening.
Z planem sesja jest **treningiem z dnia planu**: krótko „jak się czujesz, masz tyle czasu co
zwykle?”, potem `[TODAY]` (`minutes=30` — krócej, `day=thu` — inny dzień planu).

Zasady trenerskie są w jednym miejscu, `src/coach/programming.js`:

| Dni / poziom | Split |
| --- | --- |
| 1–3 dni | full body (zaawansowany przy 3 dniach: push / pull / nogi) |
| 4 dni | góra / dół |
| 5 dni | push / pull / nogi + góra / dół (zaawansowany: split na partie) |
| 6 dni | push / pull / nogi dwa razy |
| początkujący | najwyżej 4 dni, full body albo góra / dół |

- Te same mięśnie co najmniej 48 h przerwy; własne dni łamiące tę zasadę dostają ostrzeżenie.
- Intensywność z celu: siła — ciężka (5 powt., przerwy 3 min / 90 s), masa i sprawność —
  umiarkowana (10 powt., 2 min / 75 s), kondycja — lekka (15 powt., 60 / 45 s); krótsza przerwa
  w ćwiczeniach izolowanych. Początkujący i osoby po 60. roku życia z celem „siła” zaczynają
  od umiarkowanej.
- Serie tygodniowo na grupę (klatka, plecy, przód uda, tył uda z pośladkami, barki):
  początkujący 8–10, średni 10–15, zaawansowany 15–20. Za mało — seria więcej (akcesoria
  robią miejsce w czasie treningu), za dużo — najpierw odpada nadmiarowe ćwiczenie.
- Wielostawowe przed izolowanymi, partie priorytetowe na początku i z serią więcej; dzień
  splitu (pull, nogi…) bez dopełniania innymi partiami; drugi dzień tego samego typu ma inne
  ćwiczenia.
- Co 5. tydzień lżejszy: ok. 60% serii, ciężary bez zmian.

**Warianty:** zamiana albo usunięcie ćwiczenia w trakcie treningu zapisuje plan jako
wariant B (rodzic: A), A zostaje; kolejne zmiany nadpisują B. Pominięcie i mniej serii są
tylko na dziś. Na koniec trener o tym mówi; „wróć do wariantu A” przełącza z powrotem.

**Kalendarz** pod przyciskami: tydzień, dziś zaznaczony, ćwiczenia wybranego dnia, split,
intensywność, wariant (`web/src/workout/WeekCalendar.jsx`, dane z `GET /api/plan`
i zdarzenia `week_plan`).

## Trening głosem

1. **Wywiad.** Trener pyta o cel, poziom, sprzęt i czas. Gdy zna odpowiedzi, model pisze
   znacznik `[PLAN goal=… level=… equipment=… minutes=…]`, a plan układa kod
   (`src/coach/planner.js`) z katalogu ćwiczeń. Trener czyta plan, panel pod przyciskami go pokazuje.
2. **Prowadzenie.** „Gotowe” / „dalej” / „zrobiłem 8” kończy rozgrzewkę albo serię — bez
   modelu (`src/coach/workout.js`). Przerwę odlicza serwer, „gotowe” w przerwie ją skraca.
   Panel pokazuje bieżące ćwiczenie, serię i odliczanie. Przycisk Przerwa wstrzymuje odliczanie.
3. **Zmiany.** „Za ciężko” → mniejszy ciężar o ok. 10% (ćwiczenie bez ciężaru: łatwiejszy
   zamiennik), „za lekko” / „daj 70 kilo” → więcej; „nie pasuje mi” → zamiennik nie
   trudniejszy, „zamień na hantle” → zamiennik na hantlach; „nie mam ławki” → wymiana
   wszystkich ćwiczeń z ławką; „pomińmy to”; mniej albo więcej serii; dłuższe / krótsze
   przerwy (±30 s albo podana liczba, także ta, która trwa).
4. **Ból.** „Boli mnie prawe kolano” → ćwiczenie przerwane od razu, zamiennik i reszta planu
   bez obciążania kolana; przy ostrym bólu rada, żeby skończyć. Zgłoszenie trafia do Supabase.
5. **Koniec.** Podsumowanie: ćwiczenia, serie, powtórzenia. Dziennik zapisuje się po każdej
   serii, więc zostaje też po Stop albo zamkniętej karcie.

Bez kamery liczbę powtórzeń podaje użytkownik („zrobiłem 8”); z kamerą liczy ją YOLO
(przysiady, pompki, wyciskanie nad głowę — „Liczenie powtórzeń” niżej).

### Plany między sesjami (etap 10)

- **Potwierdzenie:** po wywiadzie trener czyta, co zrozumiał („Podsumuję: cel …, siłownia,
  20 minut, skupiamy się na: nogi. Układam plan?”), plan powstaje po „tak”; poprawka wraca
  do rozmowy.
- **Stały schemat:** ten sam cel, sprzęt i partia co w zapisanym treningu — te same ćwiczenia
  z progresją; kontuzja albo brak sprzętu wymienia tylko to, czego dotyczy. „Ułóż nowy plan”
  daje inne ćwiczenia. Kolejny trening zaczyna się krótko: samopoczucie, sprzęt, czas,
  to samo co ostatnio? — bez pytania o poziom.
- **Regeneracja:** te same mięśnie trenowane mniej niż 48 h temu — ostrzeżenie w podsumowaniu,
  a jeśli mimo to trening, ciężary się nie podnoszą.
- **Partie:** grupy nogi, plecy, ramiona, core albo pojedynczy mięsień; ok. 2/3 planu.
- **Koniec przerwy:** licznik na obrazie awatara; po czasie „Koniec przerwy … Jesteś
  gotowy?”, seria rusza po „tak” (jedno przypomnienie po 45 s).

- **Ciężar.** „Zrobiłem 8 na 60 kilo” zapisuje powtórzenia i ciężar serii w dzienniku.
- **Progresja** (`src/coach/progression.js`): dla każdego ćwiczenia decyduje ostatnia sesja,
  w której było. Komplet serii i powtórzeń → dziś więcej (sztanga +2,5 kg, hantle +2, kettlebell
  +4, maszyna +5; bez ciężaru +2 powtórzenia, deska +10 s); coś nie wyszło → tyle samo.
  Trener mówi to przy pierwszej serii.
- **Różnorodność A/B** (gdy nie ma schematu): w slocie wygrywa ćwiczenie spoza ostatniej sesji.
- **Partia mięśni:** „chcę popracować nad tyłem uda” → `focus=hamstrings`; do dwóch ćwiczeń
  na tę partię na początku planu, tylko bezpieczne przy kontuzjach.
- **Kontuzje:** zapisuje się każda wzmianka o urazie, także bez słowa „boli” i podana jako cel
  (zapas w kodzie, `src/coach/body-mentions.js`, gdy model nie dopisze znacznika); ta sama
  partia zapisuje się ponownie tylko przy mocniejszym bólu. Ból zgłoszony w czasie przerwy
  w sesji jest zapisany od razu, a plan zmienia się po powrocie.
- Przeciwwskazania jak w jodze: każdy wzorzec ruchu ma listę twardą (ćwiczenie wypada zawsze)
  i miękką (wypada, chyba że ból jest lekki); nakładka dopisuje partie pojedynczym ćwiczeniom.

### Katalog ćwiczeń

`data/exercises.json` to [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(Unlicense — domena publiczna, użycie komercyjne dozwolone), przypięta do commita i odświeżana
`node scripts/import-exercises.js [commit]`. Zostają tylko fakty (nazwa, sprzęt, mięśnie,
poziom, typ ruchu), bez opisów i zdjęć. `data/exercises-pl.json` wybiera ćwiczenia (86 na start)
i dodaje polską nazwę, wzorzec ruchu i wyposażenie (ławka, stojak, drążek…). Wzorzec ruchu
mówi, które partie ciała ćwiczenie obciąża (`src/coach/exercises.js`) — po tym filtr kontuzji.
Nowe ćwiczenie: dopisz wpis do nakładki z `id` z bazy; `npm test` sprawdzi, czy istnieje.

### Supabase (kontuzje i dziennik)

Bez `SUPABASE_*` trening działa, tylko niczego nie pamięta między sesjami. Z bazą:

1. Załóż projekt Supabase i uruchom migracje z `supabase/migrations/` po kolei (SQL Editor
   albo `supabase db push`): `user_injuries`, `workout_sessions`, `user_injuries_unique`
   (scala duplikaty i pilnuje jednego wiersza na partię ciała) i `user_profiles_training_plans`
   (profil z wywiadu i plany tygodniowe z wariantami; jeden aktywny plan na użytkownika).
2. W `.env`: `SUPABASE_URL` (sam adres projektu, `https://<ref>.supabase.co`),
   `SUPABASE_SECRET_KEY` (Project Settings → API Keys → Secret key `sb_secret_…`, tylko serwer;
   starszy JWT `service_role` może być pod `SUPABASE_SERVICE_ROLE_KEY`), `GYM_COACH_USER_ID`
   (do czasu logowania jeden użytkownik). Po zmianie `.env` zrestartuj serwer.
3. Przy `npm start` serwer pisze, czy zapis jest włączony. Wynik zapisu każdej kontuzji
   widać w Dzienniku na stronie i w terminalu.
4. Przy starcie sesji serwer czyta aktywne kontuzje (plan je omija, trener pyta, jak się
   czują) i ostatni trening (trener może do niego nawiązać).

Klient to zwykły `fetch` do REST (`src/coach/supabase.js`), bez paczek npm. Awaria bazy
nie zatrzymuje sesji.

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

### Liczenie powtórzeń (etap 05)

Scenariusz ćwiczenia w `yolo-backend/scenarios/` mówi wszystko, czego potrzeba kamerze:

| Pole | Znaczenie |
| --- | --- |
| `exercises` / `patterns` | które ćwiczenia ogląda (lista ćwiczeń wygrywa z wzorcem ruchu) |
| `view` | `side` albo `front` — skąd kamera ma widzieć ćwiczenie |
| `rep` | kąt z `rules` (reguła bez `min`/`max` tylko mierzy), pozycja startowa `high`/`low`, progi `low` i `high` |

Na start: `squat` (przysiady, z boku, kąt w kolanie), `pushup` (pompki, z boku, łokieć),
`overhead_press` (wyciskanie nad głowę, z przodu, łokieć). Nowe ćwiczenie to nowy plik JSON
i restart serwisu YOLO oraz `npm start` (oba czytają scenariusze przy starcie).

- Zdarzenie `workout` niesie `camera` bieżącego ćwiczenia (w przerwie — następnego), panel
  przełącza scenariusz YOLO razem z planem (`src/coach/camera-scenarios.js`).
- Powtórzenie to wyjście z pozycji startowej za drugi próg i powrót (`public/camera/rep-counter.js`);
  przerwa między progami chroni przed liczeniem wahań, szybszy skok niż 0,6 s to szum.
  Licznik działa tylko w serii, każda seria od zera; panel pokazuje widok i liczbę.
- Każda nowa liczba idzie do `POST /api/session/reps`. „Gotowe” bez liczby bierze liczbę
  z kamery z tej samej serii, a trener mówi „Seria zaliczona, kamera naliczyła 9”;
  „zrobiłem 9” zawsze wygrywa. Seria z kamery ma w dzienniku `source: "camera"`.
  Kamera zgaszona w trakcie serii — liczba przepada (byłaby częściowa).
- Strona zgłasza, czy analiza działa (`POST /api/session/camera`). Tylko wtedy, przy ćwiczeniu
  z innym widokiem niż poprzednie, trener mówi „Ustaw kamerę z boku / z przodu…”: w zapowiedzi
  przerwy przed nowym ćwiczeniem albo przed pierwszą serią.
- **Bramki pozycji** (`rep.gates`): reguły mówiące, że to w ogóle to ćwiczenie — pompka tylko
  z tułowiem w podporze (`incline` bark→biodro < 35°), wyciskanie z dłońmi nie niżej niż barki,
  przysiad z tułowiem nie poziomo. Klatka z niespełnioną albo niewidoczną bramką nie liczy się
  (łokieć zgina się tak samo w wyciskaniu jak w pompce), a trener mówi jej `correction`
  („To nie wygląda na pompkę…”) — tylko w trakcie serii, w przerwie milczy (`cues.js`).
- Serii kamera sama nie kończy — liczy i podpowiada; koniec serii to dalej „gotowe”.
- Trener liczy na głos każde nowe powtórzenie z kamery („jeden”, „dwa”…), tylko gdy nikt
  nie mówi (spóźniona liczba w środku zdania przeszkadza bardziej niż pominięta). Liczby nie
  trafiają do historii rozmowy modelu (`speakText(…, { remember: false })` w silniku):
  historia ma 12 wiadomości, jedna seria by ją wypchnęła.

Sprawdzenie: przysiad w planie, Włącz kamerę, po rozgrzewce trener prosi o kamerę z boku;
zrób kilka przysiadów — panel liczy; „gotowe” — trener podaje liczbę z kamery.

**Test kamery bez sesji:** http://127.0.0.1:3001/app/#test-kamery (link „Test kamery (bez sesji)”
na stronie głównej, gdy sesja nie trwa). Bez awatara i modelu, więc bez kosztów: wybór ćwiczenia
z listy scenariuszy (`/api/config` → `camera.scenarios`), od razu „seria”, licznik, a pod nim kąt
na żywo, najniższy i najwyższy w serii oraz progi; „Nowa seria” zeruje. Do strojenia progów:
dół ruchu musi schodzić poniżej progu „dół”, pozycja startowa — powyżej „góra” (wyciskanie
odwrotnie). Po zmianie `rep` w JSON wystarczy restart `npm start`.

**Test kamery z trenerem:** na stronie głównej „Test kamery z trenerem: [ćwiczenie] Start testu”
(sesja `camera_test`). Model tylko się wita; od razu seria wybranego ćwiczenia (przysiad bez
obciążenia, pompki, wyciskanie hantlami siedząc — najmniej sprzętu), bez planu, rozgrzewki,
kontuzji z bazy i bez zapisu w dzienniku (test zafałszowałby progresję i regenerację). Trener prosi
o ustawienie kamery, liczy na głos, po „gotowe” mówi wynik z kamery; panel pokazuje kąty.

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

Tryb bez awatara przyszedł z language-coach (commity „Voice mode” z 2026-11-03) i zmienia
silnik: `send()` w `avatar.start` (`session.js`) oraz czasy liter w `onAudio` i `push`
(`turn.js`, `ports.js`, adapter ElevenLabs). W `avatar-template` tych zmian jeszcze nie ma:
szablon ma niezacommitowane 02e/02g, więc trafią tam po ich commicie.

Konfiguracja API, podmiana wygasającej sesji awatara, hooki `onPause` / `onResume`
i szczegóły silnika: [dokumentacja szablonu](docs/AVATAR_TEMPLATE.md).
Historia wydzielenia: [EXTRACTION_PLAN.md](EXTRACTION_PLAN.md).

Weryfikacja etapu 04: 15/15 plików testowych, build, odpowiedź rzeczywistego
modelu i test Chromium z atrapami transportu. Pełną rozmowę z rzeczywistym awatarem
sprawdź w interfejsie według instrukcji powyżej.

## Plan

- [x] 04: aplikacja z szablonu, domena Gym Coacha i polska rozmowa głosowa.
- [x] 03: kamera i `yolo-backend` z `yoga-startup`, korekta postawy głosem (scenariusz `standing`).
- [x] 10: plany między sesjami — ciężar, progresja, różnorodność A/B, partia mięśni;
  kontuzje bez duplikatów i z przerwy w sesji.
- [x] 04b: prowadzenie treningu głosem — katalog z free-exercise-db, plan z rozmowy, serie
  i przerwy, podgląd na żywo, zmiany w locie, ból i kontuzje oraz dziennik w Supabase.
- [x] 12: wywiad i plan na cały tydzień według zasad trenerskich, kalendarz, trening z dnia
  planu, warianty A/B, sygnały w trakcie (ciężar, serie, przerwy, zamiana na sprzęt).
- [ ] 05: fazy ruchu i liczenie powtórzeń — liczenie, widok kamery i zapowiedź gotowe
  (przysiad, pompka, wyciskanie); zostaje strojenie progów na żywo i więcej ćwiczeń;
  potem sprawdzanie, czy kamera stoi z właściwej strony.
- [ ] 06: scenariusze ćwiczeń i korekty techniki.

Model rozmowy nadal nie widzi obrazu ani pomiarów; korekty z kamery wypowiada aplikacja.
