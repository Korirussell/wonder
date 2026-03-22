# WONDER — AI-Powered DAW in React

> **"Cursor for Music Production."** Build complete, editable music sessions through conversation and AI assistance.

---

## 🎯 The Vision (Hackathon Pivot)

Wonder is a **standalone AI-powered Digital Audio Workstation** built entirely in React. Unlike traditional AI music tools that output flat MP3s, Wonder generates **editable, modular music sessions** with real tracks, MIDI, audio processing, and effects — all controllable through natural language.

**Inspired by:** [Lavoe](https://github.com/Leonardomontesqui/Lavoe) — "Cursor for music production"

**Key differentiator:** Wonder combines AI-driven music generation with intelligent sample management, semantic search, and professional audio processing — all in a beautiful, intuitive web interface.

---

## 🏗️ Architecture Overview

### Frontend (React + Next.js)
- **UI Framework:** Next.js 14+ (App Router), React, TypeScript
- **Styling:** Tailwind CSS with **Japanese Soft Brutalism** aesthetic
- **Audio Engine:** Web Audio API, Tone.js for synthesis and sequencing
- **State Management:** Zustand or Jotai for global audio state
- **Icons:** Lucide React
- **Components:** shadcn/ui for modals, buttons, sliders

### Backend (FastAPI + Python)
- **Server:** FastAPI for audio processing endpoints
- **Audio Processing:** librosa, soundfile, pydub
- **AI Integration:** 
  - Cohere for embeddings and semantic search
  - ElevenLabs for AI-generated samples
  - Gemini for vibe tagging and descriptions
- **Database:** 
  - MongoDB Atlas for user profiles, sample metadata, session history
  - LanceDB (local) for vector embeddings and semantic search

### Key Services
1. **Audio Processing Service** — harmonic extraction, reverb, chopping, speed manipulation
2. **Sample Tagging Service** — automatic categorization, vibe analysis, embedding generation
3. **AI Generation Service** — ElevenLabs integration for custom sample creation
4. **Semantic Search Service** — find samples by natural language ("tight 909 kick, short decay")

---

## 🎨 Design System (Japanese Soft Brutalism)

### Core Aesthetic
- **Background:** `#FDFDFB` (off-white) with subtle CSS graph-paper grid pattern
- **Borders:** Solid `border-2 border-[#1A1A1A]` on all containers
- **Shadows:** Hard, un-blurred drop shadows: `shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
- **Border Radius:** `rounded-xl` or `rounded-2xl` for soft, cute feel
- **Typography:** 
  - UI: Inter or Poppins (geometric sans-serif)
  - Musical data: JetBrains Mono (monospace for BPM, Key, etc.)

### Color Palette
- **Matcha Green:** `#C1E1C1` — active/success states (recording mic)
- **Soft Lavender:** `#E9D5FF` — AI chat bubbles
- **Pale Yellow:** `#FEF08A` — highlights/HUD elements
- **Black:** `#1A1A1A` — borders and text
- **Off-White:** `#FDFDFB` — main background

---

## 🎵 Core Features

### 1. Conversational DAW Interface
**Split-pane desktop application:**

#### Left Pane (40%): Copilot Chat
- Natural language music production assistant
- Message history with user (right-aligned, white) and AI (left-aligned, lavender) bubbles
- Input area with:
  - Text input field
  - Attachment icon (for audio files)
  - **Chunky Microphone Button** (matcha green when inactive, pulsing red when recording)
- Voice input for humming/beatboxing → audio-to-MIDI conversion

#### Right Pane (60%): Session Mirror
- **Top Info HUD:** Global track state (BPM, Key, Time Signature) styled like masking tape
- **Track Grid:** Horizontal scrolling flex row of track columns
- Each track column shows:
  - Track name header
  - M/S/A toggles (Mute, Solo, Arm)
  - Vertical volume slider
  - Device rack with plugin pills
  - Waveform/MIDI preview

### 2. AI-Powered Beat Generation
**Prompt examples:**
- "dark lo-fi hip hop, 85bpm, Sade vibes, A minor"
- "energetic house track with rolling bassline"
- "jazz drums with swing, 120bpm"

**Generation capabilities:**
- Drum patterns (lofi, trap, house, hiphop, jazz, afrobeats, dnb)
- Basslines with scale awareness (minor, pentatonic, blues, dorian)
- Chord progressions
- Melodic elements

### 3. Intelligent Sample Management

#### Semantic Search
- Natural language queries: "tight 909 kick, short decay, room"
- Vector embeddings (Cohere) for similarity matching
- Multi-modal search: text + audio features + vibe tags

#### Auto-Tagging Pipeline
**Math features (librosa):**
- Duration, tempo, key, RMS energy
- Spectral centroid, zero-crossing rate
- MFCC features for timbre

**Vibe tags (Gemini):**
- Category (kick, snare, hi-hat, bass, synth, etc.)
- Sub-category (808, acoustic, electronic, etc.)
- Descriptive tags (punchy, warm, bright, dark, etc.)
- Natural language description

**Storage:**
- Local: LanceDB with vector embeddings
- Cloud: MongoDB Atlas for sync across devices

### 4. Agentic Audio Processing

**Real-time effects:**
- Harmonic extraction (isolate melodic content)
- Reverb processing (customizable room size, decay)
- Audio chopping (intelligent beat slicing)
- Speed/pitch manipulation
- Compression, EQ, filtering

**Workflow:**
- Drag audio file into chat
- AI suggests processing: "This sounds like a vocal sample. Want me to extract harmonics and add reverb?"
- One-click apply with preview

### 5. ElevenLabs Sample Generation

**Dynamic sample creation:**
- User (or AI) requests specific sound not in library
- ElevenLabs API generates custom audio
- Auto-tagged and indexed into library
- Immediately available for use in session

**Metadata tracking:**
- Source: `elevenlabs`
- Generation prompt
- Model ID and parameters
- Timestamp
- User linkage in MongoDB Atlas

### 6. .wonderprofile (Musical Identity)

**User preferences stored as JSON:**
```json
{
  "user_id": "...",
  "favorite_genres": ["lo-fi", "hip-hop", "house"],
  "favorite_artists": ["J Dilla", "Nujabes", "Kaytranada"],
  "owned_plugins": ["RC-20", "OTT", "SketchCassette", "Vulf Compressor"],
  "sample_folders": ["/Users/kori/Samples/808s", "/Users/kori/Samples/Vinyl"],
  "default_bpm": 85,
  "default_key": "A minor",
  "production_style": "warm, analog, lo-fi aesthetic"
}
```

**Usage:**
- Silently injected into AI system prompt
- Personalizes all generation and recommendations
- Lo-fi producer vs hardstyle producer get completely different results from same prompt

---

## 🛠️ Technical Implementation

### Frontend Architecture

```
frontend/
├── app/
│   ├── layout.tsx                 # Root layout with graph-paper background
│   ├── page.tsx                   # Main split-pane DAW interface
│   └── api/
│       ├── audio/                 # Audio processing endpoints
│       ├── search/                # Sample search endpoints
│       └── generate/              # AI generation endpoints
├── components/
│   ├── Header.tsx                 # Top bar with logo and profile button
│   ├── WonderProfileModal.tsx     # Genre/VST preferences modal
│   ├── CopilotChat/
│   │   ├── CopilotChat.tsx       # Left pane container
│   │   ├── MessageBubble.tsx     # Individual chat messages
│   │   └── InputArea.tsx         # Text input + mic button
│   ├── SessionMirror/
│   │   ├── SessionMirror.tsx     # Right pane container
│   │   ├── InfoHUD.tsx           # BPM/Key display
│   │   ├── TrackColumn.tsx       # Individual track column
│   │   └── DevicePill.tsx        # Plugin tag component
│   └── AudioEngine/
│       ├── Transport.tsx          # Play/pause/stop controls
│       ├── Sequencer.tsx          # MIDI sequencer
│       └── Mixer.tsx              # Volume/pan controls
├── lib/
│   ├── audio/
│   │   ├── engine.ts             # Web Audio API wrapper
│   │   ├── tone-setup.ts         # Tone.js configuration
│   │   └── midi.ts               # MIDI utilities
│   ├── api/
│   │   ├── backend.ts            # FastAPI client
│   │   └── types.ts              # TypeScript types
│   └── state/
│       ├── audio-store.ts        # Zustand store for audio state
│       └── session-store.ts      # Session/track state
└── styles/
    └── globals.css               # Tailwind config + graph-paper pattern
```

### Backend Architecture

```
backend/
├── server.py                      # FastAPI app entry point
├── routers/
│   ├── audio_processing.py       # /extract-harmonics, /process-reverb, /chop-audio
│   ├── sample_search.py          # /search-samples (semantic + filters)
│   ├── generation.py             # /generate-sample (ElevenLabs)
│   └── sessions.py               # /sessions (CRUD for session state)
├── services/
│   ├── audio_processor.py        # librosa-based audio processing
│   ├── tagging_service.py        # Auto-tagging pipeline
│   ├── embedding_service.py      # Cohere embeddings
│   ├── elevenlabs_service.py     # Sample generation
│   └── search_service.py         # LanceDB + MongoDB search
├── models/
│   ├── sample.py                 # Sample metadata schema
│   ├── session.py                # Session state schema
│   └── user.py                   # User profile schema
└── db/
    ├── mongodb.py                # MongoDB Atlas client
    └── lancedb_client.py         # LanceDB client
```

### Data Flow Example

**User prompt:** "Create a lo-fi beat with vinyl crackle"

1. **Frontend** → User types in chat, clicks send
2. **AI Processing** → LLM analyzes prompt + `.wonderprofile`
3. **Sample Search** → Semantic search for "vinyl crackle" in local library
4. **Generation Fallback** → If not found, call ElevenLabs API
5. **Auto-Tagging** → New sample gets math features + vibe tags + embedding
6. **Database Write** → Metadata to MongoDB Atlas, vector to LanceDB
7. **Beat Generation** → AI generates drum pattern (lofi style, 85bpm)
8. **Track Creation** → Frontend creates tracks with Tone.js
9. **Sample Loading** → Load vinyl crackle onto drum pad
10. **Playback** → User hears complete beat in browser

---

## 🎯 Hackathon Demo Flow

### Setup (Pre-demo)
1. Index ~50 sample files with tagging pipeline
2. Create 2-3 `.wonderprofile` presets (lo-fi, trap, house)
3. Pre-generate 3-4 ElevenLabs samples for reliability

### Demo Script (5 minutes)

**Act 1: The Interface (30 seconds)**
- Show beautiful split-pane UI
- Highlight Japanese Soft Brutalism aesthetic
- Point out chat interface + session mirror

**Act 2: Natural Language Generation (90 seconds)**
- Type: "dark lo-fi hip hop, 85bpm, A minor"
- Watch AI generate:
  - Drum track with lofi pattern
  - Bassline in A minor
  - Chord progression
- Show tracks appear in session mirror
- Click play → hear the beat

**Act 3: Intelligent Sample Search (60 seconds)**
- Type: "add a warm vinyl crackle"
- Show semantic search results
- Drag sample onto track
- Play with new texture

**Act 4: AI Sample Generation (60 seconds)**
- Type: "I need a cinematic metallic snare"
- Show ElevenLabs generation
- Display auto-tagging results in MongoDB Atlas
- Load onto drum rack
- Play the new sound

**Act 5: The Profile (30 seconds)**
- Open `.wonderprofile` modal
- Show genre preferences, owned plugins
- Explain how this personalizes everything

**Closing (30 seconds)**
- "This is Wonder — Cursor for music production"
- "Editable sessions, not flat MP3s"
- "Your musical identity, your sound library, AI-powered"

---

## 🔧 Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS 3.4+
- **Audio:** Tone.js, Web Audio API
- **UI Components:** shadcn/ui, Lucide React
- **State:** Zustand
- **HTTP:** Fetch API, SWR for caching

### Backend
- **Server:** FastAPI (Python 3.10+)
- **Audio Processing:** librosa, soundfile, pydub, numpy
- **AI/ML:**
  - Cohere (embeddings)
  - ElevenLabs (sample generation)
  - Gemini (vibe tagging)
- **Databases:**
  - MongoDB Atlas (cloud metadata)
  - LanceDB (local vector search)
- **Utilities:** pandas, scikit-learn

### Infrastructure
- **Deployment:** Vercel (frontend), Railway/Fly.io (backend)
- **Storage:** MongoDB Atlas (metadata), local filesystem (audio files)
- **APIs:** ElevenLabs, Cohere, Google Gemini

---

## 📁 What We're Keeping from Original Wonder

### ✅ Keep
- **`frontend/`** — React UI foundation
- **`tagging/`** — Sample indexing pipeline (math + vibe + embeddings)
- **`dev_samples/`** — Test audio files for development
- **`Zach_Ideas/`** — ElevenLabs, MongoDB Atlas, Snowflake integration docs
- **`.wonderprofile` concept** — User musical identity JSON

### ❌ Remove/Archive
- **`ableton-mcp/`** — No longer using Ableton bridge
- **`ableton_test.py`** — Ableton-specific tests
- **Backend .md files:**
  - `CHANGES_SUMMARY.md`
  - `IMPLEMENTATION_SUMMARY.md`
  - `TESTING_GUIDE.md`
  - `WONDER_MD_IMPLEMENTATION.md`
  - `WONDER_REPORT.md`
  - `thenewway.md`
  - `wonder.md`
- Keep: `README.md`, `WONDER_BRIEF.md`, `wonderidea.md`, `features.md`

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Day 1)
- [ ] Clean up repo (archive backend files)
- [ ] Set up Next.js frontend with Tailwind + design system
- [ ] Implement split-pane layout (CopilotChat + SessionMirror)
- [ ] Build core UI components (Header, Modal, TrackColumn, etc.)
- [ ] Set up FastAPI backend skeleton
- [ ] Configure MongoDB Atlas connection

