# Wonder — Feature Reference

> Complete inventory of features that exist in the codebase as of March 2026.

---

## AI Copilot (Chat)

### Natural Language Music Production
- User types a prompt ("make a trap beat", "jazz chord progression") and Wonder builds the Ableton session autonomously
- Powered by **Google Gemini 2.5 Flash** with function calling
- Agentic loop runs up to **30 tool rounds** per request — enough for complex multi-track sessions
- Starter prompt chips on load: "Make a lofi beat", "90bpm trap drop", "Jazz chord progression", "Ambient texture"

### Voice Input
- Mic button in the chat input captures audio via the browser's `MediaRecorder` API
- Audio is sent as base64 WebM to `/api/chat` alongside the message history
- Displayed in chat as `🎤 Voice message`

### Thinking States
- While Wonder is working, the chat shows a cycling status: "Checking Ableton...", "Planning session...", "Building tracks...", "Programming patterns...", "Finishing up..."

### Activity Feed (Tool Log)
- Each assistant message can expand a collapsible activity feed showing every tool Wonder called, with success/failure status

### AI Follow-up Suggestions
- The API response can include `suggestions[]` — clickable chips that pre-fill the input with contextual follow-up prompts

### Markdown Rendering
- Chat messages render **bold**, `inline code`, bullet lists, and paragraphs

---

## Ableton Tools (What Wonder Can Do)

All tools are declared in `wonderTools.ts` and executed via the Ableton Remote Script over TCP.

### Session
| Tool | What it does |
|---|---|
| `get_session_info` | Returns BPM, track count, scene count, time signature |
| `get_track_info` | Returns name, devices, clip slots, mute/solo/arm for a track |
| `set_tempo` | Sets session BPM |
| `start_playback` | Starts Ableton transport |
| `stop_playback` | Stops Ableton transport |

### Tracks
| Tool | What it does |
|---|---|
| `create_midi_track` | Creates a new MIDI track at a given index (or -1 to append) |
| `set_track_name` | Renames a track |
| `delete_track` | Deletes a track by index |

### Clips & MIDI
| Tool | What it does |
|---|---|
| `create_clip` | Creates an empty MIDI clip in a track slot |
| `add_notes_to_clip` | Writes MIDI notes into a clip (pitch, start\_time, duration, velocity, mute) |
| `set_clip_name` | Names a clip |
| `fire_clip` | Launches a clip in Session View |
| `stop_clip` | Stops a playing clip |
| `delete_clip` | Clears a clip from its slot |

### Browser & Instruments
| Tool | What it does |
|---|---|
| `get_browser_tree` | Returns the top-level browser category tree |
| `get_browser_items_at_path` | Returns items and URIs at a browser path (e.g. `instruments/synths`) |
| `load_instrument_or_effect` | Loads a browser item onto a track by URI |
| `load_drum_kit` | Composite: loads a drum rack then loads a specific kit into it |
| `search_browser` | Fuzzy name search across the browser — returns loadable items with URIs |

---

## Music Intelligence

### Style Knowledge Base
Built into the system prompt — Wonder knows genre-specific defaults:
- **Trap**: 130–145 BPM, minor scale, 808 kick, snare on 3, hi-hat rolls
- **Lo-fi**: 75–95 BPM, jazz chords, swung 16ths, C/F/Bb minor
- **Hans Zimmer / Cinematic**: 60–100 BPM, minor/phrygian, slow build, strings + brass
- **House**: 120–130 BPM, 4-on-the-floor kick, offbeat hi-hats, bass stabs
- **Boom-bap**: 85–95 BPM, strong kick/snare, jazz samples, swing
- **Drill**: 140–150 BPM, sliding 808 bass, fast trap hi-hats

### Wonder Knowledge Base (`wonder.md`)
- A markdown file loaded at runtime and injected into every system prompt
- Contains extended music production knowledge, genre MIDI examples, chord progressions, and instrument recommendations
- Cached in memory after first load

### Session State Tracking
- The chat route maintains a `SessionState` object across every tool round
- Tracks: BPM, key, scale, time signature, swing, tracks (with instruments + clips), chord progression, melody motif
- State is serialized and injected into the conversation context so Gemini stays aware of what exists

### Music Validation (`musicValidator.ts`)
Runs before every tool execution to catch mistakes:
- **`add_notes_to_clip`**: checks instrument is loaded, notes are in the session key/scale, voice leading (warns on leaps >7 semitones), note durations are standard values, velocity is in range
- **`create_clip`**: checks track exists in state
- **`create_midi_track`**: validates index is -1 or non-negative
- **`set_tempo`**: warns if outside 60–200 BPM, errors if ≤ 0
- **`delete_track`**: warns if track not found in local state

### Instrument Recommendations (`wonderKnowledge.ts`)
Utility functions that return:
- BPM ranges per genre
- Swing amounts per genre
- Common chord progressions per genre
- Recommended instrument per track type + genre (drums/bass/melody/chords)

---

## Voice-to-MIDI Transcription

**Endpoint:** `POST /api/transcribe`

