# Wonder

**"Cursor for music production."** Wonder takes a text prompt and generates a complete, editable Ableton Live session — real MIDI, Drum Racks, effect chains — not a flat MP3 you can't touch.

---

## How It Works

```
User prompt (Next.js chat UI)
    → Python ADK agent server (port 8001)
        → Google Gemini 2.5-Flash (multi-agent: composition, stem separation, sound design)
            → Ableton Remote Script (TCP bridge on localhost:9877)
                → Ableton Live 12 (live session, MIDI, devices, clips)
```

The agent talks to Ableton over a TCP socket using a JSON command protocol. It also handles audio-to-MIDI transcription (hum a melody → MIDI notes), sound generation via ElevenLabs, and stem separation — all served from a single backend process.

---

## Repo Structure

```
wonder/
├── README.md
├── ableton_test.py              ← test suite (verify Ableton connection)
├── wonder.md                    ← knowledge base injected into the agent prompt
├── kori-mcp/
│   ├── AbletonMCP_Remote_Script/
│   │   └── __init__.py          ← Python script that runs INSIDE Ableton Live
│   └── MCP_Server/
│       └── server.py            ← standalone FastMCP wrapper (optional)
├── backend/
│   ├── agent/                   ← ADK agent server (the main backend, port 8001)
│   │   └── agent/
│   │       ├── server.py        ← FastAPI: /chat, /chat/stream, /chat/live, /audio/*
│   │       ├── agent.py         ← root_agent assembly (46 Ableton tools + sub-agents)
│   │       ├── wonder_prompt.py ← system prompt + wonder.md knowledge injection
│   │       ├── tools/           ← ableton, audio, soundgen, session_state
│   │       ├── agents/          ← CompositionAgent, StemSeparatorAgent, SoundDesignAgent
│   │       ├── analytics/       ← Snowflake event logging + user preferences
│   │       └── db/              ← MongoDB-backed ADK session service
│   ├── server/                  ← audio processing (mounted at /audio on port 8001)
│   ├── soundsplit/              ← audio analysis library
│   └── soundgen/                ← ElevenLabs sound generation library
└── frontend/                    ← Next.js chat UI (port 3000)
    └── src/
        ├── app/api/
        │   ├── chat/            ← proxies to agent server
        │   ├── transcribe/      ← audio → MIDI
        │   ├── load_midi_notes/ ← retrieve transcribed notes
        │   └── soundsplit/      ← stem separation
        └── components/
            └── CopilotChat.tsx  ← main chat UI (text, voice, rhythm tap)
```