### Phase 2: Audio Engine (Day 1-2)
- [ ] Integrate Tone.js for synthesis and sequencing
- [ ] Build basic transport controls (play/pause/stop)
- [ ] Implement MIDI sequencer with Tone.js
- [ ] Create audio track mixer (volume, pan)
- [ ] Add waveform visualization

### Phase 3: Sample Management (Day 2)
- [ ] Connect tagging pipeline to backend API
- [ ] Build sample browser UI component
- [ ] Implement semantic search with Cohere embeddings
- [ ] Create drag-and-drop sample loading
- [ ] Display sample metadata (tags, description, waveform)

### Phase 4: AI Generation (Day 2-3)
- [ ] Integrate ElevenLabs API for sample generation
- [ ] Build beat generation logic (drum patterns, basslines)
- [ ] Implement `.wonderprofile` system
- [ ] Create AI chat interface with streaming responses
- [ ] Add voice input (microphone recording)

### Phase 5: Audio Processing (Day 3)
- [ ] Implement harmonic extraction endpoint
- [ ] Add reverb processing
- [ ] Build audio chopping/slicing
- [ ] Create speed/pitch manipulation
- [ ] Add real-time preview

### Phase 6: Polish & Demo (Day 3-4)
- [ ] Refine Japanese Soft Brutalism aesthetic
- [ ] Add animations and transitions
- [ ] Create demo session presets
- [ ] Write demo script
- [ ] Record demo video
- [ ] Deploy to Vercel

