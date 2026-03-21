# Wonder

**"Cursor for music production."** Wonder takes a text prompt and generates a complete, editable Ableton Live session — real MIDI, Drum Racks, effect chains — not a flat MP3 you can't touch.

---

## How It Works

```
User prompt
    → Python LLM orchestration layer (MCP server)
        → Ableton Remote Script (TCP bridge on localhost:9877)
            → Ableton Live 12 (live session, MIDI, devices, clips)
```

The bridge between the LLM and Ableton is the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). The LLM calls MCP tools like `create_wonder_session`, `add_notes_to_clip`, `load_browser_item` — each of which sends a JSON command over a TCP socket to a Python script running inside Ableton.

---

## Repo Structure

```
wonder/                           ← this repo
├── README.md
├── ableton_test.py               ← test suite (run this to verify your setup works)
├── test_results.md               ← last test run output
├── WONDER_BRIEF.md               ← product overview doc
└── ableton-mcp/                  ← Ableton bridge (included in this repo)
    ├── AbletonMCP_Remote_Script/
    │   └── __init__.py           ← Python script that runs INSIDE Ableton
    ├── MCP_Server/
    │   └── server.py             ← FastMCP server that wraps commands as LLM tools
    └── pyproject.toml
```

> `ableton-mcp` is a fork of [jpoindexter/ableton-mcp](https://github.com/jpoindexter/ableton-mcp), upgraded for Wonder with Live 12 bug fixes and new commands. **Do not use the original repo** — use the one bundled here.

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
pip install -e ableton-mcp
```

Verify:

```bash
python3 -c "from mcp.server.fastmcp import FastMCP; print('ok')"
```

---

### Step 2 — Install the Remote Script into Ableton

Copy the Remote Script folder into Ableton's User Library:

```bash
# Run from the root of the wonder repo
cp -r ableton-mcp/AbletonMCP_Remote_Script \
  ~/Music/Ableton/User\ Library/Remote\ Scripts/AbletonMCP
```

Then in Ableton:
1. Open **Preferences** (`Cmd + ,`)
2. Go to **Link / Tempo / MIDI**
3. Under **Control Surface**, pick **AbletonMCP** in any empty slot
4. Close preferences

Ableton will now open a TCP socket on `localhost:9877` at startup. You'll see a log message in Ableton's status bar when it connects.

> **Note:** Ableton shows a warning on launch: *"A custom MIDI Remote Script uses an older process..."* — click **Proceed**. This is safe to ignore, it's just Ableton complaining about third-party scripts.

---

### Step 3 — Configure Claude Desktop (for LLM-driven sessions)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ableton": {
      "command": "python3",
      "args": ["/Users/yourname/path/to/wonder/ableton-mcp/MCP_Server/server.py"]
    }
  }
}
```

Replace the path with the absolute path to the `wonder` repo on your machine. You can get it by running `pwd` from inside the repo. Then restart Claude Desktop. The Ableton tools should appear in Claude's tool list.

> **Important:** Use `python3`, not `python`. On most Macs, `python` points to Python 2.7 and the server will crash on startup.

---

### Step 4 — Verify everything works

Make sure Ableton is open with a project loaded, then run the test suite:

```bash
cd wonder
python3 ableton_test.py
```

Expected output: `DONE — 33 passed, 0 failed`

If you see a connection error, check:
- Ableton is open
- AbletonMCP is selected in Preferences → Link/Tempo/MIDI
- Nothing else is using port 9877 (`lsof -i :9877`)

---

## How the TCP Bridge Works

Every command is a JSON object sent over a persistent TCP socket to `localhost:9877`.

**Request format:**
```json
{
  "type": "create_midi_track",
  "params": { "index": 5 }
}
```

**Response format:**
```json
{
  "status": "success",
  "result": { "index": 5, "name": "MIDI 6" }
}
```

You can talk to Ableton directly from Python without going through the MCP server:

```python
import socket, json

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("localhost", 9877))

cmd = json.dumps({"type": "get_session_info", "params": {}})
sock.sendall(cmd.encode())

sock.settimeout(5)
data = sock.recv(65536)
print(json.loads(data))
# → {'status': 'success', 'result': {'tempo': 120.0, 'track_count': 4, ...}}
```

This is what `ableton_test.py` does — it bypasses MCP entirely and talks to the socket directly. Useful for testing and for building non-LLM integrations (like the sound indexing system).

---

## Key MCP Commands

### Session / Transport
| Command | Params | Description |
|---|---|---|
| `get_session_info` | — | Returns BPM, track count, scene count, time signature |
| `set_tempo` | `tempo` (float) | Set BPM |
| `set_swing_amount` | `amount` (0.0–1.0) | Set swing/groove amount |
| `set_metronome` | `enabled` (bool) | Toggle metronome |
| `start_playback` / `stop_playback` | — | Play/stop transport |

### Tracks
| Command | Params | Description |
|---|---|---|
| `create_midi_track` | `index` (int, use `track_count` not `-1`) | Create MIDI track |
| `create_audio_track` | `index` (int) | Create audio track |
| `set_track_name` | `track_index`, `name` | Rename a track |
| `set_track_volume` | `track_index`, `volume` (0.0–1.0) | Set fader level |
| `set_track_pan` | `track_index`, `pan` (-1.0–1.0) | Set pan |
| `freeze_track` / `flatten_track` | `track_index` | Freeze or flatten |

> **Live 12 bug:** `create_midi_track(index=-1)` crashes. Always pass the current `track_count` as the index.

### Clips & MIDI
| Command | Params | Description |
|---|---|---|
| `create_clip` | `track_index`, `clip_index`, `length` (bars) | Create empty clip |
| `add_notes_to_clip` | `track_index`, `clip_index`, `notes` | Inject MIDI notes (see format below) |
| `get_clip_notes` | `track_index`, `clip_index` | Read notes back |
| `fire_clip` / `stop_clip` | `track_index`, `clip_index` | Launch/stop clip |
| `set_clip_name` | `track_index`, `clip_index`, `name` | Name the clip |

**Note format** for `add_notes_to_clip`:
```python
notes = [
    [pitch, start_time, duration, velocity, mute],
    # pitch: MIDI note (0–127), e.g. 36 = kick (C2)
    # start_time: beat position (0.0 = bar 1 beat 1)
    # duration: note length in beats (0.25 = 16th note)
    # velocity: 0–127
    # mute: True/False
    [36, 0.0,  0.25, 110, False],  # kick on beat 1
    [36, 1.0,  0.25, 108, False],  # kick on beat 2
    [38, 0.5,  0.25, 95,  False],  # snare on upbeat
]
```

### Browser & Instruments
| Command | Params | Description |
|---|---|---|
| `get_browser_items_at_path` | `path` (string) | Browse Ableton's library |
| `load_browser_item` | `track_index`, `item_uri` | Load a device/instrument by browser URI |
| `get_browser_tree` | `category_type` | Get browser category tree |

**Finding browser URIs:**
```python
# Get all drum-related items
items = ab.cmd("get_browser_items_at_path", path="drums")
# Returns list of {name, uri, type} dicts
# Use item['uri'] with load_browser_item

# Audio effects (Sauce Racks go here)
items = ab.cmd("get_browser_items_at_path", path="audio_effects")
```

> **Known limitation:** `search_browser` returns 0 results for built-in devices. Always use `get_browser_items_at_path` with a path string.

### Drum Patterns (built-in generator)
| Command | Params | Description |
|---|---|---|
| `generate_drum_pattern` | `track_index`, `clip_index`, `style`, `length` | Generate a humanized drum pattern |
| `generate_bassline` | `track_index`, `clip_index`, `root`, `scale`, `length` | Generate a scale-aware bassline |

**Available drum styles:** `basic`, `house`, `hiphop`, `lofi`, `trap`, `jazz`, `afrobeats`, `dnb`

**Available scales for bassline:** `major`, `minor`, `pentatonic_minor`, `blues`, `dorian`, `mixolydian`

### Wonder Commands (new — require Ableton restart after first setup)
| Command | Params | Description |
|---|---|---|
| `create_wonder_session` | `bpm`, `tracks[]`, `swing`, `key_root`, `scale` | Build a full session in one round trip |
| `load_sample_by_path` | `track_index`, `file_path`, `device_index`, `pad_index` | Load a .wav/.aif onto a Simpler or Drum Rack pad |

**`create_wonder_session` track spec:**
```python
result = ab.cmd("create_wonder_session",
    bpm=90,
    swing=0.15,
    key_root=9,   # A (0=C, 2=D, 4=E, 5=F, 7=G, 9=A, 11=B)
    scale="minor",
    tracks=[
        {
            "type": "midi",
            "name": "Drums",
            "pattern": "lofi",       # triggers generate_drum_pattern
            "clip_length": 4,
        },
        {
            "type": "midi",
            "name": "Bass",
            "bassline": True,        # triggers generate_bassline with key_root + scale
            "clip_length": 4,
        },
        {
            "type": "midi",
            "name": "Chords",
            "notes": [               # raw MIDI — provide your own notes
                {"pitch": 57, "start_time": 0, "duration": 2, "velocity": 80},
                {"pitch": 60, "start_time": 0, "duration": 2, "velocity": 75},
            ],
            "clip_length": 4,
            "instrument_uri": "ableton:/packs/...",  # optional: load instrument
        },
    ]
)
```

**`load_sample_by_path`** — for the ElevenLabs / sound indexing pipeline:
```python
# The file gets copied to ~/Music/Ableton/User Library/Samples/Imported/Wonder/
# then loaded via the Ableton browser (the only way Live allows external samples)
result = ab.cmd("load_sample_by_path",
    track_index=2,
    file_path="/path/to/my_sample.wav",
    device_index=0,   # index of Simpler or Drum Rack on the track
    pad_index=36,     # MIDI note of Drum Rack pad (None for Simpler)
)
```

### Device Parameters
| Command | Params | Description |
|---|---|---|
| `get_track_info` | `track_index` | Returns devices list with parameter names/values |
| `get_device_parameters` | `track_index`, `device_index` | Get all parameters for a device |
| `set_device_parameter` | `track_index`, `device_index`, `parameter_index`, `value` | Set a parameter |
| `get_rack_chains` | `track_index`, `device_index` | List chains in a Rack |
| `set_rack_macro` | `track_index`, `device_index`, `macro_index`, `value` | Set a Rack macro knob |

### Scenes
| Command | Params | Description |
|---|---|---|
| `create_scene` | — | Create a new scene (row in Session View) |
| `set_scene_name` | `scene_index`, `name` | Name a scene |
| `fire_scene` | `scene_index` | Launch all clips in a scene |
| `stop_scene` | `scene_index` | Stop all clips in a scene |

---

## Sauce Racks Setup

Sauce Racks are pre-saved Ableton Effect Rack `.adg` files that get loaded onto tracks automatically. To make them available:

1. Save your `.adg` rack presets to:
   ```
   ~/Music/Ableton/User Library/Presets/Audio Effects/Wonder/
   ```
2. Restart Ableton or manually trigger a library scan (right-click in Browser → Rescan)
3. Find the URIs:
   ```python
   items = ab.cmd("get_browser_items_at_path", path="audio_effects")
   # Look for your preset names in the returned list
   ```
4. Load with `load_browser_item`:
   ```python
   ab.cmd("load_browser_item", track_index=0, item_uri=items[0]['uri'])
   ```

> **Known limitation:** You cannot load `.adg` files by absolute file path. Everything must go through Ableton's browser URI system.

---

## Sound Indexing Integration (for teammates)

The `load_sample_by_path` command is the hook for the sound indexing system. The flow Wonder expects:

1. **Sound indexer** crawls the user's drive, indexes samples by filename, tags, BPM, key, etc.
2. **Wonder LLM** requests a sound: *"hi-hat, 909-style, fast"*
3. **Sound indexer** returns the absolute path to the best match: `/Users/kori/Samples/909_hihat_open.wav`
4. **Wonder** calls `load_sample_by_path(track_index, file_path, device_index, pad_index)`
5. The Remote Script copies the file to the User Library and loads it onto the Drum Rack pad

The Remote Script handles the copy + browser indexing step — the sound indexer just needs to return a file path.

**Interface contract (what the sound indexer should expose):**
```python
def find_sample(query: str, tags: list[str] = [], bpm: float = None, key: str = None) -> str:
    """
    Returns absolute file path to best matching sample.
    Returns None if no match found.
    """
```

---

## Known Bugs & Limitations

| Issue | Status | Workaround |
|---|---|---|
| `create_midi_track(index=-1)` crashes in Live 12 | Known bug | Pass `track_count` as the index |
| `search_browser` returns 0 results for built-in devices | Known bug | Use `get_browser_items_at_path` with a path string |
| Socket poisoned after any timeout | Known bug | Disconnect and reconnect; `ableton_test.py` does this automatically |
| First command after connect sometimes dropped | Known bug | Send a `health_check` warmup ping after connecting |
| `humanize_clip_timing` / `humanize_clip_velocity` were broken in Live 12 | **Fixed** | Now use Live 11+ API (`get_notes_extended`, `add_new_notes`) |
| `generate_drum_pattern` / `generate_bassline` were broken in Live 12 | **Fixed** | Same fix as above |
| Cannot load `.adg` or `.wav` by absolute file path | Permanent (Ableton LOM limitation) | Save to User Library first, load via browser URI |
| Cannot load VST3 plugins dynamically | Permanent (Ableton LOM limitation) | Must be pre-loaded in the session |
| Cannot place audio clips on Arrangement timeline via API | Permanent (Ableton LOM limitation) | Use Simpler or Drum Rack instead |

---

## Running the Test Suite

```bash
cd wonder
python3 ableton_test.py
```

The test suite connects directly to the TCP socket (bypasses MCP) and runs 33 tests covering every core capability. Results are written to `test_results.md`.

Run this after any changes to the Remote Script to make sure nothing broke. After modifying the Remote Script, you must restart Ableton (or toggle the control surface in Preferences) before the changes take effect.

---

## Environment Variables

The MCP server supports these env vars for tuning timeouts:

| Variable | Default | Description |
|---|---|---|
| `ABLETON_HOST` | `localhost` | Remote Script host |
| `ABLETON_PORT` | `9877` | Remote Script port |
| `MCP_RECV_TIMEOUT` | `15.0` | Socket receive timeout (seconds) |
| `MCP_MODIFYING_CMD_TIMEOUT` | `15.0` | Timeout for state-changing commands |
| `MCP_READ_CMD_TIMEOUT` | `10.0` | Timeout for read-only commands |
| `MCP_COMMAND_DELAY` | `0.05` | Delay after modifying commands (gives Ableton time to process) |
