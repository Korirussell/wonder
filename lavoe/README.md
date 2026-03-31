# Lavoe - Cursor for music production

[![Watch the demo](https://img.youtube.com/vi/lt1V2GFGO3k/maxresdefault.jpg)](https://youtu.be/lt1V2GFGO3k)


## Inspiration

lavoe comes from the simple desire to make music - lower the barrier for music production access - with ai everyone's abilites are enhanced but when it comes to the creative industry tech doesnt give it as much attention we want to make it easieer for others to express themselves and we want to make the first stedp towards this facilitating music production.

## What it does

- intuitive DAW interface
- Ai generated beats
- agentic chopping of beats
- agentic sorting of sounds
- agentic music engineering
- live audio recording

## How we built it

- react
- typescript
- next js
- vercel ai sdk
- python
- fast api
- librosa
- cohere
- pandas
- sklearn

### Lavoe — Local Development Guide

This guide explains how to run the backend (FastAPI) and the frontend (Next.js) locally.

---

### Prerequisites

- Python 3.13 (recommended to match `pyproject.toml`)
- Node.js 18+ and npm/pnpm (Next.js 14)
- ffmpeg (recommended for broad audio codec support)

---

### Environment Variables

Create a `.env` file in `backend/` based on `backend/env.example`:

```
BEATOVEN_API_KEY=your_key
MUBERT_CUSTOMER_ID=your_customer_id
MUBERT_ACCESS_TOKEN=your_access_token
```

Frontend can be configured via environment variables as well. The key one during local dev is the backend URL used by the chat tool route:

```
# frontend/.env.local
BACKEND_URL=http://localhost:8000
```

If you skip this, it defaults to `http://localhost:8000`.

---

### Backend (FastAPI)

Located in `backend/`.

Option A — Using uv (recommended):

1. Install uv: see instructions at https://github.com/astral-sh/uv#installation
2. Install deps:
   ```
   cd backend
   uv sync
   ```
3. Run the server:
   ```
   uv run server.py
   ```
   The API will be available at `http://localhost:8000`.

Option B — Using pip/venv:

1. ```
   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. ```
   python server.py
   ```

Health check:

- GET `http://localhost:8000/health` -> `{ "status": "healthy" }`

Key endpoints used by the frontend:

- POST `/extract-harmonics`
- POST `/process-reverb`
- POST `/chop-audio`
- ID-based processing: `/process/extract-harmonics`, `/process/reverb`, `/process/chop-audio`, `/process/speed`
- Upload/list/download: `/upload-audio`, `/tracks`, `/tracks/{track_id}/download`

---

### Frontend (Next.js)

Located in `frontend/`.

1. Install deps:

   ```
   cd frontend
   npm install
   ```

   or

   ```
   pnpm install
   ```

2. Run the dev server:
   ```
   npm run dev
   ```
   Next.js runs at `http://localhost:3000` by default.

Build/start (optional):

```
npm run build
npm start
```

---

### Project Structure

- `backend/`: FastAPI server, audio processing, and file-based storage
- `frontend/`: Next.js UI and API routes (`/app/api`) that call the backend
