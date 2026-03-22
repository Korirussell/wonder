# Wonder — Full Project Report
> Generated 2026-03-21

---

## 1. What Wonder Is

**Wonder** is "Cursor for music production" — an AI copilot that generates complete, editable Ableton Live sessions from text or audio prompts. Instead of generic loops, Wonder builds opinionated MIDI, Drum Racks, Sauce Rack FX chains, and VST sound design tailored to the user's taste (via a `.wonderprofile` config). Every output is instantly playable and fully editable inside Ableton.

**Core Golden Loop:**
1. User types a prompt ("make a 90bpm lofi boom-bap beat in D minor")
2. Gemini 2.5 Flash receives the prompt + the user's Wonder Profile as system context
3. Gemini calls Ableton MCP tools in an agentic loop (up to 10 rounds)
4. Tracks, clips, MIDI notes, Drum Rack, and FX chains are injected into live Ableton session
5. User hears music in < 10 seconds

---

## 2. Architecture

```
Browser (Next.js App Router)
  └── CopilotChat.tsx  ──POST──►  /api/chat  (route.ts)
  └── SessionMirror.tsx ─GET──►  /api/ableton-state  (route.ts)

/api/chat:
  Gemini 2.5 Flash (FunctionCallingMode.AUTO)
    ↕ agentic loop (up to 10 rounds)
  ableton.ts (TCP client) ──JSON──► localhost:9877

localhost:9877:
  AbletonMCP Remote Script (__init__.py)
    ↕ Ableton Live Object Model (Python)
  Ableton Live 12

MCP Server (server.py, FastMCP):
  Claude Desktop ──tools──► MCP_Server ──TCP──► Remote Script
```

The frontend uses **two separate paths** to Ableton:
- **MCP path** (Claude Desktop): 128 tools via FastMCP, used for direct ad-hoc control
- **Direct TCP path** (Next.js): `ableton.ts` sends JSON commands directly to the same socket, used by the chat route for Gemini tool calls

---

## 3. Repository Structure

```
wonder/
├── ableton-mcp/
│   ├── AbletonMCP_Remote_Script/
│   │   └── __init__.py          # Ableton Python Remote Script (~7500 lines)
│   ├── MCP_Server/
│   │   └── server.py            # FastMCP server (~3100 lines)
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts          # Gemini agentic loop + tool execution
│   │   │   │   └── ableton-state/route.ts # BPM, tracks, isPlaying poller
│   │   │   └── page.tsx                   # Root layout (Header + CopilotChat + SessionMirror)
│   │   ├── components/
│   │   │   ├── Header.tsx            # Logo, nav, live Ableton status dot
│   │   │   ├── CopilotChat.tsx       # Chat UI with voice input
│   │   │   ├── SessionMirror.tsx     # BPM HUD, track grid, waveform, transport
│   │   │   ├── TrackColumn.tsx       # M/S/A toggles, fader, device pills
│   │   │   ├── DevicePill.tsx        # Plugin tag chips
│   │   │   └── WonderProfileModal.tsx # Genre/plugin/artist taste picker
│   │   └── lib/
│   │       ├── ableton.ts       # TCP client (localhost:9877, 5s timeout)
│   │       ├── wonderTools.ts   # 30 Gemini FunctionDeclaration[] tool schemas
│   │       └── wonderProfile.ts # .wonderprofile JSON → LLM system prompt
│   └── CLAUDE.md / AGENTS.md
└── WONDER_REPORT.md             # This file
```

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4, Japanese Soft Brutalism design system |
| AI brain | Gemini 2.5 Flash (`gemini-2.5-flash`) with Function Calling |
| AI SDK | `@google/generative-ai` |
| DAW integration | Ableton Live 12 via Remote Script (Python) |
| MCP server | FastMCP (`python-fastmcp`) |
| MCP client | Claude Desktop |
| Transport | JSON over TCP socket (localhost:9877) |
| Fonts | Plus Jakarta Sans (headings), JetBrains Mono (data) |

---

## 5. Design System: Japanese Soft Brutalism

Based on the **Tactile Studio** design language:

- **Palette**: Matcha green (`#7BA05B`), soft lavender (`#C4BFFF`), pale yellow (`#FFF3A0`), off-white surface (`#FDFDFB`), near-black ink (`#2D2D2D`)
- **Shadows**: Hard 4px solid `#2D2D2D` offset — no blurry shadows anywhere
- **Borders**: 2px solid, always `on-surface`. No 1px hairlines.
- **Graph paper**: SVG dot-grid background on base surface
- **Buttons**: Depress on hover (shadow 4px → 2px), fully click on active (shadow 0px, translate 4px)
- **Typography**: Plus Jakarta Sans for display/nav, JetBrains Mono for all BPM/key/technical data in ALL CAPS
- **Corner radii**: Outer containers `rounded-xl`, inner objects `rounded-lg` (harmonic nesting)
- **AI chat bubbles**: Lavender background, hard shadow, monospace timestamps

