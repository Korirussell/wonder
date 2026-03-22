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

## Indexes

`WonderMongoRepository` calls `ensure_indexes()` on first init. Add Atlas UI indexes (e.g. text / vector) as you grow.

## Install

From `backend/server` with uv:

```bash
uv sync
```

`pymongo` is declared in `pyproject.toml`.
