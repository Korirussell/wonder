# MongoDB Atlas — Wonder integration

## Why it’s relevant

Wonder needs a **flexible cloud backend** for:

- **User profiles** — identity, DAW preferences (Ableton, FL Studio, Pro Tools), default folders, and session settings.
- **Sample library metadata** — tags (math + vibe), embeddings pointers, file paths or storage URLs, source (`local` vs `ElevenLabs`), and generation prompts.
- **Session / copilot history** — what the user asked for, what was retrieved, what loaded into the DAW.

Document databases fit this well because **schemas evolve** during a hackathon (new fields for ElevenLabs params, new tag types, etc.) without rigid migrations.

**Optional strong angle:** **Atlas Vector Search** on embeddings for semantic “find this sound” queries in the cloud, complementing local LanceDB or replacing it for multi-device sync.

---

## How we’ll implement it (high level)

### 1. Collections (starting point)

| Collection | Purpose |
|------------|---------|
| `users` | Auth id, email, prefs, linked DAWs |
| `samples` | Metadata per audio asset: `uri`, `tags`, `math`, `source`, `prompt` (if generated), `created_at` |
| `sessions` | Wonder runs: prompt, chosen samples, load results (optional) |

### 2. App flow

1. After **ElevenLabs** (or local indexing) produces or registers a sample, the backend **upserts** a document in `samples` and links it to `users`.
2. The **frontend / copilot** reads the user’s library from Atlas for search and profile UI.
3. Local rigs (Ableton bridge, etc.) either:
   - call your **API** that reads/writes Atlas, or
   - sync via a small **desktop helper** that pulls “library manifest” documents.

### 3. Tech choices

- Official **MongoDB drivers** (Node/Python) from your existing backend.
- Env vars: `MONGODB_URI` (Atlas connection string), never committed.
- **Indexes** on `user_id`, `created_at`, and vector index if using Atlas Vector Search.

### 4. Hackathon demo checklist

- Show **one real document** in Compass or API JSON when a sample is saved.
- Show **one query**: “all samples for this user tagged `kick`.”

---

## Relationship to other pieces

- **ElevenLabs** → creates audio; metadata lands in **`samples`** with `source: elevenlabs` and prompt fields.
- **Snowflake** → optional **downstream**: batch or stream **events** (generated, loaded) for analytics; operational truth for the app stays in Atlas.