---

## 6. Ableton MCP Remote Script

### Base Repo
**`jpoindexter/ableton-mcp`** — chosen over `ahujasid/ableton-mcp` because it has 128 tools vs 16, including: device parameter control, rack macro access, scene management, `get_clip_notes`, freeze/flatten, undo/redo.

### Upgrades Made

#### 6.1 Live 12 API Deprecation Fixes
Live 12 deprecated `clip.get_notes()`, `clip.set_notes()`, `clip.remove_notes()`. All commands that read/write MIDI now use the Live 11+ API:

```python
def _write_notes_to_clip(self, clip, notes_tuples):
    notes_spec = [Live.Clip.MidiNoteSpecification(
        start_time=float(start), duration=float(max(0.0625, duration)),
        pitch=int(max(0, min(127, pitch))), velocity=float(max(1, min(127, velocity))),
        mute=bool(mute)) for pitch, start, duration, velocity, mute in notes_tuples]
    clip.remove_notes_extended(0, 128, 0, clip.length)
    clip.add_new_notes(tuple(notes_spec))

def _read_notes_from_clip(self, clip):
    notes_raw = clip.get_notes_extended(0, 128, 0, clip.length)
    return [(n.pitch, n.start_time, n.duration, n.velocity, n.mute) for n in notes_raw]
```

Affected commands: `humanize_clip_timing`, `humanize_clip_velocity`, `generate_drum_pattern`, `generate_bassline`

#### 6.2 New Drum Styles
Added to `_generate_drum_pattern`: `lofi`, `trap`, `jazz`, `afrobeats`

**Previously supported**: `basic`, `house`, `hiphop`, `dnb`

#### 6.3 `load_sample_by_path` Command
Copies an arbitrary `.wav`/`.aif` to the Ableton User Library, then loads it into a Simpler or Drum Rack pad by MIDI note. Allows Wonder to work with custom sample packs.

#### 6.4 `create_wonder_session` Command
Composite single-round-trip command: sets BPM, swing, key/scale, and creates multiple tracks with clips and drum patterns simultaneously. Reduces the number of Gemini rounds needed for session creation from ~15 to 1.

#### 6.5 VST3/AU Plugin Support (NEW)
Four new commands for full plugin workflow:

| Command | Description |
|---|---|
| `search_plugins` | Search Ableton browser for plugins by name/type |
| `load_plugin_by_name` | Find and load a VST3/AU by name onto a track |
| `get_track_devices` | List all devices on a track with parameter names, values, ranges |
| `set_device_parameter_by_name` | Set any device parameter by partial name match |

This enables Wonder to load Serum and program a custom 808: set oscillator pitch, filter cutoff, amp envelope, distortion, etc. — all from a text prompt.

#### 6.6 FastMCP `instructions=` Fix
`FastMCP.__init__()` v1.x renamed `description=` → `instructions=`. Fixed in `server.py`.

---

## 7. Gemini Integration

### Model
`gemini-2.5-flash` — the only Gemini model currently available on this account. (`gemini-2.0-flash` returned 404 "no longer available to new users".)

### Agentic Loop
```
POST /api/chat
  → build Gemini history (strip leading model messages)
  → startChat() with tools + system prompt
  → sendMessage(userPrompt)
  → while response.functionCalls exists (max 10 rounds):
      → execute all tool calls in parallel via Promise.all
      → feed results back as "user" role with tool results
      → get next response
  → return final text to frontend
```

### Note Format Normalization
Gemini sends notes as objects `{pitch, start_time, duration, velocity, mute}`. Ableton expects arrays `[pitch, start, duration, velocity, mute]`. Normalized in the chat route:

```typescript
function normalizeNotes(notes: unknown): unknown[][] {
  return notes.map((n) => {
    if (Array.isArray(n)) return n;
    if (typeof n === "object" && n !== null) {
      const o = n as Record<string, unknown>;
      return [Number(o.pitch ?? 60), Number(o.start_time ?? 0),
              Number(o.duration ?? 0.25), Number(o.velocity ?? 100), Boolean(o.mute ?? false)];
    }
    return n;
  });
}
```

### System Prompt
Instructs Gemini to:
- Always `create_clip` before `add_notes_to_clip`
- Use exact note array format `[pitch, start, duration, velocity, mute]`
- Load VST3/AU plugins via `search_plugins` → `load_plugin_by_name` → `get_track_devices` → `set_device_parameter_by_name`
- Design sounds with intent (e.g., Serum 808: low pitch, high drive, short decay)
- Never use `load_instrument_or_effect` (broken); use `load_browser_item` with `item_uri=`

---

