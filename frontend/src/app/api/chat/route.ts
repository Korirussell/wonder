import { streamText, tool, zodSchema, convertToModelMessages } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { NextRequest } from "next/server";
import { getProfilePromptBlock } from "@/lib/wonderProfile";

const SYSTEM_PROMPT = `You are Wonder — an AI music producer in a browser DAW. You build music by calling tools directly. Keep responses to 1-2 sentences max. Be fast and decisive.

## Browser DAW Time Model
- Timeline is measure-based, 1-indexed. Measures snap to 0.25 granularity.

## Genre BPM Guide
lo-fi 80-90 | trap 130-150 | house 120-128 | dnb 170-180 | hip-hop 85-95 | drill 140-150

## Beat Construction Patterns
trap: kick on steps 1+9, snare on 5+13, hi-hats all 16 steps
house: kick every 4 steps (1,5,9,13), snare on 5+13, open hat on 3+11
lo-fi: kick 1+7, snare 5+13, hi-hats every other step

## Workflow
1. Always call setBPM first
2. Call setDrumPattern to lay down rhythm (instant, no API needed)
3. Call generateLoop for backing tracks / chords / bass lines / pads (loops to grid)
4. Call generateAndPlaceAudio for one-shot FX, single hits, stabs (does NOT loop)
5. Confirm in 1 sentence

## Tool Choice Guide
- "piano progression", "chord loop", "bass loop", "pad loop", "melody loop" → generateLoop
- "808 hit", "snare crack", "riser", "one-shot", "stab", "FX" → generateAndPlaceAudio

## generateLoop Tips
- description must include: instrument, feel, genre. The frontend injects BPM + key automatically.
- bars: 4 for short motifs, 8 for longer phrases. Never exceed 8 (22s ElevenLabs cap).
- isLoop: true (default). Set false only for non-repeating intros/outros.

## Sound Generation Tips
- Be specific: "deep punchy 808 sub bass hit with long tail decay" not just "bass"
- Drums: 0.5-1.5s. Pads/melodies: 2-4s

## FX Tool Guide
- After placing audio, call setTrackFX to shape the sound to the vibe.
- Or call applyVibeFX with a vibe string to auto-apply FX presets to ALL tracks at once.
- Use applyVibeFX when user says things like "make it sound more lo-fi", "add some warmth", "make it dreamy", "bedroom pop vibes", "make it gritty", etc.
- applyVibeFX vibes: "lo-fi" | "dreamy" | "dark" | "bright" | "warm" | "gritty" | "808" | "clean" | "bedroom-pop" | "drill" | "jazz"
- setTrackFX lets you target one track with exact reverb/distortion/EQ values.

## FX Preset Reference
lo-fi: reverb 0.25, drive 0.15, low +3, mid -2, high -4
dreamy: reverb 0.65, drive 0, low 0, mid -1, high +2
dark: reverb 0.3, drive 0.2, low +4, mid -3, high -5
bright: reverb 0.1, drive 0, low -2, mid +1, high +4
warm: reverb 0.2, drive 0.1, low +3, mid +1, high -3
gritty: reverb 0.1, drive 0.55, low +2, mid 0, high -2
808: reverb 0.15, drive 0.35, low +5, mid -2, high -3
bedroom-pop: reverb 0.4, drive 0.05, low +1, mid +2, high +1
drill: reverb 0.05, drive 0.3, low +4, mid -1, high -2
jazz: reverb 0.35, drive 0, low +2, mid +3, high +1
clean: reverb 0, drive 0, low 0, mid 0, high 0

${getProfilePromptBlock()}
`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      setBPM: tool({
        description: "Set the DAW tempo in BPM. Always call this first.",
        inputSchema: zodSchema(z.object({ bpm: z.number().min(20).max(300) })),
      }),

      setDrumPattern: tool({
        description: "Fill the drum rack step sequencer with a rhythm. Each array is 16 booleans.",
        inputSchema: zodSchema(z.object({
          kick:    z.array(z.boolean()).length(16),
          snare:   z.array(z.boolean()).length(16),
          hihat:   z.array(z.boolean()).length(16),
          openHat: z.array(z.boolean()).length(16).optional(),
        })),
      }),

      createTrack: tool({
        description: "Create an empty audio track in the DAW.",
        inputSchema: zodSchema(z.object({ name: z.string(), color: z.string().optional() })),
      }),

      addBlock: tool({
        description: "Add an audio block to an existing track.",
        inputSchema: zodSchema(z.object({
          trackId: z.string(), name: z.string(),
          startMeasure: z.number(), durationMeasures: z.number(),
        })),
      }),

      moveBlock: tool({
        description: "Move a block to a new measure position.",
        inputSchema: zodSchema(z.object({ blockId: z.string(), newStartMeasure: z.number() })),
      }),

      deleteBlock: tool({
        description: "Delete a block from the timeline.",
        inputSchema: zodSchema(z.object({ blockId: z.string() })),
      }),

      deleteTrack: tool({
        description: "Delete a track and all its blocks.",
        inputSchema: zodSchema(z.object({ trackId: z.string() })),
      }),

      setVolume: tool({
        description: "Set track volume (0-100).",
        inputSchema: zodSchema(z.object({ trackId: z.string(), volume: z.number().min(0).max(100) })),
      }),

      setMute: tool({
        description: "Mute or unmute a track.",
        inputSchema: zodSchema(z.object({ trackId: z.string(), muted: z.boolean() })),
      }),

      generateAndPlaceAudio: tool({
        description: "Generate audio via ElevenLabs and place it on a new DAW track. Use for 808s, pads, melodies, FX. Use setDrumPattern for drums instead.",
        inputSchema: zodSchema(z.object({
          description:      z.string().describe("Detailed sound description"),
          durationSeconds:  z.number().min(0.5).max(4).optional(),
          trackName:        z.string(),
          startMeasure:     z.number(),
          durationMeasures: z.number().optional(),
          color:            z.string().optional(),
        })),
      }),

      generateLoop: tool({
        description:
          "Generate a BPM-synced looping backing track (piano, chords, bass, pads, melody). " +
          "The frontend calculates exact duration from bars + live BPM and injects BPM + key into the prompt. " +
          "Use this for anything that repeats on the grid.",
        inputSchema: zodSchema(z.object({
          description:  z.string().describe("Instrument + feel + genre. Do NOT include BPM or key — the frontend injects those."),
          bars:         z.number().int().min(1).max(8).default(4).describe("Number of bars (default 4, max 8 for 22s API cap)"),
          trackName:    z.string().describe("Short display name for the DAW track"),
          startMeasure: z.number().int().min(1).default(1).describe("Where to place the clip on the arrangement timeline"),
          isLoop:       z.boolean().default(true).describe("Whether to loop the clip (default true)"),
          color:        z.string().optional(),
        })),
      }),

      setTrackFX: tool({
        description: "Apply reverb, distortion (drive), and 3-band EQ to a specific track by ID. Call after generating a track to shape the sound.",
        inputSchema: zodSchema(z.object({
          trackId:    z.string().describe("The DAW track ID to apply FX to"),
          reverb:     z.number().min(0).max(1).optional().describe("Reverb wet mix 0-1"),
          drive:      z.number().min(0).max(1).optional().describe("Distortion drive amount 0-1"),
          eqLow:      z.number().min(-12).max(12).optional().describe("Low shelf gain in dB"),
          eqMid:      z.number().min(-12).max(12).optional().describe("Mid gain in dB"),
          eqHigh:     z.number().min(-12).max(12).optional().describe("High shelf gain in dB"),
          cabEnabled: z.boolean().optional().describe("Enable cabinet sim (speaker roll-off) — good for guitars/saturation"),
        })),
      }),

      applyVibeFX: tool({
        description: "Auto-apply FX presets to ALL tracks based on a vibe/mood/genre. Use when user asks for a sonic feel like 'make it lo-fi', 'add reverb everywhere', 'bedroom pop vibes', etc.",
        inputSchema: zodSchema(z.object({
          vibe: z.enum(["lo-fi", "dreamy", "dark", "bright", "warm", "gritty", "808", "clean", "bedroom-pop", "drill", "jazz"]).describe("The vibe preset to apply"),
          trackIds: z.array(z.string()).optional().describe("Specific track IDs to apply to. If omitted, applies to all tracks."),
        })),
      }),

      searchSamples: tool({
        description: "Search the sample library for sounds matching a vibe, instrument, or BPM. Use when user asks for specific sounds like 'warm vinyl kick' or 'lo-fi snare'.",
        inputSchema: zodSchema(z.object({
          query: z.string().describe("Natural language search query"),
          bpm:   z.number().optional().describe("Target BPM to filter by"),
        })),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
