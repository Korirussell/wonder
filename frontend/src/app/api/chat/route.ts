import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { generateSoundEffect, textToSpeech } from "@/lib/elevenlabs";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";
import {
  createInitialState,
  serializeState,
  updateStateAfterToolCall,
  type SessionState,
} from "@/lib/sessionState";
import { validateBeforeExecution } from "@/lib/musicValidator";


const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const MAX_TOOL_ROUNDS = 10;

interface NotesSummary {
  note_count: number;
  pitch_range?: [string, string];
  duration_beats?: number;
  first_notes?: string[];
}

interface MidiContext {
  midi_id: string;
  midi_path: string;
  note_count: number;
  notes_summary: NotesSummary;
  suggested_clip_length: number;
  tempo_bpm: number;
}

interface RhythmContext {
  capture_ms: number;
  reference_bpm: number;
  timing_confidence: number;
  quantization_hint: "light" | "medium" | "strong";
  note_starts_beats: number[];
  note_durations_beats: number[];
  output_mode: "new_track";
}

type ToolDispatch = {
  requestedToolName: string;
  executedToolName: string;
  executedArgs: Record<string, unknown>;
};

const WONDER_SYSTEM_PROMPT = `You are Wonder, an AI music producer operating directly inside Ableton Live.

You do the work with tool calls. Keep your final response brief.

Rules:
- Call \
\`get_session_info\` before building unless you already have fresh session context.
- If the user asks for a beat, groove, melody, or sound, finish the sequence: create track, load instrument, create clip, add notes.
- Prefer \
\`load_instrument_by_name\` for built-in Ableton devices like Drum Rack, Wavetable, Operator, Analog, Drift, Simpler, Electric, Tension, and Meld.
- Use \
\`load_drum_kit\` only when you specifically need a browser drum kit preset.
- After any instrument load, verify with \
\`get_track_info\` if needed and make sure the track has devices before moving on.
- For MIDI, always vary velocity and use sensible note lengths.
- On tool errors, read the message, correct parameters, and retry. Do not stop halfway through a musical task.

Preferred creation sequence:
1. \
\`get_session_info\`
2. \
\`create_midi_track\`
3. \
\`set_track_name\`
4. \
\`load_instrument_by_name\` or \
\`load_instrument_or_effect\`
5. \
\`create_clip\`
6. \
\`add_notes_to_clip\`

Use \
\`load_midi_notes\` when a midi_id is available.`;

