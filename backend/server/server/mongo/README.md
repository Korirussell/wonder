# Wonder MongoDB (Atlas) boilerplate

Python helpers under `server.mongo` for:

- **`users`** — profile + preferences (`auth_subject` from your auth provider)
- **`samples`** — per-user metadata (paths, vibe/math tags, source)
- **`sessions`** — copilot / agent runs with embedded `turns[]`

## Environment

From the **repo root** `wonder/.env` (loaded automatically):

| Variable | Required | Default |
|----------|----------|---------|
| `MONGODB_URI` | For live DB | — |
| `MONGODB_DB_NAME` | No | `wonder` |

Never commit secrets. See root `.env.example`.

## Usage

```python
from server.mongo import get_repository, session_document_to_analytics_events

repo = get_repository()
if repo is None:
    # MONGODB_URI not set
    ...
repo.upsert_user(UserUpsert(auth_subject="clerk|123", email="a@b.com"))
repo.upsert_sample(SampleUpsert(user_id="clerk|123", file_path="/path/kick.wav", ...))
repo.create_session(SessionCreate(user_id="clerk|123", session_id=str(uuid4()), ...))
```

## Snowflake export

After loading a session document (e.g. `repo.get_session(session_id)`):

```python
rows = session_document_to_analytics_events(doc)
# send `rows` to your warehouse ingest (batch or stream)
```

## HTTP health

`GET /health/mongo` on the FastAPI app reports configuration and connectivity.

REST routes live under `/api/mongo` (see `server.api.mongo_routes`).

## Smoke test script

From `backend/server` with the API server already running (and `MONGODB_URI` set):

```bash
./scripts/smoke_mongo_api.sh
```

Optional: `BASE_URL=http://127.0.0.1:9000 ./scripts/smoke_mongo_api.sh`

The script creates temporary user/sample/session rows keyed by `smoke-test-…` so you can find or delete them in Atlas.

Phase 0 runs `scripts/seed_zach_dummy.py`: deletes and re-inserts fixed dummy docs for `auth_subject` **`zwest2563`** (profile from `.env` `SAMPLE_DIR`, genres folk/rock/pop, Ableton, etc.), one sample from LanceDB if available, and a fixed session id — so repeat runs do not accumulate junk.

Phase 1 checks HTTP status codes only; phase 2 (if phase 1 passes) validates JSON bodies (user fields, session `turns`, analytics `event_type`) and edge cases (400/404/422).

## Indexes

`WonderMongoRepository` calls `ensure_indexes()` on first init. Add Atlas UI indexes (e.g. text / vector) as you grow.

## Install

From `backend/server` with uv:

```bash
uv sync
```

`pymongo` is declared in `pyproject.toml`.