- User can hum or whistle a melody into the mic
- Audio is sent to a Python REST API (`localhost:8000`) which uses **Spotify basic-pitch** for pitch detection
- Returns: array of MIDI notes (pitch, start\_time, duration, velocity), suggested clip length
- Supports pitch correction strength parameter (0–1)
- Falls back gracefully if the Python server isn't running

---

## Sound Analysis (`/api/soundsplit`)

**Endpoint:** `POST /api/soundsplit`

- Accepts a base64-encoded audio file
- Runs the `soundsplit` Python CLI to extract:
  - **BPM** and time signature
  - **Key** detection (e.g. "A minor")
  - **Stem separation**: vocals, drums, bass, other (WAV files)
  - **MIDI extraction** from the full mix
  - **Duration** in seconds
- Results saved to `temp/soundsplit/<filename>/`

---

## Session Mirror (Real-time UI)

The right-side panel reflects what's happening in Ableton Live in real time.

### Live Connection Status
- Polls `/api/ableton-state` every **5 seconds** via `AbletonContext`
- Green pill = connected, orange pulsing = not connected
- Shows in both the Header and the Session Mirror HUD

### HUD
- Displays current **BPM** (live from Ableton, 2 decimal places)
- Displays current **Key** (parsed from Ableton's root\_note + scale\_name)
- Play/Stop transport buttons that send commands directly to Ableton
- Record arm button (UI only, not yet wired to Ableton command)

### Track Columns
Each track in Ableton renders as a card with:
- Track number and name
- **M / S / A** buttons — Mute (confirmed in Ableton), Solo (optimistic), Arm (optimistic)
- **Volume fader** — visual readout, mute sends `set_track_mute` to Ableton
- **Device rack** — shows loaded device names as pills at the bottom
- Status dot: red pulsing = armed, green = solo, dark = normal

### Optimistic UI
- Mute/solo/arm changes update the UI immediately without waiting for Ableton to confirm
- After any command, the context refreshes after 300ms to reconcile with real Ableton state

### Waveform Strip
- Decorative waveform visualization at the bottom of the session panel
- Bars animate when `isPlaying` is true; static when stopped

### Empty State
- When Ableton is not connected and no tracks exist, shows a helpful message with setup instructions
- "+ new track" placeholder card always visible at the end of the track list

---

## `.wonderprofile` (User Personalization)

Accessible via the settings button in the Header. Saved to `localStorage`.

| Setting | Options |
|---|---|
| Genres | Lo-Fi, Hip Hop, House, Trap, Jazz, Afrobeats, DnB, Ambient, R&B, Soul |
| Plugins you own | RC-20, OTT, SketchCassette, Digitalis, Vulf Compressor, Serum, Vital, Autotune, Fabfilter Pro-Q, Drum Buss |
| Reference artists | J Dilla, Flying Lotus, Kaytranada, Four Tet, Sade, Nujabes, Tyler the Creator, Mac Miller |
| BPM Range | Free text (e.g. "80-95") |
| Default Key | Free text (e.g. "A Minor") |

Profile is passed into the chat API and injected into the AI prompt context so Wonder tailors suggestions to the user's taste.

---

## Infrastructure

### Ableton Bridge (`lib/ableton.ts`)
- TCP socket connection to `localhost:9877`
- JSON command/response protocol: `{ type, params }` → `{ status, result }`
- 5-second timeout per command with graceful error
- `isAbletonConnected()` ping helper used by the state route

### Remote Script (`kori-mcp/AbletonMCP_Remote_Script/__init__.py`)
- Python `ControlSurface` plugin installed in Ableton Live's MIDI Remote Scripts folder
- Listens on `localhost:9877`
- All state-mutating commands are scheduled on Ableton's main thread via `schedule_message`
- 10-second timeout waiting for main-thread operations

### Ableton State Route (`/api/ableton-state`)
- `GET` — returns `{ connected, bpm, isPlaying, key, trackCount, tracks[] }`
- Fetches up to 16 tracks' info
- Force-dynamic (no Next.js caching)

### Ableton Command Route (`/api/ableton-command`)
- `POST { command, params }` — sends a command directly from UI components (not AI)
- Allowlisted to: `start_playback`, `stop_playback`, `set_track_mute`, `set_track_volume`

### Error Handling
- Rate limit (Gemini 429) returns a user-friendly upgrade message
- Empty AI responses fall back to "I completed the requested actions in Ableton. Please check your session."
- Tool failures return a `hint` string so Gemini can self-correct and retry

### Notes Normalization
- `normalizeNotes()` in `route.ts` handles whatever format Gemini sends notes in (array of arrays, array of objects, nested containers) and converts to the format Ableton expects

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js (with Turbopack) |
| UI | React 19, Tailwind CSS |
| AI model | Google Gemini 2.5 Flash |
| AI SDK | `@google/generative-ai` |
| Ableton bridge | Python TCP socket (Remote Script) |
| Pitch detection | Spotify basic-pitch (Python) |
| Stem separation | soundsplit CLI (Python) |
| Transport | localhost TCP :9877 (Ableton), :8000 (Python REST) |
