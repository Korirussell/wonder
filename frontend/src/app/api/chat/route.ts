import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";
import { buildSystemPromptWithKnowledge } from "@/lib/wonderKnowledge";
import {
  createInitialState,
  updateStateAfterToolCall,
  serializeState,
  type SessionState,
} from "@/lib/sessionState";
import { validateBeforeExecution } from "@/lib/musicValidator";

/**
 * Map Gemini tool names to the Ableton Remote Script command names.
 * Most are 1:1, but load_instrument_or_effect and load_drum_kit differ.
 */
const TOOL_TO_COMMAND: Record<string, string> = {
  load_instrument_or_effect: "load_browser_item",
};

/**
 * Translate tool args to the format the Remote Script expects.
 * e.g. load_instrument_or_effect uses {uri} but Remote Script expects {item_uri}.
 */
function translateArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  if (toolName === "load_instrument_or_effect") {
    return { track_index: args.track_index, item_uri: args.uri };
  }
  return args;
}

/**
 * Execute load_drum_kit as a multi-step composite (matches kori-mcp logic).
 */
async function executeLoadDrumKit(args: Record<string, unknown>): Promise<unknown> {
  const trackIndex = args.track_index as number;
  const rackUri = args.rack_uri as string;
  const kitPath = args.kit_path as string;

  // Step 1: Load the drum rack
  const rackResult = await sendAbletonCommand("load_browser_item", {
    track_index: trackIndex,
    item_uri: rackUri,
  }) as Record<string, unknown>;

  if (!rackResult?.loaded) {
    throw new Error(`Failed to load drum rack with URI '${rackUri}'`);
  }

  // Step 2: Browse for the kit
  const kitResult = await sendAbletonCommand("get_browser_items_at_path", {
    path: kitPath,
  }) as Record<string, unknown>;

  if (kitResult?.error) {
    return { message: `Loaded drum rack but failed to find drum kit: ${kitResult.error}` };
  }

  // Step 3: Find a loadable kit
  const kitItems = (kitResult?.items as Array<Record<string, unknown>>) ?? [];
  const loadable = kitItems.filter((item) => item.is_loadable);
  if (loadable.length === 0) {
    return { message: `Loaded drum rack but no loadable kits found at '${kitPath}'` };
  }

  // Step 4: Load the first kit
  await sendAbletonCommand("load_browser_item", {
    track_index: trackIndex,
    item_uri: loadable[0].uri,
  });

  return { message: `Loaded drum rack and kit '${loadable[0].name}' on track ${trackIndex}` };
}

const WONDER_SYSTEM_PROMPT = `You are Wonder — an AI music production copilot embedded in Ableton Live.
You are "Cursor for music production."

You have DIRECT CONTROL over Ableton Live. When a user asks you to make music, DO IT — call the tools immediately. Never say you "can't" do something without trying the tools first.

## Core rules
- Always call get_session_info first to understand the current state before creating tracks
- ALWAYS call create_clip BEFORE add_notes_to_clip — the clip must exist first
- ALWAYS load an instrument via load_instrument_or_effect BEFORE adding MIDI notes — otherwise there's no sound
- To discover instruments, use get_browser_tree then get_browser_items_at_path to find URIs, then load_instrument_or_effect
- For drum kits, use load_drum_kit with the rack URI and kit path
- If a tool returns an error, read the error and retry with corrected parameters — never give up after one failure
- Be concise and direct — you're a producer, not a chatbot

## Workflow: Making a beat from scratch
1. get_session_info → know the current state
2. set_tempo → set the BPM
3. create_midi_track → make tracks for drums, bass, chords, melody
4. set_track_name → label each track
5. get_browser_tree / get_browser_items_at_path → find instruments
6. load_instrument_or_effect or load_drum_kit → load instruments on tracks
7. create_clip → create clips on each track
8. add_notes_to_clip → write MIDI patterns
9. fire_clip or start_playback → play it back

## MIDI note format for add_notes_to_clip
Notes MUST be objects:
  [{"pitch":36,"start_time":0.0,"duration":0.5,"velocity":110,"mute":false}, ...]
  - pitch: integer 0-127
  - start_time: float beats (0.0 = beat 1, 1.0 = beat 2)
  - duration: float beats (0.25=16th, 0.5=8th, 1.0=quarter)
  - velocity: integer 1-127
  - mute: false

## Drum MIDI (General MIDI)
Kick:36, Snare:38, HH closed:42, HH open:46, Clap:39, Crash:49, Ride:51

## Scales (intervals from root)
Minor: 0,2,3,5,7,8,10 | Pentatonic minor: 0,3,5,7,10 | Major: 0,2,4,5,7,9,11

## Style knowledge
- **Trap**: 130-145 BPM, minor scale, 808 kick (pitch 36), snare on 3, hi-hat rolls (16th/32nd), dark arpeggios
- **Lo-fi**: 75-95 BPM, jazz chords, vinyl-warm pads, swung 16ths, subtle key: C/F/Bb minor
- **Hans Zimmer / Cinematic**: 60-100 BPM, slow build, thick strings + brass, epic hits on beat 1, minor/phrygian
- **House**: 120-130 BPM, 4-on-the-floor kick (36 at 0,1,2,3), offbeat hi-hats (42 at 0.5,1.5,2.5,3.5), bass stabs
- **Boom-bap**: 85-95 BPM, strong kick/snare, jazz samples, swing 60-70%
- **Drill**: 140-150 BPM, sliding 808 bass, fast trap hi-hats, minimal chords

## Deleting
- To delete a track: call delete_track with track_index
- To clear a clip: call delete_clip with track_index and clip_index

## Finding instruments
- To find a specific preset: call search_browser with the name, then use the returned URI in load_instrument_or_effect
- Example: search_browser("Wavetable") → get URI → load_instrument_or_effect(track_index, uri)`;