async function callPythonApi(endpoint: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw new Error(`Python API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function buildMidiContext(ctx: MidiContext): string {
  const pitchRange = ctx.notes_summary.pitch_range
    ? `${ctx.notes_summary.pitch_range[0]} to ${ctx.notes_summary.pitch_range[1]}`
    : "unknown";

  return `\nUSER MIDI CONTEXT: midi_id=${ctx.midi_id}, notes=${ctx.note_count}, range=${pitchRange}, clip_length=${ctx.suggested_clip_length}, tempo=${ctx.tempo_bpm}. Call load_midi_notes if you need the full notes array.`;
}

function buildRhythmContext(ctx: RhythmContext): string {
  const starts = ctx.note_starts_beats.slice(0, 32).map((value) => Number(value.toFixed(4)));
  const durations = ctx.note_durations_beats.slice(0, 32).map((value) => Number(value.toFixed(4)));

  return `\nUSER RHYTHM CONTEXT: count=${Math.min(ctx.note_starts_beats.length, ctx.note_durations_beats.length)}, bpm_ref=${ctx.reference_bpm}, quantization=${ctx.quantization_hint}, starts=[${starts.join(", ")}], durations=[${durations.join(", ")}]. Use this as the timing skeleton.`;
}

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

  return rawNotes.map((note) => {
    if (Array.isArray(note)) {
      return {
        pitch: Number(note[0] ?? 60),
        start_time: Number(note[1] ?? 0),
        duration: Number(note[2] ?? 0.25),
        velocity: Number(note[3] ?? 100),
        mute: Boolean(note[4] ?? false),
      };
    }

    if (typeof note === "object" && note !== null) {
      const value = note as Record<string, unknown>;
      return {
        pitch: Number(value.pitch ?? value.note ?? 60),
        start_time: Number(value.start_time ?? value.start ?? 0),
        duration: Number(value.duration ?? 0.25),
        velocity: Number(value.velocity ?? 100),
        mute: Boolean(value.mute ?? false),
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

function toClaudeTools(): Anthropic.Tool[] {
  return WONDER_TOOL_DECLARATIONS.map((decl) => {
    const convertSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema)) {
        if (key === "type" && typeof value === "string") {
          out[key] = value.toLowerCase();
        } else if (key === "properties" && typeof value === "object" && value !== null) {
          const properties: Record<string, unknown> = {};
          for (const [propertyKey, propertyValue] of Object.entries(value as Record<string, unknown>)) {
            properties[propertyKey] = convertSchema(propertyValue as Record<string, unknown>);
          }
          out[key] = properties;
        } else {
          out[key] = value;
        }
      }
      return out;
    };

    const params = decl.parameters as Record<string, unknown> | undefined;
    return {
      name: decl.name,
      description: decl.description ?? "",
      input_schema: params
        ? (convertSchema(params) as Anthropic.Tool["input_schema"])
        : { type: "object", properties: {} },
    };
  });
}

function resolveAbletonToolDispatch(
  toolName: string,
  args: Record<string, unknown>
): ToolDispatch {
  if (toolName === "load_instrument_or_effect") {
    const uri = args.uri;
    if (typeof uri !== "string" || uri.length === 0) {
      throw new Error("load_instrument_or_effect requires a valid uri");
    }

    return {
      requestedToolName: toolName,
      executedToolName: "load_browser_item",
      executedArgs: {
        track_index: args.track_index,
        item_uri: uri,
      },
    };
  }

  return {
    requestedToolName: toolName,
    executedToolName: toolName,
    executedArgs: args,
  };
}

async function executeAbletonTool(dispatch: ToolDispatch): Promise<unknown> {
  const sendWithLoadTimeout = (commandType: string, params: Record<string, unknown>) =>
    sendAbletonCommand(commandType, params, { timeoutMs: 15000 });

  if (dispatch.requestedToolName === "load_drum_kit") {
    const trackIndex = dispatch.executedArgs.track_index;
    const rackUri = dispatch.executedArgs.rack_uri;
    const kitPath = dispatch.executedArgs.kit_path;

    if (typeof rackUri !== "string" || rackUri.length === 0) {
      throw new Error("load_drum_kit requires a valid rack_uri");
    }
    if (typeof kitPath !== "string" || kitPath.length === 0) {
      throw new Error("load_drum_kit requires a valid kit_path");
    }

    const rackResult = await sendWithLoadTimeout("load_browser_item", {
      track_index: trackIndex,
      item_uri: rackUri,
    }) as Record<string, unknown>;

    if (!rackResult.loaded) {
      throw new Error(`Failed to load drum rack with URI '${rackUri}'`);
    }

    const kitResult = await sendAbletonCommand("get_browser_items_at_path", { path: kitPath }) as {
      items?: Array<Record<string, unknown>>;
      error?: string;
      is_loadable?: boolean;
      uri?: string;
      name?: string;
    };

    let loadableKit: Record<string, unknown> | undefined;
    if (kitResult.is_loadable && typeof kitResult.uri === "string") {
      loadableKit = { name: kitResult.name, uri: kitResult.uri };
    } else {
      loadableKit = kitResult.items?.find((item) => item.is_loadable && typeof item.uri === "string");
    }

    if (!loadableKit) {
      const fallbackQuery = kitPath.split("/").pop()?.replace(/\.adg$/i, "")?.trim();
      if (fallbackQuery) {
        const searchResult = await sendAbletonCommand("search_browser", {
          query: fallbackQuery,
          category: "drums",
        }) as { items?: Array<Record<string, unknown>> };
        loadableKit = searchResult.items?.find((item) => item.is_loadable && typeof item.uri === "string");
      }
    }

    if (!loadableKit || typeof loadableKit.uri !== "string") {
      const detail = kitResult.error
        ? `failed to find drum kit: ${kitResult.error}`
        : `no loadable drum kits found at '${kitPath}'`;
      throw new Error(`Loaded drum rack but ${detail}`);
    }

    const loadResult = await sendWithLoadTimeout("load_browser_item", {
      track_index: trackIndex,
      item_uri: loadableKit.uri,
    }) as Record<string, unknown>;

    return {
      ...loadResult,
      rack_loaded: true,
      kit_name: loadableKit.name,
      kit_uri: loadableKit.uri,
      kit_path: kitPath,
    };
  }

  if (dispatch.executedToolName === "load_browser_item" || dispatch.executedToolName === "load_instrument_by_name") {
    return sendWithLoadTimeout(dispatch.executedToolName, dispatch.executedArgs);
  }

  return sendAbletonCommand(dispatch.executedToolName, dispatch.executedArgs);
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sessionState: SessionState
): Promise<{ result?: unknown; error?: string; sessionState: SessionState }> {
  if (name === "add_notes_to_clip" && args.notes) {
    args.notes = normalizeNotes(args.notes);
  }

  if (name === "add_notes_to_clip" && !args.notes && typeof args.midi_id === "string") {
    const loaded = await callPythonApi("/api/load_midi_notes", { midi_id: args.midi_id });
    if (loaded && typeof loaded === "object" && Array.isArray((loaded as { notes?: unknown[] }).notes)) {
      args.notes = normalizeNotes((loaded as { notes: unknown[] }).notes);
    }
  }

  console.log(`[Wonder] → ${name}`, JSON.stringify(args).slice(0, 200));

  const validation = validateBeforeExecution(name, args, sessionState);
  if (!validation.valid) {
    console.error(`[Wonder] ✗ Validation failed for ${name}:`, validation.errors);
    return {
      error: `Validation failed: ${validation.errors.join(", ")}`,
      sessionState,
    };
  }

  if (validation.warnings.length > 0) {
    console.warn(`[Wonder] ⚠ Warnings for ${name}:`, validation.warnings);
  }

  try {
    let result: unknown;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

    if (name === "load_midi_notes") {
      result = await callPythonApi("/api/load_midi_notes", args);
    } else if (name === "generate_sound_effect") {
      if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set");
      result = await generateSoundEffect(args.description as string, (args.duration_seconds as number | undefined) ?? 2.0, elevenLabsKey);
    } else if (name === "text_to_speech") {
      if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set");
      result = await textToSpeech(args.text as string, elevenLabsKey, args.voice_id as string | undefined);
    } else {
      const dispatch = resolveAbletonToolDispatch(name, args);
      console.log(
        `[Wonder] ↳ dispatch ${dispatch.requestedToolName} -> ${dispatch.executedToolName}`,
        JSON.stringify(dispatch.executedArgs).slice(0, 200)
      );
      result = await executeAbletonTool(dispatch);
    }

    console.log(`[Wonder] ✓ ${name}:`, JSON.stringify(result).slice(0, 100));
    const newState = updateStateAfterToolCall(sessionState, name, args, result);
    console.log(`[Wonder] 📊 Session state updated:`, serializeState(newState).slice(0, 200));
    return { result, sessionState: newState };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Wonder] ✗ ${name}: ${message}`, JSON.stringify({ args, session: serializeState(sessionState) }).slice(0, 400));
    return { error: message, sessionState };
  }
}