---

## 💡 Key Insights from Lavoe

### What Lavoe Does Well
1. **Intuitive DAW interface** — Clean, modern UI that doesn't overwhelm
2. **Agentic audio processing** — AI suggests and applies effects intelligently
3. **Live audio recording** — Direct browser-based recording
4. **FastAPI + Next.js stack** — Proven architecture for audio web apps

### How Wonder Differentiates
1. **Semantic sample search** — Natural language queries with vector embeddings
2. **Musical identity system** — `.wonderprofile` personalizes everything
3. **ElevenLabs integration** — Infinite sample library through AI generation
4. **Japanese Soft Brutalism design** — Unique, memorable aesthetic
5. **MongoDB Atlas + LanceDB** — Cloud sync + local vector search

---

## 🎨 Design Philosophy

### User Experience Principles
1. **Conversational First** — Music production through natural language
2. **Immediate Feedback** — Hear results within seconds
3. **Editable Everything** — No black boxes, full control
4. **Beautiful by Default** — Professional sound without manual tweaking
5. **Personal & Adaptive** — Learns your style, suggests your sounds

### Technical Principles
1. **Web-First** — No installation, works anywhere
2. **Progressive Enhancement** — Core features work offline
3. **Performance Obsessed** — <100ms audio latency
4. **Data Ownership** — User controls their samples and profiles
5. **Open Architecture** — Extensible for new AI models and effects

