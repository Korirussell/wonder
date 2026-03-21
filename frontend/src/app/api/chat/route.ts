import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";

const WONDER_SYSTEM_PROMPT = `You are Wonder — an AI music production copilot embedded in Ableton Live.
You are "Cursor for music production."

You have DIRECT CONTROL over Ableton Live including all devices and VST plugins. When a user asks you to make music or design sounds, DO IT — call the tools immediately. Never say you "can't" do something without trying the tools first.

## Core rules
- When asked to "make a beat", "create a track", "build a session" → call create_wonder_session right away
- Always call get_session_info first to get current track count before creating tracks manually
- ALWAYS call create_clip BEFORE add_notes_to_clip — the clip must exist first
- If a tool returns an error, read the error and retry with corrected parameters — never give up after one failure
- Be concise and direct — you're a producer, not a chatbot

## VST / Device parameter control — YOU CAN DO THIS
You can read and set ANY parameter on ANY device including Serum, Massive, Vital, Wavetable, and all Ableton devices.

Workflow:
1. Call get_device_parameters(track_index, device_index=0) to see all available parameters with their names, indices, and current values
2. Call set_device_parameter(track_index, device_index, parameter_index, value) to change a parameter

Serum 808 design — after getting parameters, set approximately:
- Osc A waveform → Sine or custom (parameter named "Osc A Wt Pos" or similar)
- Amp Env Attack → 0.0 (instant attack)
- Amp Env Decay → 0.7-0.9 (long decay for 808 tail)
- Amp Env Sustain → 0.0 (no sustain — all in the decay)
- Amp Env Release → 0.3
- Filter Cutoff → 0.4-0.6 for that low-pass warmth
- Pitch/Tune → set for the desired root note
Always call get_device_parameters first to find the exact parameter indices for the loaded Serum patch.

## MIDI note format for add_notes_to_clip
Notes MUST be arrays of arrays:
  [[pitch, start_time, duration, velocity, mute], ...]
  Example: [[36, 0.0, 0.5, 110, false], [36, 1.0, 0.5, 105, false]]
  - pitch: integer 0-127
  - start_time: float beats (0.0 = beat 1, 1.0 = beat 2)
  - duration: float beats (0.25=16th, 0.5=8th, 1.0=quarter)
  - velocity: integer 1-127
  - mute: false

## Drum MIDI (General MIDI)
Kick:36, Snare:38, HH closed:42, HH open:46, Clap:39, Crash:49, Ride:51

## Scales (intervals from root)
Minor: 0,2,3,5,7,8,10 | Pentatonic minor: 0,3,5,7,10 | Major: 0,2,4,5,7,9,11`;

const MAX_TOOL_ROUNDS = 10;

/**
 * Normalize notes Gemini sends — it sometimes sends objects instead of arrays.
 * Ableton expects [[pitch, start, duration, velocity, mute], ...]
 */
function normalizeNotes(notes: unknown): unknown[][] {
  if (!Array.isArray(notes)) return [];
  return notes.map((n) => {
    if (Array.isArray(n)) return n;
    if (typeof n === "object" && n !== null) {
      const o = n as Record<string, unknown>;
      return [
        Number(o.pitch ?? o.note ?? 60),
        Number(o.start_time ?? o.start ?? 0),
        Number(o.duration ?? 0.25),
        Number(o.velocity ?? 100),
        Boolean(o.mute ?? false),
      ];
    }
    return n;
  });
}

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
      model: "gemini-2.5-flash",
      systemInstruction: WONDER_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: WONDER_TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    });

    // Gemini requires history to start with role "user" — strip any leading
    // assistant messages (e.g. the initial greeting injected by the frontend).
    const rawHistory: Content[] = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const firstUserIdx = rawHistory.findIndex((m) => m.role === "user");
    const history: Content[] = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });

    // ── Agentic loop ──────────────────────────────────────────────────────────
    let response = await chat.sendMessage(lastMessage.content);
    let toolRounds = 0;

    while (toolRounds < MAX_TOOL_ROUNDS) {
      const candidate = response.response.candidates?.[0];
      if (!candidate) break;

      const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
      if (functionCalls.length === 0) break;

      toolRounds++;

      const toolResults = await Promise.all(
        functionCalls.map(async (part) => {
          const call = part.functionCall!;
          const args = (call.args as Record<string, unknown>) ?? {};

          // Normalize notes format regardless of what Gemini sent
          if (call.name === "add_notes_to_clip" && args.notes) {
            args.notes = normalizeNotes(args.notes);
          }

          console.log(`[Wonder] → ${call.name}`, JSON.stringify(args).slice(0, 200));

          try {
            const result = await sendAbletonCommand(call.name, args);
            console.log(`[Wonder] ✓ ${call.name}:`, JSON.stringify(result).slice(0, 100));
            return {
              functionResponse: {
                name: call.name,
                response: { result },
              },
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Wonder] ✗ ${call.name}: ${msg}`);
            // Return the full error so Gemini can read it and adapt
            return {
              functionResponse: {
                name: call.name,
                response: {
                  error: msg,
                  hint: getHint(call.name, msg),
                },
              },
            };
          }
        })
      );

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

/** Give Gemini a specific hint so it can self-correct on common errors */
function getHint(toolName: string, error: string): string {
  if (toolName === "add_notes_to_clip") {
    if (error.includes("No clip")) return "You must call create_clip first, then add_notes_to_clip.";
    if (error.includes("index") || error.includes("range")) return "Check track_index and clip_index — call get_session_info to verify track count.";
    return "Ensure notes is an array of [pitch, start_time, duration, velocity, mute] arrays and the clip was created first with create_clip.";
  }
  if (toolName === "create_midi_track" || toolName === "create_audio_track") {
    return "Call get_session_info first and use track_count as the index.";
  }
  if (toolName === "load_browser_item") {
    return "Get the URI first via get_browser_items_at_path, then pass it as item_uri.";
  }
  return "Read the error and retry with corrected parameters.";
}
