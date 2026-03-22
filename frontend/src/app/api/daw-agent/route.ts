import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAW_TOOLS: Anthropic.Tool[] = [
  {
    name: "createTrack",
    description: "Create a new audio track in the browser DAW",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Track name" },
        color: { type: "string", description: "Hex color e.g. '#C1E1C1'" },
      },
      required: ["name"],
    },
  },
  {
    name: "addBlock",
    description: "Add an audio block to a track at a specific measure",
    input_schema: {
      type: "object" as const,
      properties: {
        trackId: { type: "string", description: "ID of the track to add the block to" },
        name: { type: "string", description: "Block name" },
        startMeasure: { type: "number", description: "Starting measure (1-based)" },
        durationMeasures: { type: "number", description: "Duration in measures" },
      },
      required: ["trackId", "startMeasure", "durationMeasures"],
    },
  },
  {
    name: "moveBlock",
    description: "Move a block to a new starting measure",
    input_schema: {
      type: "object" as const,
      properties: {
        blockId: { type: "string", description: "ID of the block to move" },
        newStartMeasure: { type: "number", description: "New starting measure" },
      },
      required: ["blockId", "newStartMeasure"],
    },
  },
  {
    name: "deleteBlock",
    description: "Delete a block from the timeline",
    input_schema: {
      type: "object" as const,
      properties: { blockId: { type: "string" } },
      required: ["blockId"],
    },
  },
  {
    name: "deleteTrack",
    description: "Delete a track and all its blocks",
    input_schema: {
      type: "object" as const,
      properties: { trackId: { type: "string" } },
      required: ["trackId"],
    },
  },
  {
    name: "setVolume",
    description: "Set track volume (0-100)",
    input_schema: {
      type: "object" as const,
      properties: {
        trackId: { type: "string" },
        volume: { type: "number", description: "Volume 0-100" },
      },
      required: ["trackId", "volume"],
    },
  },
  {
    name: "setMute",
    description: "Mute or unmute a track",
    input_schema: {
      type: "object" as const,
      properties: {
        trackId: { type: "string" },
        muted: { type: "boolean" },
      },
      required: ["trackId", "muted"],
    },
  },
  {
    name: "setBPM",
    description: "Set the session BPM/tempo",
    input_schema: {
      type: "object" as const,
      properties: { bpm: { type: "number", description: "BPM value (40-300)" } },
      required: ["bpm"],
    },
  },
];

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ content: "ANTHROPIC_API_KEY not set", toolCalls: [] }, { status: 500 });
  }

  try {
    const { messages, dawContext } = await req.json();

    const systemPrompt = `You are Wonder's browser DAW assistant. You help users arrange and manage audio tracks directly in the browser — no Ableton required.

## Current DAW State
${JSON.stringify(dawContext, null, 2)}

## Time Model
- Timeline is measure-based (1-indexed, increments by 0.25)
- Total measures: ${dawContext?.transport?.totalMeasures ?? 64}
- Current BPM: ${dawContext?.transport?.bpm ?? 85}

## Instructions
- Use tools to modify the DAW: create tracks, arrange blocks, adjust settings
- Tracks have: id, name, color (hex), muted, volume (0-100)
- Blocks have: id, trackId, name, startMeasure, durationMeasures
- When referencing existing tracks/blocks, use their IDs from the state above
- Keep responses brief — 1-2 sentences describing what you did
- Typical song structure: verse/chorus at 8-measure intervals, intro at measure 1`;

    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    // Strip leading assistant messages
    while (anthropicMessages.length > 0 && anthropicMessages[0].role === "assistant") {
      anthropicMessages.shift();
    }

    let finalText = "";
    const toolCalls: { name: string; args: Record<string, unknown> }[] = [];

    // Run agentic loop (up to 5 rounds)
    for (let round = 0; round < 5; round++) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: DAW_TOOLS,
        messages: anthropicMessages,
      });

      const textBlock = response.content.find(b => b.type === "text");
      if (textBlock) finalText = (textBlock as Anthropic.TextBlock).text;

      if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") break;

      const toolUseBlocks = response.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];
      toolUseBlocks.forEach(b => toolCalls.push({ name: b.name, args: b.input as Record<string, unknown> }));

      // Build tool results (success for all — client executes)
      const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(b => ({
        type: "tool_result" as const,
        tool_use_id: b.id,
        content: JSON.stringify({ success: true }),
      }));

      anthropicMessages.push({ role: "assistant", content: response.content });
      anthropicMessages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ content: finalText, toolCalls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ content: `Error: ${message}`, toolCalls: [] }, { status: 500 });
  }
}