---

## 📊 Success Metrics (Hackathon)

### Must-Have
- [ ] Generate complete beat from text prompt
- [ ] Semantic sample search working
- [ ] ElevenLabs integration live
- [ ] Beautiful UI that demos well
- [ ] 5-minute demo script executed smoothly

### Nice-to-Have
- [ ] Voice input → MIDI conversion
- [ ] Real-time audio effects
- [ ] Session save/load
- [ ] MongoDB Atlas integration visible
- [ ] Mobile-responsive design

### Stretch Goals
- [ ] Collaborative sessions (multiplayer)
- [ ] Export to Ableton/FL Studio
- [ ] VST plugin support
- [ ] Stem separation
- [ ] AI mastering

---

## 🤝 Sponsor Integration Opportunities

### ElevenLabs
- **Primary:** AI sample generation for missing sounds
- **Demo moment:** "I need a cinematic metallic snare" → instant generation
- **Value prop:** Infinite, personalized sample library

### MongoDB Atlas
- **Primary:** User profiles, sample metadata, session history
- **Demo moment:** Show sample document in Atlas after ElevenLabs generation
- **Value prop:** Cloud sync, multi-device access, flexible schema

### Cohere (Optional)
- **Primary:** Semantic embeddings for sample search
- **Demo moment:** Natural language search returns perfect samples
- **Value prop:** Better than keyword search, understands musical context

---

## 🎯 The Pitch

**Problem:** AI music tools output flat, uneditable audio. Producers can't build on them.

**Solution:** Wonder generates editable music sessions — real tracks, MIDI, effects — not MP3s.

**Magic:** Natural language + your musical identity + intelligent sample library = professional beats in seconds.

**Differentiator:** "Cursor for music production" — AI assists, you create.

**Vision:** Every producer has an AI copilot that knows their sound, their samples, their style.

---

## 🔮 Post-Hackathon Roadmap

### v1.0 (Public Beta)
- Multi-DAW export (Ableton, FL Studio, Logic)
- VST plugin support
- Collaborative sessions
- Mobile app (React Native)
- Marketplace for `.wonderprofile` presets

### v2.0 (Pro Features)
- Stem separation and remixing
- AI mastering and mixing
- Audio-to-MIDI for complex instruments
- Real-time collaboration
- Cloud rendering for CPU-intensive processing

### v3.0 (Platform)
- Wonder API for third-party integrations
- Plugin SDK for custom effects
- Sample pack marketplace
- Producer community features
- Educational content and tutorials

---

**Built with ❤️ for producers who want AI to enhance creativity, not replace it.**
