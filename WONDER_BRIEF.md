# Wonder — Project Brief

## What It Is

Wonder is "Cursor for music production." You describe a track, and Wonder generates a complete, editable Ableton Live session — real MIDI, Drum Racks, effect chains — not a flat MP3 you can't touch.

The gap it fills: every AI music tool today (Suno, Udio, etc.) spits out audio blobs. Producers can't edit them, remix them, or build on them. Wonder outputs the session itself. It's the difference between getting a JPEG and getting the Photoshop file.

---

## How It Works

```
User prompt
    → Python LLM orchestration layer (MCP server)
        → Ableton Remote Script (TCP bridge on localhost:9877)
            → Ableton Live 12 (live session, MIDI, devices, clips)
```

**Key differentiator — `.wonderprofile`**
A JSON file containing the user's musical identity: genres, favorite artists, plugins they own, sample packs they use. This gets silently injected as the LLM's system prompt on every call, so the AI generates genre-appropriate, authentic patterns instead of generic ones. A lo-fi producer and a hardstyle producer get completely different sessions from the same prompt.

**Sauce Racks**
Pre-saved Ableton Effect Rack `.adg` files (OTT, RC-20, SketchCassette, Vulf Compressor, etc.) that get loaded onto tracks automatically based on the genre/vibe. The user's actual plugin chain, not a simulation.

**ElevenLabs SFX pipeline**
When the user's sample library doesn't have what's needed, Wonder calls ElevenLabs' sound generation API to create a custom sample, then loads it directly onto a Drum Rack pad via `load_sample_by_path`.

---

## Current Status

**Infrastructure: done and tested (33/33 passing)**

The Ableton MCP layer is fully audited and working:
- Create tracks, name them, set volume/pan
- Inject MIDI clips with humanized notes (velocity curves, timing jitter, ghost notes)
- Generate drum patterns: lofi, trap, house, hiphop, jazz, afrobeats, dnb
- Generate basslines with scale awareness (minor, pentatonic, blues, dorian, etc.)
- Load instruments and effect racks from Ableton browser by URI
- Control device parameters (rack macros, etc.)
- Scene management, undo/redo, freeze/flatten, swing amount
- `create_wonder_session` — single command that builds an entire session in one round trip
- `load_sample_by_path` — drop any .wav onto a Drum Rack pad (ElevenLabs pipeline hook)

**Not built yet:**
- Frontend (Next.js UI — text prompt input, session preview)
- `.wonderprofile` system prompt injection logic
- LLM orchestration layer (the "brain" that turns a prompt into a sequence of MCP calls)
- Audio-to-MIDI (basic-pitch) for voice/guitar input
- ElevenLabs API integration (endpoint exists, not wired up)
- Sauce Rack auto-selection logic

---

## The Core Loop (target flow)

1. User opens Wonder, types: *"dark lo-fi hip hop, 85bpm, Sade vibes, A minor"*
2. LLM reads `.wonderprofile` (user owns RC-20, SketchCassette, has SP-404 drum kit)
3. LLM calls `create_wonder_session` → Ableton session appears: drums, bass, chords, pads
4. LLM loads Sauce Racks (RC-20 on bass, SketchCassette on drums) via browser URI
5. LLM calls ElevenLabs for a custom vinyl crackle if user's library doesn't have one
6. User hears it playing in Ableton in ~10 seconds, with full MIDI they can edit

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (possibly Tauri desktop wrapper) |
| Orchestration | Python, FastMCP, Claude API |
| DAW bridge | jpoindexter/ableton-mcp (forked + upgraded) |
| DAW | Ableton Live 12 |
| Audio-to-MIDI | basic-pitch (Spotify) |
| Sample gen | ElevenLabs SFX API |

---

## Hackathon Sponsors to Hit

- **ElevenLabs** — sound generation for the sample pipeline
- Potentially others depending on what they're offering

---

## Open Questions / Things to Brainstorm

- What should the UI actually look like? Chat interface? Visual session builder? Both?
- How does the `.wonderprofile` get created / onboarded? Manual JSON or a setup wizard?
- What's the right LLM prompt structure for turning a vibe description into a structured session spec?
- How do we handle the iterative loop — "make the bass more aggressive," "add a bridge" — without rebuilding everything?
- What's the demo-able slice for the hackathon? Full pipeline or just the Ableton layer + one killer example session?
- Any way to make the session shareable (export `.als` + stem bounces automatically)?
