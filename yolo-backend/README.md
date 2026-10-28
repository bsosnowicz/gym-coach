# YOLO Pose Backend (Gym Coach)

Oddzielny serwis do analizy klatek obrazu przez YOLO Pose. Zwraca punkty
sylwetki (COCO-17) i ocenę względem wybranego scenariusza z `scenarios/`.
Przeniesiony z `yoga-startup/yolo-backend` bez scenariuszy asan.

Serwer Node Gym Coacha z nim nie rozmawia — łączy się przeglądarka. Gdy
serwis nie działa, aplikacja pokazuje sam podgląd kamery, a rozmowa trwa dalej.

## Uruchomienie lokalne

```bash
cd yolo-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Przy pierwszym starcie Ultralytics pobiera wagę z `YOLO_MODEL`, domyślnie
`yolov8n-pose.pt`. Na serwerze wgraj wagę lokalnie i ustaw np.
`YOLO_MODEL=/models/yolov8n-pose.pt`.

## Docker

```bash
docker build -t gym-coach-yolo .
docker run --rm -p 8000:8000 \
  -e CORS_ORIGINS=http://127.0.0.1:3001,http://localhost:5174 \
  gym-coach-yolo
```

`CORS_ORIGINS=*` jest domyślne do developmentu. Na produkcji ustaw adres strony.

## Testy

```bash
cd yolo-backend
python3 -m unittest discover -s tests
```

Testy potrzebują tylko `fastapi` i `pydantic`, bez modelu YOLO.

## API

### `GET /health`

Stan serwisu, model i lista scenariuszy.

### `POST /api/analyze` i `POST /api/analyze-json`

Pojedyncza klatka jako multipart (`image`, opcjonalnie `scenario`) albo JSON
`{ "image_base64": "...", "scenario": "standing" }`.

```bash
curl -F "image=@frame.jpg" -F "scenario=standing" http://localhost:8000/api/analyze
```

### `WS /ws/analyze`

Jedno połączenie na sesję; przeglądarka wysyła pomniejszone klatki JPEG
(5–10 na sekundę, ok. 640 px szerokości), a serwis odsyła wynik z tym samym
`frame_id`.

```text
ws://localhost:8000/ws/analyze?scenario=standing
```

- serwis → `{ "type": "ready", "scenario": "standing", "model": "...", "scenarios": ["standing"] }`
- strona → `{ "type": "frame", "frame_id": 123, "image_base64": "/9j/..." }`
- serwis → `{ "type": "analysis", "frame_id": 123, "detected": true, "is_correct": false, "score": 0.67, "deviations": [{ "id": "knees_too_bent", "correction": "Wyprostuj nogi, bez blokowania kolan.", "value": 132.4, "expected": { "min": 155 } }], "person": { "keypoints": [...] } }`
- zmiana scenariusza bez ponownego łączenia: `{ "type": "set_scenario", "scenario": "standing" }` → `{ "type": "scenario_set", "scenario": "standing" }`

Bez `scenario` serwis zwraca same punkty i widoczność (`is_correct: null`).

## Scenariusze

`scenarios/<id>.json`, gdzie `id` równa się nazwie pliku. Każda reguła mierzy:

- `angle`: kąt `a-b-c` w punkcie `b` (stopnie),
- `horizontal_delta`: `b.x - a.x`,
- `vertical_delta`: `b.y - a.y`,

z progami `min` / `max` i tekstem `correction`, który trafia do korekty głosem.
Współrzędne są znormalizowane do ramki, oś `y` rośnie w dół. Reguła z `left`
i `right` mierzy stronę z pewniejszymi punktami.

`standing` to neutralna postawa wyjściowa; scenariusze ćwiczeń (przysiad)
dochodzą na etapach 05–06.
