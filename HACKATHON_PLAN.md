# Wonder Hackathon — 5-Hour Sprint Plan

## Gap Analysis: What Exists vs. What's Needed

### ✅ Already Built (Keep)
- **Next.js frontend** with Tailwind + "Japanese Soft Brutalism" (graph-paper bg, hard shadows, thick borders)
- **CopilotChat** component with chat bubbles, tap rhythm, mic recording, file attachment
- **SessionMirror** with arrangement + session views, DnD track columns
- **Chat API route** (`/api/chat`) with Gemini + Claude dual-path agentic loops
- **ElevenLabs integration** (sound gen, TTS, buffer gen) in `src/lib/elevenlabs.ts`
- **DAW state management** via `DAWContext.tsx` with tracks, blocks, transport
- **Ableton MCP bridge** — full tool suite (33/33 passing)

### ❌ Gaps (Must Build)
| # | Gap | Current State | Target State |
|---|-----|--------------|--------------|
| 1 | **Vercel AI SDK** | Custom `fetch()` in CopilotChat | `useChat` hook with streaming |
| 2 | **Tone.js engine** | Raw `AudioContext` + `HTMLAudioElement` | `Tone.Transport`, `Tone.Sampler`, `Tone.Player` |
| 3 | **`.wonderprofile`** | `wonder.md` loaded server-side | Static JSON injected into every LLM prompt |
| 4 | **`samples.json`** | Nothing | Static file with 5+ audio URLs + vibe tags |
| 5 | **Sample search** | Nothing | Frontend `.filter()` over `samples.json` |
| 6 | **Fake "Listening..."** | Nothing | 3s spinner → hard-snap BPM |
| 7 | **Tone.Waveform viz** | Canvas waveform in `Waveform.tsx` | Reactive `Tone.Waveform` or `Tone.FFT` |
| 8 | **Backend bloat** | librosa, sklearn, numpy, soundfile | Kill it or slim to ElevenLabs-only proxy |

---

## Task Assignment: Cascade vs. Cursor

### 🔵 CASCADE (This AI) — Data Layer + Engine + Backend
These are the foundational pieces both AIs need. I build them first so Cursor can consume them.

**Hour 1 (1:00–2:00 AM)**
- [x] Create `.wonderprofile.json` 
- [x] Create `samples.json`
- [x] Create `src/lib/sampleSearch.ts` (frontend `.filter()` utility)
- [x] Wire `.wonderprofile` into chat system prompt injection
- [x] Install `tone` + `ai` (Vercel AI SDK) npm packages

**Hour 2 (2:00–3:00 AM)**
- [ ] Create `src/lib/toneEngine.ts` — Tone.js wrapper (Transport, Sampler, Player)
- [ ] Create `src/components/ListeningAnalysis.tsx` — fake 3s loading → BPM snap
- [ ] Slim down backend: create `backend/server_lite.py` (ElevenLabs-only FastAPI)

**Hour 3+ (3:00 AM–)**
- [ ] Hook ToneEngine into DAWContext
- [ ] Replace `useDAWEngine` internals with Tone.js calls
- [ ] Build `Tone.Waveform`-based visualizer component

### 🟡 CURSOR (Other AI) — UI Layer + Chat Streaming
Cursor focuses on the visible demo layer.

**Hour 1–2**
- [ ] Refactor `CopilotChat.tsx` to use Vercel AI SDK `useChat` hook
- [ ] Update `/api/chat/route.ts` to return a streaming `Response` (Vercel AI SDK format)
- [ ] Polish the split-screen layout: Chat 40% / Session Mirror 60%

**Hour 3–4**
- [ ] Build reactive waveform visualizer using `Tone.Waveform` (or `Tone.FFT`)
- [ ] Wire `samples.json` search into the chat flow
- [ ] Add `.wonderprofile` display in `WonderProfileModal.tsx`

**Hour 5 (5:00–6:00 AM) — Demo Polish**
- [ ] End-to-end: type prompt → AI streams response → ElevenLabs generates sound → Tone.js plays it
- [ ] Record demo flow, test edge cases
- [ ] Deploy or prepare local demo

---

## Key Files Created by Cascade (for Cursor to consume)

| File | Purpose |
|------|---------|
| `frontend/public/wonderprofile.json` | User identity — injected into every LLM system prompt |
| `frontend/public/samples.json` | Mock sample library with vibe tags |
| `frontend/src/lib/sampleSearch.ts` | `.filter()` search over samples.json |
| `frontend/src/lib/toneEngine.ts` | Tone.js Transport + Sampler + Player wrapper |
| `frontend/src/components/ListeningAnalysis.tsx` | Fake 3s "Listening..." → BPM snap |
| `backend/server_lite.py` | Slim FastAPI: ElevenLabs proxy only |

---

## Architecture (Single Page)

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  CopilotChat │  │      Session Mirror          │ │
│  │  (useChat)   │  │  Arrangement / Session View  │ │
│  │  40% width   │  │  60% width                   │ │
│  │              │  │  ┌─────────────────────────┐  │ │
│  │  wonderprofile│  │  │   Tone.Waveform Viz    │  │ │
│  │  injected    │  │  └─────────────────────────┘  │ │
│  │              │  │  Track columns + device pills │ │
│  └──────┬───────┘  └──────────┬───────────────────┘ │
│         │                     │                      │
│         ▼                     ▼                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Tone.js Engine                      │ │
│  │  Transport (BPM) │ Sampler (drums) │ Player     │ │
│  └─────────────────────────────────────────────────┘ │
│         │                                            │
│         ▼                                            │
│  /api/chat ──→ Gemini/Claude (with .wonderprofile)   │
│  /api/sfx  ──→ FastAPI ──→ ElevenLabs Sound Gen API  │
└─────────────────────────────────────────────────────┘
```

## Demo Script (for judges)

1. Open Wonder → show the brutalist UI
2. Type: "dark lo-fi hip hop, 85bpm, Sade vibes, A minor"
3. AI streams response (Vercel AI SDK), creates tracks in Session Mirror
4. Play the session — Tone.Transport drives everything
5. Type: "I need a cinematic metallic snare"
6. ElevenLabs generates it → drops into Tone.Sampler
7. Plug in guitar → "Listening..." spinner → BPM auto-detects
8. Show .wonderprofile modal — "this is how Wonder knows your style"
