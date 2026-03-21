# Snowflake — Wonder integration

## Why it’s relevant

Snowflake is a **cloud data warehouse**. It’s not the primary database for live “click a button” app state — that’s better suited to **MongoDB Atlas**.

Snowflake shines when you want to:

- Store **structured events** at scale (generations, loads, errors, latency).
- Run **SQL** for dashboards: “What gets used?”, “ElevenLabs vs library?”, “Where do failures happen?”
- Show hackathon judges a **data / analytics story**: Wonder isn’t only a plugin — it’s a **measurable product**.

**TL;DR:** Atlas runs the app; Snowflake **measures** how the app behaves over time.

---

## How we’ll implement it (high level)

### 1. Event model

Append-only rows (from your API or a small worker), for example:

| Event type | Example fields |
|------------|------------------|
| `sample_generated` | `user_id`, `source` (elevenlabs \| local), `prompt`, `duration_ms`, `success` |
| `sample_indexed` | `sample_id`, `tag_count` |
| `sample_loaded_daw` | `daw` (ableton \| fl \| protools), `success` |
| `retrieval_query` | `query_text`, `result_count`, `latency_ms` |

### 2. Ingestion options (pick one for the hackathon)

- **Batch:** Nightly or on-demand `COPY INTO` from **S3** / stage where the app drops JSON lines.
- **Streaming:** Snowpipe or **Kafka** → Snowflake (heavier setup).
- **Simplest demo:** Scheduled job or manual **INSERT** from backend for demo data + a few real events.

### 3. “Winning” demo queries

One or two SQL statements judges can see:

```sql
-- Example: generations vs loads in the last 24h
SELECT event_type, COUNT(*) 
FROM wonder_events 
WHERE ts > DATEADD(hour, -24, CURRENT_TIMESTAMP())
GROUP BY 1;
```

```sql
-- Example: ElevenLabs prompts that led to a successful DAW load
SELECT prompt, COUNT(*) 
FROM wonder_events 
WHERE event_type = 'sample_loaded_daw' AND source = 'elevenlabs'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

### 4. Environment / security

- Service user with least privilege; warehouse + database + schema for `WONDER_EVENTS`.
- Credentials via env vars (e.g. `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PRIVATE_KEY` or password) — never in git.

---

## Relationship to other pieces

- **MongoDB Atlas** holds **current** user + sample documents.
- **Snowflake** holds **historical** events for analytics; optional sync job or dual-write from API for demo volume.
- **ElevenLabs** — each generation can emit one `sample_generated` row for Snowflake and one doc in Atlas (different jobs, same user story).
