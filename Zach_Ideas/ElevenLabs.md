# ElevenLabs — Wonder integration

## Why it’s relevant

Wonder’s pitch is **AI-assisted music production** with **real, editable sessions** — not flat MP3s. **ElevenLabs** fits as a **sample generator**: short **drum one-shots**, **percussion**, **foley**, or **textural hits** from natural language prompts (“tight 909 kick, short decay, room”).

Those assets become **first-class library items**: tagged, indexed, and **loaded into the DAW** (e.g. Ableton via existing `load_sample_by_path` / browser flows), same as user samples.

---

## How we’ll implement it (high level)

### 1. Generation flow

1. User (or copilot) submits a **text prompt** + optional parameters (length, style hints).
2. Backend calls **ElevenLabs API** (audio / sound generation capability — use the product’s current API for short-form audio).
3. **Post-process** (minimal for hackathon):
   - Normalize peak / trim silence (optional, e.g. `ffmpeg` or `librosa`).
   - Save to a known folder (local or cloud storage) with a stable filename.
4. **Metadata**:
   - `source: elevenlabs`, `prompt`, `model_id`, timestamps.
   - Run existing **tagging** pipeline (math + vibe) or a lighter path for demo.
5. **Persist**:
   - **MongoDB Atlas** document for the sample + user linkage.
   - Optional **Snowflake** event `sample_generated`.

### 2. DAW integration

- **Ableton (Wonder bridge):** pass **absolute path** into the bridge command that loads samples onto Simpler / Drum Rack (per project README).
- **Other DAWs (FL, Pro Tools):** same files land in a **synced or watch folder**; user drags in or uses DAW import — cloud profile stores **where** the pack should appear.

### 3. API & config

- API key in **environment** or **`.env`** (never commit): `ELEVENLABS_API_KEY`.
- Rate limits / cost: cache generations by `hash(prompt + params)` for demo repeatability.

### 4. Hackathon demo checklist

- Show **2–3 different prompts** → **audible** results in the session.
- Show **metadata** in Atlas (or DB) tied to the same file.
- Optional: one chart in Snowflake: “N generations today.”

---

## Relationship to other pieces

- **MongoDB Atlas** — canonical **metadata + profile** for each generated asset.
- **Snowflake** — **analytics** on generation and load success rates.
- **Local tagging (`tagging/`)** — can reuse **math** features; vibe tags may come from Gemini or from prompt + defaults for speed.
