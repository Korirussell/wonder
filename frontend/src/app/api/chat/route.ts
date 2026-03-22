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
3. Call generateAndPlaceAudio for melodic/bass layers (uses ElevenLabs)
4. Confirm in 1 sentence

## Sound Generation Tips
- Be specific: "deep punchy 808 sub bass hit with long tail decay" not just "bass"
- Drums: 0.5-1.5s. Pads/melodies: 2-4s

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
