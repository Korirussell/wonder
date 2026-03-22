/**
 * /api/sfx — ElevenLabs Sound Effect Generation Proxy
 * 
 * Frontend sends: { description: string, duration_seconds?: number }
 * Returns: audio/mpeg binary (load directly into Tone.Player)
 * 
 * This keeps the ElevenLabs API key server-side.
 */

import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const { description, duration_seconds = 2.0 } = await req.json();

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const clampedDuration = Math.min(5, Math.max(0.5, duration_seconds));

    console.log(`[SFX] Generating: "${description}" (${clampedDuration}s)`);

    const response = await fetch(`${ELEVENLABS_API_BASE}/sound-generation`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: description,
        duration_seconds: clampedDuration,
        output_format: "mp3_44100_128",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[SFX] ElevenLabs error ${response.status}: ${errText}`);
      return NextResponse.json(
        { error: `ElevenLabs API error: ${errText}` },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[SFX] Generated ${audioBuffer.byteLength} bytes`);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "X-Wonder-Description": description,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[SFX] Error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
