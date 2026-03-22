import { NextRequest } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8001";

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json() as {
    messages?: Array<{ role: string; content: string }>;
    audioData?: string;
    mimeType?: string;
    midiContext?: Record<string, unknown>;
    rhythmContext?: Record<string, unknown>;
    sessionId?: string | null;
  };

  const { messages, audioData, mimeType, midiContext, rhythmContext, sessionId: clientSessionId } = body;

  // Get or create session
  let sessionId = clientSessionId ?? request.headers.get("x-wonder-session-id");
  if (!sessionId) {
    try {
      const sessionRes = await fetch(`${AGENT_API_URL}/session/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "default_user" }),
      });
      const data = await sessionRes.json() as { session_id?: string };
      sessionId = data.session_id ?? null;
    } catch {
      sessionId = null;
    }
  }

  const lastMessage = messages?.findLast((m) => m.role === "user");
  const messageText = lastMessage?.content ?? "";

  let agentRes: Response;
  try {
    agentRes = await fetch(`${AGENT_API_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      cache: "no-store",
      body: JSON.stringify({
        session_id: sessionId ?? "default",
        user_id: "default_user",
        message: messageText,
        audio_data: audioData ?? null,
        mime_type: mimeType ?? "audio/webm",
        midi_context: midiContext ?? null,
        rhythm_context: rhythmContext ?? null,
      }),
    });
  } catch (err) {
    return new Response(
      `data: ${JSON.stringify({ error: `Could not reach agent: ${err}` })}\n\n`,
      { status: 503, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  if (!agentRes.ok) {
    const errorText = await agentRes.text();
    return new Response(
      `data: ${JSON.stringify({ error: `Agent error ${agentRes.status}: ${errorText}` })}\n\n`,
      { status: agentRes.status, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  return new Response(agentRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "x-wonder-session-id": sessionId ?? "",
    },
  });
}
