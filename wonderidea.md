# WONDER

## The Vision

> **"Cursor for Music Production."** Namesake: Inspired by Stevie Wonder (The AI cannot see, but it creates beautiful music).

---

## 1. Core Philosophy

Current AI music generators produce flat, uneditable audio "slop." They act as replacements for human creativity rather than tools for it. Wonder takes the approach of AI coding assistants (like Cursor): it generates editable, modular source code for music.

Wonder does not generate a single baked-in MP3. It acts as an intelligent orchestrator that listens to the user (via text or raw audio input) and programmatically generates an entire Ableton Live session—complete with editable MIDI, specific Drum Racks, and pre-configured VST plugin chains. It allows for rapid prototyping that the human producer can immediately fine-tune.

---

## 2. System Architecture

The application operates on a **Client-Server-DAW architecture** leveraging the Model Context Protocol (MCP).

### Frontend (The Client)
A custom Next.js web application (potentially wrapped in Tauri for native OS/file system access). This acts as the conversational and recording interface. It captures text prompts and high-fidelity microphone audio (via Shure SM7B/audio interface).

### Backend (The Brain)
A local Python MCP (Model Context Protocol) Server. This server handles LLM orchestration, audio-to-MIDI translation, and tool calling.

### Execution Bridge (The Hands)
A Python-based Ableton Remote Script / OSC bridge (forked from existing open-source AbletonMCP paradigms). This receives commands from the backend and manipulates the Ableton Live Object Model (LOM).

### DAW
Ableton Live.

---

## 3. Core Features & Tool Specs

### A. Multi-Modal Context Engine (Audio-to-MIDI)

The user can play live guitar, sing, or beatbox directly into the Next.js frontend.

**Mechanism:** The frontend captures the audio buffer and sends it to the Python backend. Python uses libraries like Spotify's basic-pitch or librosa to extract the notes, timing, and tempo, converting the raw audio into structured MIDI data.

**Use Case:** The AI analyzes the live guitar MIDI to determine the chord progression, and then generates complimentary basslines and drum grooves to build a track around the user's live audio.

### B. The .wonderprofile (Dynamic System Prompting)

To avoid "prompt paralysis," Wonder maintains a persistent state of the user's musical identity.

**Mechanism:** A highly visual, social-style settings page in the Next.js frontend where the user defines their "Producer DNA" (favorite genres, go-to plugins, local sample folder paths, and favorite artists).

**Execution:** This data is saved as a JSON configuration (`.wonderprofile`). Every time a prompt is sent to the LLM, this JSON is silently injected as the system prompt. If the user plays a guitar loop and says "build a beat," Wonder already knows to make it a Lo-Fi House beat using organic drum samples.

### C. The "Sauce" Injection (Third-Party VSTs)

The AI must make the music sound professional immediately by leveraging the user's actual producer knowledge.

**Mechanism:** Because the Ableton API struggles to load arbitrary third-party VSTs dynamically, the user will pre-save custom Ableton Audio Effect Racks (e.g., `Wonder_Sauce_Rack.adg` containing plugins like RC-20, OTT, SketchCassette, Digitalis, and Vulf Compressor).

**Execution:** The AI is instructed via its MCP tools to load these specific `.adg` files onto the tracks it generates, instantly providing professional texture.

### D. ElevenLabs Dynamic Sample Generation (Sponsor Integration)

Wonder acts as an infinite crate-digger.

**Mechanism:** When the LLM decides the track needs a specific sound (e.g., "a cinematic metallic snare") that does not exist in the user's local `.wonderprofile` sample folders, it falls back to the ElevenLabs API.

**Execution:** The Python backend calls the ElevenLabs Sound Effects API, generates the custom `.wav` file, saves it locally, and then uses the Ableton bridge to load it into a Drum Rack.

---

## 4. The "Golden Loop" (Data Flow)

1. **Capture:** User records a 10-second vocal hum into the Next.js UI.
2. **Translate:** UI sends `.wav` to Python backend. Python (basic-pitch) converts the hum to a MIDI array.
3. **Prompt Formulation:** The Next.js UI asks clarifying questions to fine-tune the vibe. The answers, the hum's MIDI data, and the `.wonderprofile` JSON are packaged and sent to the LLM via the MCP server.
4. **AI Orchestration:** The LLM generates the complementary MIDI arrangements (drums, chords) and issues tool calls to the Ableton bridge.
5. **DAW Execution:** The Ableton bridge creates the tracks, loads the Drum Racks/Sauce Racks, maps the ElevenLabs generated samples, and injects the MIDI.

---

## 5. Development Constraints & Notes for Claude Code

### Ableton API Limitation

The Ableton Live Object Model (LOM) cannot programmatically slice or move raw audio clips horizontally on the Arrangement View timeline. **Do not attempt to write code that places `.wav` files directly on the timeline.**

**The Workaround:** All audio manipulation must be done by loading `.wav` files into Ableton's Simpler or Drum Rack devices, and then triggering them via MIDI clips.

