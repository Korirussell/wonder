import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { generateSoundEffect, textToSpeech } from "@/lib/elevenlabs";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";
import { getMCPToolsForClaude, callMCPTool, resetMCPClient } from "@/lib/mcpClient";
import {
  createInitialState,
  updateStateAfterToolCall,
  type SessionState,
} from "@/lib/sessionState";
import { validateBeforeExecution } from "@/lib/musicValidator";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

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

async function callPythonApi(endpoint: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${PYTHON_API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Python API error: ${res.status} ${res.statusText}`);
  return res.json();
}

function buildMidiContext(ctx: MidiContext): string {
  const pitchRange = ctx.notes_summary.pitch_range
    ? `${ctx.notes_summary.pitch_range[0]} to ${ctx.notes_summary.pitch_range[1]}`
    : "unknown";
  return `\nUSER'S HUMMED MELODY (midi_id: ${ctx.midi_id}): ${ctx.note_count} notes, range ${pitchRange}, ${ctx.notes_summary.duration_beats?.toFixed(1)} beats. Call load_midi_notes("${ctx.midi_id}") to get notes array.`;
}

function buildRhythmContext(ctx: RhythmContext): string {
  return `\nUSER RHYTHM (${ctx.note_starts_beats.length} notes, ${ctx.reference_bpm} BPM ref, quantization: ${ctx.quantization_hint}). Beat starts: [${ctx.note_starts_beats.slice(0, 32).map(v => v.toFixed(3)).join(", ")}]`;
}

const WONDER_SYSTEM_PROMPT = `You are Wonder — an AI music producer inside Ableton Live. You build music via tool calls. No lengthy descriptions, only action.

## Rules
- Call get_session_info first before creating anything — check what tracks exist.
- Always vary MIDI velocity (never flat). Compose in a defined key. MIDI values 0-127.
- Keep responses brief — 1-2 sentences after executing.
- On errors: read the message, fix params, retry once. Don't start over.

## Instrument Loading — CRITICAL
Use load_instrument_by_name ONLY. Never call get_browser_items_at_path or search_browser (they crash).
Valid names: "Wavetable", "Operator", "Analog", "Drift", "Simpler", "Drum Rack", "Electric", "Tension"

## Track Creation Sequence
1. create_midi_track (index: -1)
2. set_track_name
3. load_instrument_by_name (track_index, name)
4. create_clip (track_index, clip_index=0, length in beats)
5. add_notes_to_clip (track_index, clip_index, notes[])

## Note Format
{ pitch: 0-127, start_time: float_beats, duration: float_beats, velocity: 0-127, mute: false }
Middle C = 60. Humanize: kick=110, snare=100, hats=75, ghost=55.

## Genre BPM
lo-fi 80-90 | trap 130-150 | house 120-128 | dnb 170-180 | ambient 70-90 | hip-hop 85-95

## Tools
get_session_info, set_tempo, start_playback, stop_playback
create_midi_track, set_track_name, set_track_volume, set_track_mute
create_clip, add_notes_to_clip, get_clip_notes, fire_clip, stop_clip, set_clip_name
load_instrument_by_name, get_track_devices, set_device_parameter_by_name
generate_sound_effect(description, duration_seconds), transcribe_audio, load_midi_notes

## Audio Processing Tools
extract_harmonics(audio_data, filename?) — isolates harmonic/melodic content from audio
process_reverb(audio_data, filename?, room_size?, damping?, wet_level?, dry_level?) — adds reverb
chop_audio(audio_data, filename?, default_length?, min_duration?, n_clusters?) — slices audio into chops
adjust_pitch(audio_data, semitones, filename?) — shifts pitch up/down
adjust_speed(audio_data, speed_factor, filename?) — changes speed without pitch shift

When the user attaches an audio file, its base64 data is available as audio_data. Always describe what the processed audio sounds like and offer next steps.
`;

const MAX_TOOL_ROUNDS = 10;

function normalizeNotes(notes: unknown): Array<Record<string, unknown>> {
  let rawNotes: unknown = notes;
  if (rawNotes && typeof rawNotes === "object" && !Array.isArray(rawNotes)) {
    const container = rawNotes as { notes?: unknown; result?: { notes?: unknown } };
    if (Array.isArray(container.notes)) rawNotes = container.notes;
    else if (container.result && Array.isArray(container.result.notes)) rawNotes = container.result.notes;
  }
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes.map((n) => {
    if (Array.isArray(n)) return { pitch: Number(n[0] ?? 60), start_time: Number(n[1] ?? 0), duration: Number(n[2] ?? 0.25), velocity: Number(n[3] ?? 100), mute: Boolean(n[4] ?? false) };
    if (typeof n === "object" && n !== null) {
      const o = n as Record<string, unknown>;
      return { pitch: Number(o.pitch ?? o.note ?? 60), start_time: Number(o.start_time ?? o.start ?? 0), duration: Number(o.duration ?? 0.25), velocity: Number(o.velocity ?? 100), mute: Boolean(o.mute ?? false) };
    }
    return { pitch: 60, start_time: 0, duration: 0.25, velocity: 100, mute: false };
  });
}

/** Shared tool executor — same logic regardless of which AI is driving */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sessionState: SessionState
): Promise<{ result?: unknown; error?: string; sessionState: SessionState }> {
  // Normalize notes
  if (name === "add_notes_to_clip" && args.notes) args.notes = normalizeNotes(args.notes);
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
    return { error: `Validation failed: ${validation.errors.join(", ")}. ${getHint(name, "")}`, sessionState };
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
    } else if (name === "extract_harmonics" || name === "process_reverb" || name === "chop_audio" || name === "adjust_pitch" || name === "adjust_speed") {
      const AUDIO_BACKEND = process.env.AUDIO_BACKEND_URL || "http://localhost:8001";
      const endpointMap: Record<string, string> = {
        extract_harmonics: "/extract-harmonics",
        process_reverb: "/process-reverb",
        chop_audio: "/chop-audio",
        adjust_pitch: "/adjust-pitch",
        adjust_speed: "/adjust-speed",
      };
      const endpoint = endpointMap[name];
      // Map snake_case args to the Python API format
      const body: Record<string, unknown> = {
        audio_data: args.audio_data,
        filename: args.filename || "audio.wav",
      };
      if (name === "process_reverb") {
        if (args.room_size !== undefined) body.room_size = args.room_size;
        if (args.damping !== undefined) body.damping = args.damping;
        if (args.wet_level !== undefined) body.wet_level = args.wet_level;
        if (args.dry_level !== undefined) body.dry_level = args.dry_level;
      }
      if (name === "chop_audio") {
        if (args.default_length !== undefined) body.default_length = args.default_length;
        if (args.min_duration !== undefined) body.min_duration = args.min_duration;
        if (args.n_clusters !== undefined) body.n_clusters = args.n_clusters;
      }
      if (name === "adjust_pitch") body.semitones = args.semitones;
      if (name === "adjust_speed") body.speed_factor = args.speed_factor;

      const audioRes = await fetch(`${AUDIO_BACKEND}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (!audioRes.ok) {
        const err = await audioRes.text();
        throw new Error(`Audio backend error: ${err}`);
      }
      result = await audioRes.json();
    } else {
      result = await sendAbletonCommand(name, args);
    }

    console.log(`[Wonder] ✓ ${name}:`, JSON.stringify(result).slice(0, 100));
    const newState = updateStateAfterToolCall(sessionState, name, args, result);
    return { result, sessionState: newState };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Wonder] ✗ ${name}: ${msg}`);
    return { error: msg, sessionState };
  }
}