## 8. Known Bugs Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| Python 2.7 SyntaxError in Claude Desktop | `"command": "python"` picks system Python 2.7 | Changed to `"command": "python3"` |
| FastMCP `description` kwarg crash | FastMCP v1.x renamed arg | Changed to `instructions=` |
| `create_midi_track(index=-1)` crash | Live 12 rejects -1 | Always pass `track_count` as index |
| `load_instrument_or_effect` unknown command | Removed in this fork | Use `load_browser_item` with `item_uri=` |
| Socket poisoning after timeout | Timed-out socket left open, poisons next request | Disconnect and reconnect on every request |
| `humanize_clip_timing/velocity` crash | `clip.get_notes()` deprecated in Live 12 | Replaced with `get_notes_extended` helpers |
| `generate_drum_pattern/bassline` crash | Same Live 12 API deprecation | Same fix |
| `ableton-mcp` as nested git repo | `.git` folder inside tracked directory | Removed `.git`, re-added as plain files |
| Gemini `SchemaType` error | Tool schemas used string literals `"OBJECT"` | Use `SchemaType.OBJECT` enum values |
| `ArraySchema` missing `items` | Gemini SDK requires `items` on arrays | Added `items: { type: SchemaType.OBJECT }` |
| Gemini "First content must be role user" | Greeting message added as first history item | Strip leading `model` role messages |
| `gemini-2.0-flash` 404 | Not available to new users | Updated to `gemini-2.5-flash` |
| SessionMirror showing mock data | `ableton-state` route returned `tracks: []` | Added `get_all_track_names` call |
| Ableton state poll timing out | 13 TCP calls per poll | Reduced to 2 calls, timeout 12s → 5s |
| `add_notes_to_clip` persistent failure | Gemini sends notes as objects not arrays | Added `normalizeNotes()` converter |

---

## 9. Known Limitations (Ableton LOM)

| Feature | Status | Notes |
|---|---|---|
| Audio clips on Arrangement timeline | Not possible | Ableton LOM doesn't expose audio clip creation |
| Load VST3/AU by arbitrary file path | Not possible | Must use Ableton browser URI / User Library indexing |
| Load arbitrary VST3 not in User Library | Partial | Plugin must be installed and Ableton-scanned first |
| ElevenLabs voice samples | Deferred | Not tested this session |
| Set clip loop length after creation | Works | Use `set_clip_loop_end` |
| Read audio clip waveform data | Not possible | LOM doesn't expose audio sample data |

---

## 10. Setup Instructions

### Prerequisites
- Ableton Live 12
- Python 3.10+
- Node.js 18+
- Gemini API key

### One-time Setup

```bash
git clone https://github.com/YOUR_ORG/wonder
cd wonder

# Install MCP server
pip install -e ableton-mcp

# Copy Remote Script to Ableton
cp -r ableton-mcp/AbletonMCP_Remote_Script ~/Music/Ableton/User\ Library/Remote\ Scripts/AbletonMCP

# Install frontend deps
cd frontend && npm install

# Create .env.local
echo "GEMINI_API_KEY=your_key_here" > .env.local
```

### Ableton Setup
1. Open Ableton Live 12
2. Preferences → Link/Tempo/MIDI → Control Surface → select `AbletonMCP`
3. Confirm "AbletonMCP connected" in the Ableton status bar

### Claude Desktop Setup
This flow is now obsolete for Ableton control inside Wonder. The app sends commands straight to the Ableton socket bridge on `localhost:9877`, so no separate Ableton MCP server entry is required in Claude Desktop.

### Run the Frontend
```bash
cd frontend && npm run dev
# Open http://localhost:3000
```

---

## 11. Sound Indexing Interface Contract

For the teammate building the **Sound Indexing System**, Wonder expects:

```typescript
// POST /api/sound-index/search
{
  query: string;          // e.g. "punchy 808 bass"
  tags?: string[];        // e.g. ["drums", "bass", "lofi"]
  bpm_range?: [number, number];
  key?: string;
}

// Response
{
  results: Array<{
    id: string;
    name: string;
    file_path: string;    // absolute path on disk
    tags: string[];
    bpm?: number;
    key?: string;
    duration_s: number;
    waveform_png?: string; // base64 or URL, 200x60px
  }>
}
```

Wonder will call this endpoint and pass `file_path` directly to `load_sample_by_path`.

---

## 12. What's Next

### High Priority (Hackathon Demo)
- [ ] Test VST3/AU plugin loading end-to-end with a real plugin (e.g., Serum)
- [ ] Wire up voice input (MediaRecorder → Whisper API) in `CopilotChat.tsx`
- [ ] Add `.wonderprofile` JSON loading to the chat system prompt

### Post-Hackathon
- [ ] Sound indexing service (teammate task)
- [ ] Session export: export current Ableton project as `.als` + bounce to MP3
- [ ] "Remix" mode: load existing session → Wonder re-arranges/layers on top
- [ ] Sauce Rack library: curated `.adg` FX chain presets for genres
- [ ] Real waveform visualization from audio analysis