const MAX_TOOL_ROUNDS = 30;

/**
 * Normalize notes Gemini sends into object format the Remote Script expects.
 */
function normalizeNotes(notes: unknown): Array<Record<string, unknown>> {
  let rawNotes: unknown = notes;

  if (rawNotes && typeof rawNotes === "object" && !Array.isArray(rawNotes)) {
    const container = rawNotes as { notes?: unknown; result?: { notes?: unknown } };
    if (Array.isArray(container.notes)) {
      rawNotes = container.notes;
    } else if (container.result && Array.isArray(container.result.notes)) {
      rawNotes = container.result.notes;
    }
  }

  if (!Array.isArray(rawNotes)) return [];

  return rawNotes.map((n) => {
    if (Array.isArray(n)) {
      return {
        pitch: Number(n[0] ?? 60),
        start_time: Number(n[1] ?? 0),
        duration: Number(n[2] ?? 0.25),
        velocity: Number(n[3] ?? 100),
        mute: Boolean(n[4] ?? false),
      };
    }
    if (typeof n === "object" && n !== null) {
      const o = n as Record<string, unknown>;
      return {
        pitch: Number(o.pitch ?? o.note ?? 60),
        start_time: Number(o.start_time ?? o.start ?? 0),
        duration: Number(o.duration ?? 0.25),
        velocity: Number(o.velocity ?? 100),
        mute: Boolean(o.mute ?? false),
      };
    }

    return {
      pitch: 60,
      start_time: 0,
      duration: 0.25,
      velocity: 100,
      mute: false,
    };
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ content: "GEMINI_API_KEY not set in .env.local" }, { status: 500 });
  }

  try {
    const { messages } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    const genAI = new GoogleGenerativeAI(apiKey);
    const enhancedPrompt = buildSystemPromptWithKnowledge(WONDER_SYSTEM_PROMPT);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: enhancedPrompt,
      tools: [{ functionDeclarations: WONDER_TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    });

    // Initialize session state tracker
    let sessionState: SessionState = createInitialState();

    // Gemini requires history to start with role "user" — strip any leading
    // assistant messages (e.g. the initial greeting injected by the frontend).
    const rawHistory: Content[] = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const firstUserIdx = rawHistory.findIndex((m) => m.role === "user");
    const history: Content[] = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];

    const lastMessage = messages[messages.length - 1];

    // Only inject session state if there's existing history
    let historyWithState: Content[] = history;

    if (history.length > 0) {
      historyWithState = [
        ...history,
        {
          role: "user",
          parts: [{
            text: `Current session state:\n\`\`\`json\n${serializeState(sessionState)}\n\`\`\`\n\nRemember to update this state after every tool call.`
          }]
        },
        {
          role: "model",
          parts: [{ text: "Understood. I will maintain and update the session state throughout our conversation." }]
        }
      ];
    }

    const chat = model.startChat({ history: historyWithState });

    // ── Agentic loop ──────────────────────────────────────────────────────────
    let response;

    console.log(`[Wonder] Sending message: "${lastMessage.content.slice(0, 100)}..."`);
    response = await chat.sendMessage(lastMessage.content);
    console.log(`[Wonder] Response candidates:`, response.response.candidates?.length || 0);

    let toolRounds = 0;

    while (toolRounds < MAX_TOOL_ROUNDS) {
      const candidate = response.response.candidates?.[0];
      if (!candidate) {
        console.log("[Wonder] No candidate in response - stopping tool loop");
        break;
      }

      // Check if candidate has content and parts
      if (!candidate.content || !candidate.content.parts) {
        console.error("[Wonder] No content.parts in candidate");
        try {
          const finalText = response.response.text();
          return NextResponse.json({ content: finalText });
        } catch (textErr) {
          console.error("[Wonder] Failed to get text from response:", textErr);
          return NextResponse.json({
            content: "I encountered an error processing your request. Please try again with a simpler prompt like 'make a lofi beat'."
          }, { status: 500 });
        }
      }

      const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
      if (functionCalls.length === 0) {
        console.log(`[Wonder] No more function calls after ${toolRounds} rounds - Gemini finished`);
        break;
      }

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

          // Validate before execution
          const validation = validateBeforeExecution(call.name, args, sessionState);

          if (!validation.valid) {
            console.error(`[Wonder] ✗ Validation failed for ${call.name}:`, validation.errors);
            return {
              functionResponse: {
                name: call.name,
                response: {
                  error: `Validation failed: ${validation.errors.join(", ")}`,
                  warnings: validation.warnings,
                  hint: "Fix the validation errors before retrying.",
                },
              },
            };
          }

          if (validation.warnings.length > 0) {
            console.warn(`[Wonder] ⚠ Warnings for ${call.name}:`, validation.warnings);
          }

          try {
            let result: unknown;

            if (call.name === "load_drum_kit") {
              // Composite command — multi-step execution
              result = await executeLoadDrumKit(args);
            } else {
              // Translate tool name → Ableton command name and args
              const cmdName = TOOL_TO_COMMAND[call.name] ?? call.name;
              const cmdArgs = translateArgs(call.name, args);
              result = await sendAbletonCommand(cmdName, cmdArgs);
            }

            console.log(`[Wonder] ✓ ${call.name}:`, JSON.stringify(result).slice(0, 100));

            // Update session state after successful execution
            sessionState = updateStateAfterToolCall(sessionState, call.name, args, result);

            return {
              functionResponse: {
                name: call.name,
                response: {
                  result,
                  session_state: sessionState,
                  warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
                },
              },
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Wonder] ✗ ${call.name}: ${msg}`);
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

    // Extract final text response
    let finalText = "";
    try {
      finalText = response.response.text();
      console.log(`[Wonder] Final response length: ${finalText.length} chars`);
    } catch (textErr) {
      console.error("[Wonder] Failed to extract text from response:", textErr);
      console.error("[Wonder] Response object:", JSON.stringify(response.response, null, 2));
      
      // Try to get any text from parts
      const candidate = response.response.candidates?.[0];
      if (candidate?.content?.parts) {
        const textParts = candidate.content.parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("");
        if (textParts) {
          finalText = textParts;
          console.log(`[Wonder] Recovered text from parts: ${textParts.length} chars`);
        }
      }
      
      if (!finalText) {
        return NextResponse.json({ 
          content: "I completed the actions but encountered an error generating a response. Please check Ableton to see the changes." 
        });
      }
    }

    if (!finalText || finalText.trim().length === 0) {
      console.warn("[Wonder] Empty response text after tool execution");
      return NextResponse.json({ 
        content: "I completed the requested actions in Ableton. Please check your session." 
      });
    }

    return NextResponse.json({ content: finalText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wonder chat error:", message);
    console.error("Wonder chat error stack:", err instanceof Error ? err.stack : "No stack trace");
    
    // Handle rate limit specifically
    if (message.includes("429") || message.includes("quota") || message.includes("exceeded")) {
      return NextResponse.json({ 
        content: "⚠️ Rate limit exceeded. Free tier allows 20 requests per day. Upgrade at https://ai.google.dev/pricing for unlimited usage, or wait for the daily reset." 
      }, { status: 429 });
    }
    
    return NextResponse.json({ content: `Error: ${message}` }, { status: 500 });
  }
}

/** Give Gemini a specific hint so it can self-correct on common errors */
function getHint(toolName: string, error: string): string {
  if (toolName === "add_notes_to_clip") {
    if (error.includes("No clip")) return "You must call create_clip first, then add_notes_to_clip.";
    if (error.includes("index") || error.includes("range")) return "Check track_index and clip_index — call get_session_info to verify track count.";
    return "Ensure notes is an array of objects with pitch/start_time/duration/velocity/mute and the clip was created first with create_clip.";
  }
  if (toolName === "create_midi_track") {
    return "Call get_session_info first and use track_count as the index, or pass -1 to append.";
  }
  if (toolName === "load_instrument_or_effect") {
    return "Use search_browser to find the instrument by name and get its URI, then pass uri to this tool.";
  }
  if (toolName === "delete_track") {
    return "Call get_session_info first to verify the track index, then call delete_track.";
  }
  if (toolName === "delete_clip") {
    return "Verify track_index and clip_index via get_session_info before deleting.";
  }
  if (toolName === "search_browser") {
    return "Provide a simpler query string (e.g. 'Wavetable' instead of a full path). Optionally specify category.";
  }
  return "Read the error and retry with corrected parameters.";
}