// ── Claude + MCP agentic loop ─────────────────────────────────────────────

async function runClaudeLoop(
  anthropic: Anthropic,
  messages: Anthropic.MessageParam[],
  systemPrompt: string
): Promise<string> {
  // Fetch tools live from the MCP server — no manual declarations needed
  let mcpTools: Anthropic.Tool[];
  try {
    mcpTools = await getMCPToolsForClaude();
    console.log(`[Wonder MCP] ${mcpTools.length} tools available from MCP server`);
  } catch (err) {
    console.warn("[Wonder MCP] MCP server unavailable, falling back to manual tools:", err);
    resetMCPClient();
    mcpTools = toClaudeToolsFallback();
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      tools: mcpTools,
      messages,
    });

    if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? (textBlock as Anthropic.TextBlock).text : "";
    }

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const args = (block.input as Record<string, unknown>) ?? {};
        console.log(`[Wonder MCP] → ${block.name}`, JSON.stringify(args).slice(0, 150));

        let content: string;
        try {
          // ElevenLabs tools bypass MCP and go direct
          const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
          if (block.name === "generate_sound_effect") {
            if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set");
            const r = await generateSoundEffect(args.description as string, (args.duration_seconds as number | undefined) ?? 2.0, elevenLabsKey);
            content = JSON.stringify(r);
          } else if (block.name === "text_to_speech") {
            if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY not set");
            const r = await textToSpeech(args.text as string, elevenLabsKey, args.voice_id as string | undefined);
            content = JSON.stringify(r);
          } else {
            content = await callMCPTool(block.name, args);
          }
          console.log(`[Wonder MCP] ✓ ${block.name}:`, content.slice(0, 100));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Wonder MCP] ✗ ${block.name}: ${msg}`);
          // Reset client on connection errors so next request reconnects
          if (msg.includes("connect") || msg.includes("EPIPE") || msg.includes("closed")) {
            resetMCPClient();
          }
          content = JSON.stringify({ error: msg, hint: getHint(block.name, msg) });
        }

        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content,
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return "Done.";
}

/** Fallback: convert Gemini-format WONDER_TOOL_DECLARATIONS to Anthropic format */
function toClaudeToolsFallback(): Anthropic.Tool[] {
  const convertSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "type" && typeof v === "string") out[k] = v.toLowerCase();
      else if (k === "properties" && typeof v === "object" && v !== null) {
        const props: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          props[pk] = convertSchema(pv as Record<string, unknown>);
        }
        out[k] = props;
      } else out[k] = v;
    }
    return out;
  };
  return WONDER_TOOL_DECLARATIONS.map((decl) => ({
    name: decl.name,
    description: decl.description ?? "",
    input_schema: decl.parameters
      ? convertSchema(decl.parameters as unknown as Record<string, unknown>) as Anthropic.Tool["input_schema"]
      : { type: "object" as const, properties: {} },
  }));
}

// ── Gemini agentic loop ────────────────────────────────────────────────────

async function runGeminiLoop(
  genAI: GoogleGenerativeAI,
  history: Content[],
  lastMessage: string,
  systemPrompt: string,
  audioData?: string,
  mimeType?: string
): Promise<string> {
  let sessionState: SessionState = createInitialState();

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: WONDER_TOOL_DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    generationConfig: {
      // @ts-ignore
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const chat = model.startChat({ history });

  let response;
  if (audioData && mimeType) {
    response = await chat.sendMessage([
      { inlineData: { data: audioData, mimeType } },
      { text: "Listen to this audio. If humming/melody, transcribe to MIDI. If speaking, follow instructions to create music in Ableton." },
    ]);
  } else {
    response = await chat.sendMessage(lastMessage);
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const candidate = response.response.candidates?.[0];
    if (!candidate?.content?.parts) break;

    const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
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
            response: error
              ? { error, hint: getHint(call.name, error) }
              : { result },
          },
        };
      })
    );

    response = await chat.sendMessage(toolResults);
  }

  return response.response.text();
}

// ── Request handler ────────────────────────────────────────────────────────

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
    const { messages, audioData, mimeType, midiContext, rhythmContext } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      audioData?: string;
      mimeType?: string;
      midiContext?: MidiContext;
      rhythmContext?: RhythmContext;
    };

    let systemPrompt = WONDER_SYSTEM_PROMPT;
    if (midiContext && midiContext.note_count > 0) systemPrompt += buildMidiContext(midiContext);
    if (rhythmContext?.note_starts_beats.length) systemPrompt += buildRhythmContext(rhythmContext);

    const lastMessage = messages[messages.length - 1];
    let finalText: string;

    if (anthropicKey) {
      // ── Claude path ──
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const claudeMessages: Anthropic.MessageParam[] = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      // Strip leading assistant messages (Claude requires user-first)
      while (claudeMessages.length > 0 && claudeMessages[0].role === "assistant") {
        claudeMessages.shift();
      }
      claudeMessages.push({ role: "user", content: lastMessage.content });
      finalText = await runClaudeLoop(anthropic, claudeMessages, systemPrompt);
    } else {
      // ── Gemini fallback ──
      const genAI = new GoogleGenerativeAI(geminiKey!);
      const rawHistory: Content[] = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const firstUserIdx = rawHistory.findIndex((m) => m.role === "user");
      const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];
      finalText = await runGeminiLoop(genAI, history, lastMessage.content, systemPrompt, audioData, mimeType);
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
    if (error.includes("No clip")) return "Call create_clip first, then add_notes_to_clip.";
    if (error.includes("index") || error.includes("range")) return "Check track_index — call get_session_info to verify track count.";
    return "notes must be array of {pitch,start_time,duration,velocity,mute}. Create clip first.";
  }
  if (toolName === "create_midi_track" || toolName === "create_audio_track") return "Call get_session_info first.";
  if (toolName === "load_instrument_by_name") return "Use exact name: 'Wavetable', 'Operator', 'Analog', 'Drift', 'Simpler', 'Drum Rack'.";
  return "Read the error and retry with corrected parameters.";
}
