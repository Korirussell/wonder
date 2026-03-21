import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";

const WONDER_SYSTEM_PROMPT = `You are Wonder — an AI music production copilot embedded in Ableton Live.
You are "Cursor for music production."

You have direct access to Ableton Live through a set of tools. When a user asks you to make music, CREATE IT — don't just describe it. Call the tools immediately.

Core rules:
- When asked to "make a beat", "create a track", "build a session" etc → call create_wonder_session right away
- Always call get_session_info first if you need the current track count before creating tracks
- When creating tracks manually (not via create_wonder_session), get track_count from get_session_info and use it as the index
- After creating something, briefly confirm what you built and what the user can do next
- Be concise, musical, and direct — you're a producer collaborator, not a chatbot
- Use the user's preferred genres/artists/plugins from their .wonderprofile when making creative decisions
- Pre-humanize all MIDI note data: vary velocities by ±10-15, add subtle timing variation

Drum MIDI note mapping (General MIDI):
- Kick: 36, Snare: 38, Hi-hat closed: 42, Hi-hat open: 46
- Clap: 39, Crash: 49, Ride: 51, Tom high: 50, Tom low: 45

Common scales (root = MIDI pitch of tonic, add these intervals):
- Minor: 0,2,3,5,7,8,10
- Pentatonic minor: 0,3,5,7,10
- Major: 0,2,4,5,7,9,11`;

const MAX_TOOL_ROUNDS = 8; // prevent infinite loops

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { content: "GEMINI_API_KEY not set — add it to the Wonder repo root `.env` (see `.env.example`)" },
      { status: 500 }
    );
  }

  try {
    const { messages } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: WONDER_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: WONDER_TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    });

    // Convert prior messages to Gemini history format (all except the last)
    const history: Content[] = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });

    // ── Agentic loop ──────────────────────────────────────────────────────────
    let response = await chat.sendMessage(lastMessage.content);
    let toolRounds = 0;

    while (toolRounds < MAX_TOOL_ROUNDS) {
      const candidate = response.response.candidates?.[0];
      if (!candidate) break;

      // Collect all function calls in this response
      const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
      if (functionCalls.length === 0) break;

      toolRounds++;

      // Execute all tool calls and collect results
      const toolResults = await Promise.all(
        functionCalls.map(async (part) => {
          const call = part.functionCall!;
          console.log(`[Wonder] Calling Ableton: ${call.name}`, call.args);

          try {
            const result = await sendAbletonCommand(
              call.name,
              (call.args as Record<string, unknown>) ?? {}
            );
            console.log(`[Wonder] Result for ${call.name}:`, result);
            return {
              functionResponse: {
                name: call.name,
                response: { result },
              },
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Wonder] Ableton error on ${call.name}:`, msg);
            return {
              functionResponse: {
                name: call.name,
                response: { error: msg },
              },
            };
          }
        })
      );

      // Feed all results back to Gemini in one shot
      response = await chat.sendMessage(toolResults);
    }

    const finalText = response.response.text();
    return NextResponse.json({ content: finalText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wonder chat error:", message);
    return NextResponse.json({ content: `Error: ${message}` }, { status: 500 });
  }
}
