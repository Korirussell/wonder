# Wonder — Personal Setup Guide

## Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.11
- **uv** (Python package manager) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- API keys: Google Gemini, ElevenLabs

---

## 1. API Keys

### Frontend (`frontend/.env.local`)
Copy the example and fill in your keys:
```bash
cp frontend/.env.local.example frontend/.env.local
```

```env
GOOGLE_GENERATIVE_AI_API_KEY=<your Gemini key>
ELEVENLABS_API_KEY=<your ElevenLabs key>
BACKEND_URL=http://localhost:8000
```

### Backend (`backend_but_better/.env`)
```bash
cp backend_but_better/.env.example backend_but_better/.env
```

```env
GOOGLE_API_KEY=<your Gemini key>        # same key, different var name
ELEVENLABS_API_KEY=<your ElevenLabs key>
```

> **Note:** The Gemini key is used under two different env var names:
> - Frontend: `GOOGLE_GENERATIVE_AI_API_KEY` (Vercel AI SDK)
> - Backend: `GOOGLE_API_KEY` (google-generativeai Python SDK)
> Both can be the same key.

---

## 2. Backend — backend_but_better

```bash
cd backend_but_better

# Install dependencies
uv sync

# Start the server (runs on http://localhost:8000)
uv run python main.py
```

Verify it's running: `curl http://localhost:8000` → `{"message":"backend_but_better is running"}`

---

## 3. Index Your Sample Library

The backend needs samples indexed into LanceDB before semantic search works.

```bash
cd backend_but_better

# Index the samples/ folder that's already in this repo
uv run python tools/index_samples.py --sample-root ./samples

# Or point at your own sample library
uv run python tools/index_samples.py --sample-root /path/to/your/samples
```

This walks the folder, generates Gemini embeddings for each file, and writes to `./data/sample_library.lance`.

Run once. Re-run to add more samples (it upserts, won't duplicate).

---

## 4. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev
```

---

## 5. Running Everything Together

You need **two terminals**:

**Terminal 1 — Backend:**
```bash
cd backend_but_better && uv run python main.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`.

---

## How It Works (Integration Overview)

```
User types in chat
    ↓
/api/chat (Gemini streaming + tools)
    ├── setBPM / setDrumPattern → directly updates DAW state
    │
    └── generateAndPlaceAudio
            ↓
        POST /api/samples/generate (Next.js proxy)
            ↓
        POST localhost:8000/generate-instrument (Python backend)
            ├── Intent agent parses the prompt
            ├── Retrieval agent searches LanceDB (Gemini embeddings)
            ├── If similarity ≥ threshold → returns existing sample
            └── If no good match → calls ElevenLabs, saves to generated_samples/
                    ↓
        GET /api/samples/:id/audio (streams WAV back to browser)
            ↓
        Tone.js plays the audio on the DAW track

    └── searchSamples
            ↓
        POST /api/samples/search (Next.js proxy)
            ↓
        POST localhost:8000/samples/search (vector search)
            ↓
        Returns ranked results to AI for context
```

**Fallback behavior:** If `backend_but_better` is offline, `generateAndPlaceAudio` falls back directly to ElevenLabs via `/api/sfx`. The DAW still works — you just lose the smart sample library search.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `GOOGLE_API_KEY not set` | Add key to `backend_but_better/.env` |
| `ELEVENLABS_API_KEY not configured` | Add key to `frontend/.env.local` |
| Sample search returns empty | Run the indexing step (Section 3) |
| Backend CORS error | Make sure backend is running on port 8000 |
| `uv: command not found` | Install uv: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| LanceDB data missing | Re-run `index_samples.py` to rebuild `./data/sample_library.lance` |

---

## File Locations

| Thing | Path |
|---|---|
| Sample library (input) | `backend_but_better/samples/` |
| Generated audio output | `backend_but_better/generated_samples/` |
| LanceDB vector store | `backend_but_better/data/sample_library.lance` |
| Frontend env | `frontend/.env.local` |
| Backend env | `backend_but_better/.env` |