async function runClaudeLoop(
  anthropic: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string
): Promise<string> {
  let sessionState = createInitialState();
  const claudeTools = toClaudeTools();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      tools: claudeTools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock ? (textBlock as Anthropic.TextBlock).text : "";
    }

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock ? (textBlock as Anthropic.TextBlock).text : "";
    }

    const toolUseBlocks = response.content.filter((block) => block.type === "tool_use") as Anthropic.ToolUseBlock[];
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const args = (block.input as Record<string, unknown>) ?? {};
        const { result, error, sessionState: newState } = await executeTool(block.name, args, sessionState);
        sessionState = newState;
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(error ? { error, hint: getHint(block.name, error) } : { result }),
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return "Done.";
}

async function runGeminiLoop(
  genAI: GoogleGenerativeAI,
  history: Content[],
  lastMessage: string,
  systemPrompt: string,
  audioData?: string,
  mimeType?: string
): Promise<string> {
  let sessionState = createInitialState();

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: WONDER_TOOL_DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    generationConfig: {
      // @ts-expect-error Gemini SDK exposes thinkingConfig before typings catch up.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const chat = model.startChat({ history });
  let response;

  if (audioData && mimeType) {
    response = await chat.sendMessage([
      { inlineData: { data: audioData, mimeType } },
      { text: "Listen to this audio and use tools to create or update the Ableton session." },
    ]);
  } else {
    response = await chat.sendMessage(lastMessage);
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const candidate = response.response.candidates?.[0];
    if (!candidate?.content?.parts) break;

    const functionCalls = candidate.content.parts.filter((part) => part.functionCall);
    if (functionCalls.length === 0) break;

    const toolResults = await Promise.all(
      functionCalls.map(async (part) => {
        const call = part.functionCall!;
        const args = (call.args as Record<string, unknown>) ?? {};
        const { result, error, sessionState: newState } = await executeTool(call.name, args, sessionState);
        sessionState = newState;
        return {
          functionResponse: {
            name: call.name,
            response: error ? { error, hint: getHint(call.name, error) } : { result },
          },
        };
      })
    );

    response = await chat.sendMessage(toolResults);
  }

  return response.response.text();
}

export async function POST(req: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    return NextResponse.json(
      { content: "No AI API key set — add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env" },
      { status: 500 }
    );
  }

  try {
    const { messages, audioData, mimeType, midiContext, rhythmContext, session_id, user_id } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      audioData?: string;
      mimeType?: string;
      midiContext?: MidiContext;
      rhythmContext?: RhythmContext;
      session_id?: string;
      user_id?: string;
    };

    let systemPrompt = WONDER_SYSTEM_PROMPT;
    if (midiContext && midiContext.note_count > 0) systemPrompt += buildMidiContext(midiContext);
    if (rhythmContext?.note_starts_beats.length) systemPrompt += buildRhythmContext(rhythmContext);

    const lastMessage = messages[messages.length - 1];
    let finalText: string;

    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const claudeMessages: Anthropic.MessageParam[] = messages.slice(0, -1).map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

      while (claudeMessages.length > 0 && claudeMessages[0].role === "assistant") {
        claudeMessages.shift();
      }

      claudeMessages.push({ role: "user", content: lastMessage.content });
      finalText = await runClaudeLoop(anthropic, claudeMessages, systemPrompt);
    } else {
      const genAI = new GoogleGenerativeAI(geminiKey!);
      const rawHistory: Content[] = messages.slice(0, -1).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
      const firstUserIdx = rawHistory.findIndex((message) => message.role === "user");
      const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];
      finalText = await runGeminiLoop(genAI, history, lastMessage.content, systemPrompt, audioData, mimeType);
    }

    if (session_id && user_id) {
      fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id,
          user_id,
          messages,
          response: finalText,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ content: finalText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wonder chat error:", message);
    return NextResponse.json({ content: `Error: ${message}` }, { status: 500 });
  }
}

function getHint(toolName: string, error: string): string {
  if (toolName === "add_notes_to_clip") {
    if (error.includes("No clip")) return "You must call create_clip first, then add_notes_to_clip.";
    if (error.includes("index") || error.includes("range")) return "Check track_index and clip_index — call get_session_info to verify track count.";
    return "Ensure notes is an array of objects with pitch/start_time/duration/velocity/mute and create the clip first.";
  }
  if (toolName === "create_midi_track") {
    return "Call get_session_info first and use track_count as the index.";
  }
  if (toolName === "load_instrument_by_name") {
    return "Use an exact built-in Ableton device name like Drum Rack, Wavetable, Operator, Analog, Drift, Simpler, Electric, Tension, or Meld.";
  }
  if (toolName === "load_browser_item") {
    return "Get the URI first via get_browser_items_at_path, then pass it as item_uri.";
  }
  if (toolName === "load_instrument_or_effect") {
    return "Use load_instrument_by_name for built-ins, or get a valid URI via search_browser/get_browser_items_at_path and retry.";
  }
  if (toolName === "load_drum_kit") {
    return "Load a Drum Rack first, then provide a valid drum preset path or a kit name that can be found in the browser.";
  }
  return "Read the error and retry with corrected parameters.";
}
