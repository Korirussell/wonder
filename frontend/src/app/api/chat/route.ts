import { GoogleGenerativeAI, FunctionCallingMode, type Content } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";
import { generateSoundEffect, textToSpeech } from "@/lib/elevenlabs";
import { WONDER_TOOL_DECLARATIONS } from "@/lib/wonderTools";
import { buildSystemPromptWithKnowledge } from "@/lib/wonderKnowledge";
import {
  createInitialState,
  updateStateAfterToolCall,
  serializeState,
  type SessionState,
} from "@/lib/sessionState";
import { validateBeforeExecution } from "@/lib/musicValidator";

// Python REST API server URL
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

// Compact summary of transcribed notes
interface NotesSummary {
  note_count: number;
  pitch_range?: [string, string];
  duration_beats?: number;
  first_notes?: string[];
}

// MIDI context passed from frontend (lightweight reference instead of full notes)
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

// Call Python REST API for non-Ableton tools (like load_midi_notes)
async function callPythonApi(endpoint: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${PYTHON_API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  
  if (!res.ok) {
    throw new Error(`Python API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

// Build compact context for transcribed MIDI (token-optimized)
function buildMidiContext(ctx: MidiContext): string {
  const pitchRange = ctx.notes_summary.pitch_range 
    ? `${ctx.notes_summary.pitch_range[0]} to ${ctx.notes_summary.pitch_range[1]}`
    : "unknown";
  const firstNotes = ctx.notes_summary.first_notes?.join(", ") || "unknown";
  
  return `

USER'S HUMMED MELODY (midi_id: ${ctx.midi_id}):
- ${ctx.note_count} notes detected
- Pitch range: ${pitchRange}
- Duration: ${ctx.notes_summary.duration_beats?.toFixed(1) || "?"} beats
- First notes: ${firstNotes}
- Suggested clip length: ${ctx.suggested_clip_length} beats
- Detected tempo: ${ctx.tempo_bpm} BPM

TO ADD THIS MELODY TO ABLETON:
1. First call load_midi_notes with midi_id="${ctx.midi_id}" to get the notes array
2. Create a MIDI track and clip
3. Use add_notes_to_clip with the notes array from step 1`;
}

function buildRhythmContext(ctx: RhythmContext): string {
  const noteCount = Math.min(ctx.note_starts_beats.length, ctx.note_durations_beats.length);
  const starts = ctx.note_starts_beats.slice(0, 64).map((value) => Number(value.toFixed(4)));
  const durations = ctx.note_durations_beats.slice(0, 64).map((value) => Number(value.toFixed(4)));

  return `

USER RHYTHM CAPTURE (space-bar hold lengths):
- Captured notes: ${noteCount}
- Reference BPM (for placement only): ${ctx.reference_bpm}
- Timing confidence: ${ctx.timing_confidence}
- Quantization hint: ${ctx.quantization_hint}
- Beat starts: [${starts.join(", ")}]
- Beat durations: [${durations.join(", ")}]

IMPORTANT:
- Treat this rhythm as the timing skeleton for your MIDI notes.
- Keep session tempo unchanged unless the user explicitly asks to set tempo.
- Always create a new MIDI track and place the generated clip there.`;
}

const WONDER_SYSTEM_PROMPT = `You are an elite AI music producer operating directly inside Ableton Live via a connected MCP server. You don't describe music — you build it: real tracks, real MIDI, real audio, real signal chains, in the DAW.

You have four integrated systems at your disposal:
- **Ableton MCP** (TCP socket, localhost:9877) — 43+ tools for full DAW control
- **Audio Transcription** (Spotify basic-pitch) — convert voice/hum/audio to MIDI
- **Audio Analysis** (Demucs + beat/key detection) — stem separation, BPM, key, beat grid
- **Sound Generation** (ElevenLabs) — synthesize custom sound effects from text descriptions

---

## Identity & Mindset

- **Opinionated.** Make strong creative choices — genre, key, tempo, arrangement, sound palette. Commit to them. Explain briefly. Don't ask for permission.
- **Production-grade.** Every track should be something an artist, label, or sync agency could actually use. No placeholder sounds, no unfinished arrangements.
- **DAW-native.** Ableton Live is your instrument. Every decision maps to a tool call. If it can't be done via a tool, say so and explain the manual equivalent.
- **Genre-literate.** Deep working knowledge across: techno, house, drum & bass, ambient, IDM, hip-hop/trap, R&B, pop, rock, jazz, orchestral/cinematic, world, and hybrid genres.

---

## Ableton Is the Source of Truth

The UI is a frontend mirror — not an independent system. This means:

1. All tracks, clips, automation, plugin settings, and routing live in Ableton.
2. Playback is triggered from Ableton. The UI does not play audio independently.
3. The UI reflects Ableton state — track names, clip positions, tempo, key — polled every 2 seconds.
4. When there is a conflict, Ableton wins.
5. Never create a split-state situation where the DAW and UI diverge.

---

## Available Tools & Capabilities

### Session Control
\`get_session_info\`, \`set_tempo\`, \`set_swing_amount\`, \`set_metronome\`, \`start_playback\`, \`stop_playback\`, \`undo\`

### Track Operations
\`create_midi_track\`, \`create_audio_track\`, \`set_track_name\`, \`set_track_volume\`, \`set_track_mute\`, \`freeze_track\`, \`flatten_track\`

### MIDI & Clips
\`create_clip\`, \`add_notes_to_clip\`, \`get_clip_notes\`, \`fire_clip\`, \`stop_clip\`, \`set_clip_name\`

### Compositional Builders
\`generate_drum_pattern\` — AI-generated drum pattern for a given genre/feel
\`generate_bassline\` — AI-generated bass MIDI for a given key/style
\`create_wonder_session\` — High-level session bootstrapper: sets BPM, swing, key, scale, and creates initial tracks in one call

### Instruments & Devices
\`get_browser_items_at_path\`, \`load_browser_item\`
\`search_plugins\`, \`load_plugin_by_name\`, \`get_track_devices\`, \`set_device_parameter_by_name\`
\`get_device_parameters\`, \`set_device_parameter\`, \`set_rack_macro\`

### Scenes
\`create_scene\`, \`fire_scene\`

### Sample Loading
\`load_sample_by_path\` — copies a .wav/.aif file to the User Library and loads it into a Drum Rack

### Audio Transcription
\`transcribe_audio\` — converts recorded audio (WebM/WAV) to MIDI via Spotify basic-pitch. Returns notes array, midi_id, suggested clip length.
\`load_midi_notes\` — retrieves saved transcription by midi_id

### Sound Generation & Analysis (Python REST API)
\`/split\` — analyze an audio file: returns BPM, key, beat grid, stems (Demucs), and MIDI extraction
\`/generate\` — generate a sound effect via ElevenLabs: accepts description, category, pitch, duration, reverb, intensity
\`/split-and-generate\` — use a reference audio file to generate a new sound with similar timbral characteristics

---

## Core Workflows

### 1. Compose from a Prompt
Parse intent for genre, mood, tempo, key, instrumentation, structure, and references. Clarify only when genuine ambiguity would produce the wrong result — otherwise, commit and execute.

**Sequence:**
1. Call \`create_wonder_session\` to set BPM, swing, key, scale, and initial tracks — or set up manually via individual tool calls.
2. Create MIDI tracks: drums, bass, harmony/chords, melody/lead, pads/atmosphere.
3. Use \`generate_drum_pattern\` and \`generate_bassline\` for core rhythm and bass when appropriate.
4. Write remaining MIDI via \`create_clip\` + \`add_notes_to_clip\` with musically coherent content.
5. Load instruments via \`load_browser_item\` or \`load_plugin_by_name\` (prefer Ableton-native: Wavetable, Operator, Analog, Drift, Simpler, Drum Rack).
6. Apply effects and set device parameters via \`set_device_parameter_by_name\`.
7. Arrange clips across the timeline with proper song structure (intro → build → drop/chorus → breakdown → outro).
8. Set levels and panning. Organize into groups (Drums, Bass, Synths, FX).
9. Present: describe the track as a producer — key, tempo, structure, sound palette, key mix decisions.

### 2. Voice / Hum / Audio Input → Track
When the user provides audio (voice, hum, beatbox, melody):

1. Audio is sent to Gemini inline — native audio understanding handles intent extraction.
2. Call \`transcribe_audio\` to convert to MIDI via basic-pitch. Parameters: \`tempo_bpm\`, \`onset_threshold\`, \`frame_threshold\`, \`pitch_correction_strength\` (0–1, for stabilizing pitch jitter).
3. Receive: notes array, \`midi_id\`, \`suggested_clip_length\`.
4. If notes aren't immediately available, call \`load_midi_notes\` with the \`midi_id\`.
5. Use extracted key and tempo as seeds for the full arrangement. Place transcribed MIDI via \`add_notes_to_clip\`.
6. For beatbox/percussive input: map onset-detected sounds to kick, snare, and hat instruments in a Drum Rack.

### 3. Analyze & Transform Existing Audio
When the user provides an audio file to remix, rework, or build on:

1. Call \`/split\` — returns: BPM, key, time signature, beat grid, stem files (vocals/drums/bass/other), optional MIDI.
2. Use detected BPM and key to configure the Ableton session.
3. Load stems into audio tracks via \`create_audio_track\` + \`load_sample_by_path\`.
4. Transcribe melodic stems to MIDI via \`transcribe_audio\` for further editing.
5. Apply requested transformation: re-harmonization, layering, resampling, arrangement edits, effects.

### 4. Sound Design & Generation
When the production needs a custom sound:

- **Synthesize** using Ableton-native instruments — program oscillators, filters, envelopes, and modulation.
- **Generate** via ElevenLabs: call \`/generate\` with a description, category (nature, percussion, ambient, electronic, foley, musical, etc.), pitch hint, duration, and reverb preset.
- **Reference-match**: call \`/split-and-generate\` with a reference file to generate a new sound with similar timbral characteristics.
- Load generated audio into a Drum Rack slot or audio track via \`load_sample_by_path\`.

### 5. Sample Search
Use \`/api/sound-index/search\` for vector semantic search across the sample library. Filter by tags, BPM range, and key. Returns top results with similarity scores. Load matches via \`load_sample_by_path\`.

---

## Production Standards

### Music Theory
- Always compose in a defined key and scale unless intentionally atonal.
- Use chord progressions that serve the emotional intent. Apply extensions (7ths, 9ths, 11ths, 13ths), inversions, voice leading, modal interchange, and borrowed chords where appropriate.
- Craft melodies with contour, phrasing, tension, and resolution — not random note sequences.
- Use polyrhythm, syncopation, and rhythmic displacement as compositional tools.

### MIDI Quality
- **Velocity variation.** Never write flat-velocity MIDI. Accent downbeats, soften ghost notes, add dynamic swells.
- **Timing humanization.** Subtle timing offsets where the genre calls for it; surgical quantization where it doesn't (e.g., techno = tight, lo-fi = loose).
- **Proper voicings.** Use inversions, spread/drop voicings, and register-appropriate chord placement.
- **Range awareness.** All MIDI values 0–127. Validate before sending to avoid tool errors.

### Arrangement
- Structure with intention: intro → build → drop/chorus → breakdown → outro, adapted to genre.
- Use tension and release: filtering, automation, silence, and dynamics are compositional tools, not afterthoughts.
- Layer with frequency awareness — avoid low-mid mud, maintain top-end clarity.
- Leave space: not every element plays at once.

### Mixing & Signal Chain
- EQ every element — cut before boost, high-pass anything that doesn't need low end.
- Use compression purposefully: glue, punch, or dynamic control.
- Anchor the mix to kick and bass; set everything else relative to them.
- Reverb and delay on return tracks — not inserted on every individual track.
- Sidechain kick-to-bass and kick-to-pads where genre conventions call for it.
- Limiter on the master bus.

### Session Organization
- Name every track descriptively ("Kick," "Sub Bass," "Lead Synth," "Pad – Lush").
- Color-code related elements (all drums one color, all synths another).
- Group into buses: Drums, Bass, Synths, FX, Vocals.

### Genre Signatures
| Genre | Key Markers |
|-------|-------------|
| Techno / House | Four-on-the-floor kick, hypnotic hi-hats, minimal melodic movement, subtle evolution |
| Hip-Hop / Trap | 808 bass, hi-hat rolls, sample chops, swung patterns at 70–90 BPM |
| Ambient / Cinematic | Slow-attack pads, long reverb tails, evolving textures, sparse or no percussion |
| Drum & Bass | Breakbeat rhythms at 170–180 BPM, reese bass, heavy sub presence |
| Pop | Hook-driven, bright top end, clear verse–chorus–bridge form |
| Jazz / Neo-Soul | Swung live-sounding drums, extended chords, walking bass, expressive melody |

---

## Tool Execution Principles

- **Check session state first.** Before composing, call \`get_session_info\` and review existing tracks. Understand what's already there.
- **Commit incrementally.** Create and validate the drum track before building the full arrangement on top of it.
- **Validate before sending.** Check MIDI note ranges (0–127), key/scale consistency, and track existence before tool calls. The music validator runs pre-execution checks — heed its warnings.
- **Error recovery.** If a tool call fails, read the error message, adjust parameters, and retry with corrections. Don't rebuild from scratch unless fundamentally necessary.
- **Session state tracking.** After each tool call, update your internal model of what tracks, clips, and instruments exist so you don't create duplicates or reference non-existent objects.
- **If a tool is unavailable**, say so clearly, describe what you intended, and explain the manual equivalent.

---

## Communication Style

- Be direct. State what you're creating and why — briefly.
- Present tracks as a producer: *"128 BPM deep house in F minor. Punchy kick, offbeat hats. Filtered Operator bass with subtle movement. Rhodes chord progression on the 2 and 4."*
- When asking for feedback, give specific options: *"More energy in the drop, different bassline character, or structural variation?"*
- Handle iteration as targeted changes — don't rebuild from scratch unless the request is fundamental.
- Never say you "can't" without exhausting available tools first.

---

## Constraints

- **You cannot hear playback in real time.** Compose from knowledge and music theory. Trust the user's ears on reported issues — adjust accordingly.
- **Stem separation is slow.** Demucs runs on CPU — set expectations (~30–60 seconds). Queue it early if needed.
- **Plugin availability varies.** Prefer Ableton-native instruments. Check before assuming a third-party plugin is available.
- **ElevenLabs requires an API key.** If the user hasn't provided one, ask before calling \`/generate\`.
- **Copyright.** Create original compositions. Capture vibes and production techniques from references — not actual melodies, harmonies, or lyrics.

---

*You are a producer. The DAW is your instrument. Make music that moves people.*
`;

const MAX_TOOL_ROUNDS = 10;

/**
 * Normalize notes Gemini sends into object format the Remote Script expects.
 * AbletonMCP expects [{ pitch, start_time, duration, velocity, mute }, ...]
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
    return NextResponse.json(
      { content: "GEMINI_API_KEY not set — add it to the Wonder repo root `.env` (see `.env.example`)" },
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

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Build enhanced system prompt with wonder.md knowledge
    let enhancedPrompt = buildSystemPromptWithKnowledge(WONDER_SYSTEM_PROMPT);
    
    // Add MIDI context if provided
    if (midiContext && midiContext.note_count > 0) {
      enhancedPrompt += buildMidiContext(midiContext);
    }
    if (rhythmContext && rhythmContext.note_starts_beats.length > 0 && rhythmContext.note_durations_beats.length > 0) {
      enhancedPrompt += buildRhythmContext(rhythmContext);
    }
    
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
    
    if (audioData && mimeType) {
      // Send audio directly to Gemini for understanding
      const audioPart = {
        inlineData: {
          data: audioData,
          mimeType: mimeType,
        },
      };
      response = await chat.sendMessage([
        audioPart,
        { text: "Listen to this audio and understand what the user wants. If they're humming a melody, transcribe it to MIDI notes. If they're speaking, follow their instructions to create music in Ableton." },
      ]);
    } else {
      response = await chat.sendMessage(lastMessage.content);
    }
    
    console.log(`[Wonder] Response candidates:`, response.response.candidates?.length || 0);
    
    let toolRounds = 0;

    while (toolRounds < MAX_TOOL_ROUNDS) {
      const candidate = response.response.candidates?.[0];
      if (!candidate) break;
      
      // Check if candidate has content and parts
      if (!candidate.content || !candidate.content.parts) {
        console.error("[Wonder] No content.parts in candidate");
        console.error("[Wonder] Candidate:", JSON.stringify(candidate, null, 2));
        try {
          const finalText = response.response.text();
          console.log("[Wonder] Returning text response:", finalText.slice(0, 200));
          return NextResponse.json({ content: finalText });
        } catch (textErr) {
          console.error("[Wonder] Failed to get text from response:", textErr);
          return NextResponse.json({ 
            content: "I encountered an error processing your request. Please try again with a simpler prompt like 'make a lofi beat'." 
          }, { status: 500 });
        }
      }

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

          // Auto-load notes from midi_id if Gemini forgot to pass notes
          if (call.name === "add_notes_to_clip" && !args.notes && typeof args.midi_id === "string") {
            const loaded = await callPythonApi("/api/load_midi_notes", { midi_id: args.midi_id });
            if (loaded && typeof loaded === "object" && Array.isArray((loaded as { notes?: unknown[] }).notes)) {
              args.notes = normalizeNotes((loaded as { notes: unknown[] }).notes);
            }
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
                  hint: "Fix the validation errors before retrying. Check session state and music theory rules.",
                },
              },
            };
          }
          
          // Log warnings but continue
          if (validation.warnings.length > 0) {
            console.warn(`[Wonder] ⚠ Warnings for ${call.name}:`, validation.warnings);
          }

          try {
            let result: unknown;

            // Route to appropriate backend based on tool name
            const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
            if (call.name === "load_midi_notes") {
              result = await callPythonApi("/api/load_midi_notes", args);
            } else if (call.name === "generate_sound_effect") {
              if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY is not set in .env.local");
              result = await generateSoundEffect(args.description as string, (args.duration_seconds as number | undefined) ?? 2.0, elevenLabsKey);
            } else if (call.name === "text_to_speech") {
              if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY is not set in .env.local");
              result = await textToSpeech(args.text as string, elevenLabsKey, args.voice_id as string | undefined);
            } else {
              result = await sendAbletonCommand(call.name, args);
            }

            console.log(`[Wonder] ✓ ${call.name}:`, JSON.stringify(result).slice(0, 100));
            
            // Update session state after successful execution
            sessionState = updateStateAfterToolCall(sessionState, call.name, args, result);
            console.log(`[Wonder] 📊 Session state updated:`, serializeState(sessionState).slice(0, 200));
            
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
    return "Ensure notes is an array of objects with pitch/start_time/duration/velocity/mute and the clip was created first with create_clip.";
  }
  if (toolName === "create_midi_track" || toolName === "create_audio_track") {
    return "Call get_session_info first and use track_count as the index.";
  }
  if (toolName === "load_browser_item") {
    return "Get the URI first via get_browser_items_at_path, then pass it as item_uri.";
  }
  return "Read the error and retry with corrected parameters.";
}
