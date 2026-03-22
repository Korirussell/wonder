/**
 * /api/agent/chat — Proxy to Wonder Agent server's SSE streaming chat
 *
 * POST {
 *   session_id: string,
 *   user_id?: string,
 *   message: string,
 *   audio_data?: string,   // base64-encoded audio (webm/wav)
 *   mime_type?: string,    // default "audio/webm"
 *   midi_context?: object, // from /api/transcribe — { midi_id, note_count, tempo_bpm, ... }
 *   rhythm_context?: object // from tap capture — { reference_bpm, note_starts_beats, ... }
 * }
 *
 * → streams SSE from http://localhost:8001/chat/stream
 *   Each event is a JSON ADK RunEvent: { content?, error? }
 *   Text parts live in content.parts[].text
 *
 * The agent uses Google ADK with Gemini 2.5-flash and has tools for:
 *   - Ableton Live (MIDI, tracks, clips, effects)
 *   - Audio transcription (basic-pitch)
 *   - Sound generation (ElevenLabs)
 *   - Sample library (MongoDB)
 *   - Sub-agents: composition, sound_design, stem_separator
 */

import { NextRequest } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.session_id || typeof body.session_id !== "string") {
      return new Response(
        JSON.stringify({ error: "session_id is required — call POST /api/agent/session first" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const agentResp = await fetch(`${AGENT_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id:     body.session_id,
        user_id:        body.user_id        ?? "default_user",
        message:        body.message        ?? "",
        audio_data:     body.audio_data     ?? null,
        mime_type:      body.mime_type      ?? "audio/webm",
        midi_context:   body.midi_context   ?? null,
        rhythm_context: body.rhythm_context ?? null,
      }),
    });

    if (!agentResp.ok) {
      const err = await agentResp.text();
      return new Response(
        JSON.stringify({ error: `Agent error ${agentResp.status}: ${err}` }),
        { status: agentResp.status, headers: { "Content-Type": "application/json" } },
      );
    }

    // Pass the SSE stream through directly
    return new Response(agentResp.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[agent/chat] ${msg}`);
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    return new Response(
      JSON.stringify({
        error: isConnRefused
          ? "Agent server not running. Start it with: cd backend/agent && uv run wonder-agent"
          : msg,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}
