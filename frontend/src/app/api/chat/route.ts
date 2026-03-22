import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8001";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as {
    messages?: Message[];
    audioData?: string;
    mimeType?: string;
    midiContext?: Record<string, unknown>;
    rhythmContext?: Record<string, unknown>;
  };

  const { messages, audioData, mimeType, midiContext, rhythmContext } = body;

  // Get or create session ID via header
  let sessionId = request.headers.get("x-wonder-session-id");
  if (!sessionId) {
    try {
      const sessionRes = await fetch(`${AGENT_API_URL}/session/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "default_user" }),
      });
      const sessionData = await sessionRes.json() as { session_id?: string };
      sessionId = sessionData.session_id ?? null;
    } catch {
      sessionId = null;
    }
  }

  // Extract the last user message
  const lastMessage = messages?.findLast((m) => m.role === "user");
  const messageText = lastMessage?.content ?? "";

  // Forward to Python ADK server
  let agentRes: Response;
  try {
    agentRes = await fetch(`${AGENT_API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    return NextResponse.json(
      { content: `Could not reach agent server at ${AGENT_API_URL}: ${err}` },
      { status: 503 }
    );
  }

  if (!agentRes.ok) {
    const errorText = await agentRes.text();
    return NextResponse.json(
      { content: `Agent error ${agentRes.status}: ${errorText}` },
      { status: agentRes.status }
    );
  }

  const data = await agentRes.json() as { content?: string };
  const response = NextResponse.json({ content: data.content ?? "" });

  if (sessionId) {
    response.headers.set("x-wonder-session-id", sessionId);
  }
  return response;
}