> `kori-mcp` is a fork of [jpoindexter/ableton-mcp](https://github.com/jpoindexter/ableton-mcp), upgraded for Wonder with Live 12 bug fixes and new commands. The frontend now talks directly to Ableton over TCP, so the legacy Ableton FastMCP wrapper is no longer part of the setup.

---

## Setup

### Requirements

- macOS (Ableton's Remote Script path is macOS-specific)
- Python 3.10+
- Ableton Live 12
- [Claude Desktop](https://claude.ai/download) (for using it as an LLM client during dev)

---

### Step 1 — Clone the repo and install dependencies

```bash
git clone <wonder-repo-url>
cd wonder
pip install -e kori-mcp
```

Verify:

```bash
python3 -c "from mcp.server.fastmcp import FastMCP; print('ok')"
```

---

## Prerequisites

- macOS
- **Python 3.10+** and [uv](https://docs.astral.sh/uv/getting-started/installation/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Node.js 18+** and npm
- **Ableton Live 11 or 12**
- A **Google API key** with Gemini access ([get one here](https://aistudio.google.com/app/apikey))
- *(Optional)* MongoDB — for persistent chat history across server restarts
- *(Optional)* ElevenLabs API key — for AI sound generation

---

## 1 — Ableton Remote Script Setup

The TCP bridge runs **inside Ableton Live** as a Remote Script. This only needs to be done once.

### Install the script

```bash
# From the root of this repo
cp -r kori-mcp/AbletonMCP_Remote_Script \
  ~/Music/Ableton/User\ Library/Remote\ Scripts/AbletonMCP
```

> If the `Remote Scripts` folder doesn't exist, create it:
> `mkdir -p ~/Music/Ableton/User\ Library/Remote\ Scripts`

### Enable it in Ableton

1. Open (or restart) **Ableton Live**
2. Open **Preferences** (`Cmd + ,`)
3. Go to **Link, Tempo & MIDI**
4. In any empty **Control Surface** slot, select **AbletonMCP**
5. Set Input and Output both to **None**
6. Close preferences

When loaded correctly, Ableton's status bar shows:
> `AbletonMCP: Listening for commands on port 9877`

> **Note:** Ableton may show *"A custom MIDI Remote Script uses an older process…"* — click **Proceed**. This is safe to ignore.

### Step 3 — Start Wonder

Run the frontend and keep Ableton open with the `AbletonMCP` control surface enabled. Wonder sends commands straight to Ableton on `localhost:9877`; no separate Ableton MCP server process is required.

---

### Step 4 — Verify everything works

Make sure Ableton is open with a project loaded, then run the test suite:

```bash
python3 -c "
import socket, json
s = socket.socket()
s.connect(('localhost', 9877))
s.sendall(json.dumps({'type': 'get_session_info', 'params': {}}).encode())
print(json.loads(s.recv(65536)))
"
# → {'status': 'success', 'result': {'tempo': 120.0, 'track_count': 0, ...}}
```

Or run the full test suite:

```bash
python3 ableton_test.py
# Expected: DONE — 33 passed, 0 failed
```

---

## 2 — Backend (Agent Server)

The agent server runs on **port 8001** and handles everything: AI chat, audio transcription, sound generation, and stem separation.

### Install dependencies

```bash
cd backend
uv sync
```

### Set environment variables

Create `backend/.env` (or export in your shell):

```bash
# Required
GOOGLE_API_KEY=your-gemini-api-key

# Optional — persistent sessions (falls back to in-memory without this)
MONGO_URI=mongodb://localhost:27017

# Optional — ElevenLabs sound generation
ELEVENLABS_API_KEY=your-elevenlabs-key

# Optional — Snowflake analytics
SNOWFLAKE_ACCOUNT=your-account
SNOWFLAKE_USER=your-user
SNOWFLAKE_PASSWORD=your-password
SNOWFLAKE_DATABASE=WONDER
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_WAREHOUSE=your-warehouse

# Optional — logging
LOG_LEVEL=INFO          # DEBUG | INFO | WARNING | ERROR
LOG_FILE=wonder.log     # also write logs to this file
```

### Run

```bash
cd backend
GOOGLE_API_KEY=your-key uv run wonder-agent
```

The server starts on `http://localhost:8001`. You should see:

```
INFO     Wonder Agent API starting on port 8001
INFO     MongoSessionService connected: mongodb://localhost:27017/wonder
```

### Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /session/new` | Create a new session |
| `POST /chat` | Send a message, get a response |
| `POST /chat/stream` | SSE streaming response |
| `WS /chat/live` | Bidirectional live audio |
| `GET /user/{id}/preferences` | User preference profile (Snowflake) |
| `POST /audio/transcribe` | Audio → MIDI notes |
| `GET /audio/midi/{id}` | Retrieve transcribed MIDI |
| `POST /audio/split` | Stem separation + beat/key analysis |
| `POST /audio/generate` | Generate a sound via ElevenLabs |

---

## 3 — Frontend (Chat UI)

### Install dependencies

```bash
cd frontend
npm install
```

### Configure

`frontend/.env.local` is already set up with defaults:

```bash
AGENT_API_URL=http://localhost:8001
ABLETON_HOST=localhost
ABLETON_PORT=9877
```

Change these if your servers are on different hosts or ports.

### Run

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Full Stack (quick start)

```bash
# Terminal 1 — backend
cd backend
GOOGLE_API_KEY=your-key uv run wonder-agent

# Terminal 2 — frontend
cd frontend
npm run dev
```

Then open http://localhost:3000, make sure Ableton is running with AbletonMCP loaded, and start chatting.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend  (Next.js :3000)                          │
│  CopilotChat.tsx — text / voice / rhythm tap input  │
└──────────────────────┬──────────────────────────────┘
                       │ POST /api/chat
                       ▼
┌─────────────────────────────────────────────────────┐
│  Next.js API routes  (thin proxies)                 │
│  /api/chat → agent :8001/chat                       │
│  /api/transcribe → agent :8001/audio/transcribe     │
│  /api/soundsplit → agent :8001/audio/split          │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Wonder Agent Server  (FastAPI :8001)               │
│                                                     │
│  Google ADK Runner + Gemini 2.5-Flash               │
│  ├── 46 Ableton tools  ──────────────► TCP :9877    │
│  ├── transcribe_audio / load_midi_notes (in-proc)   │
│  ├── generate_sound / split_and_generate (in-proc)  │
│  └── Sub-agents (AgentTool):                        │
│      ├── CompositionAgent  (SequentialAgent)        │
│      ├── StemSeparatorAgent                         │
│      └── SoundDesignAgent                           │
│                                                     │
│  Persistence:                                       │
│  ├── MongoDB  — session / conversation history      │
│  └── Snowflake — analytics + user preferences       │
│                                                     │
│  Mounted at /audio:                                 │
│  └── server.rest (split, generate, transcribe)      │
└──────────────────────┬──────────────────────────────┘
                       │ JSON over TCP
                       ▼
┌─────────────────────────────────────────────────────┐
│  Ableton Remote Script  (TCP :9877)                 │
│  Runs inside Ableton Live — no separate process     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
                  Ableton Live 12
```

---

## TCP Command Protocol

The Remote Script accepts newline-delimited JSON on port 9877:

**Request:**
```json
{ "type": "create_midi_track", "params": { "index": 0 } }
```

**Response:**
```json
{ "status": "success", "result": { "index": 0, "name": "1-MIDI" } }
```

You can talk to Ableton directly without going through the agent:

```python
import socket, json

s = socket.socket()
s.connect(("localhost", 9877))
s.sendall(json.dumps({"type": "get_session_info", "params": {}}).encode())
print(json.loads(s.recv(65536)))
```

---

## Known Issues

| Issue | Workaround |
|---|---|
| `create_midi_track(index=-1)` crashes in Live 12 | Pass `track_count` as the index |
| `search_browser` returns 0 results for built-in devices | Use `get_browser_items_at_path` with a path string |
| Socket poisoned after any timeout | The agent reconnects automatically on the next command |
| Cannot load `.adg` / `.wav` by absolute file path | Save to User Library first, load via browser URI |
| Cannot place audio clips on Arrangement timeline via API | Use Simpler or Drum Rack instead |

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | — | **Required.** Gemini API key |
| `AGENT_API_URL` | `http://localhost:8001` | Agent server URL (frontend) |
| `ABLETON_HOST` | `localhost` | Ableton Remote Script host |
| `ABLETON_PORT` | `9877` | Ableton Remote Script port |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `wonder` | MongoDB database name |
| `ELEVENLABS_API_KEY` | — | ElevenLabs API key for sound generation |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `LOG_FILE` | — | Optional path to write logs to |
| `SNOWFLAKE_ACCOUNT` | — | Snowflake account identifier |
| `SNOWFLAKE_USER` | — | Snowflake username |
| `SNOWFLAKE_PASSWORD` | — | Snowflake password |
| `SNOWFLAKE_DATABASE` | `WONDER` | Snowflake database |
| `SNOWFLAKE_SCHEMA` | `PUBLIC` | Snowflake schema |
| `SNOWFLAKE_WAREHOUSE` | — | Snowflake warehouse |
