import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8001";

interface SoundSplitRequest {
  audioFile: string; // base64 encoded audio
  filename: string;
  stems?: boolean;
  midi?: boolean;
  beatGrid?: boolean;
  key?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SoundSplitRequest;
    const {
      audioFile,
      filename,
      stems = true,
      midi = true,
      beatGrid = true,
      key: detectKey = true,
    } = body;

    if (!audioFile || !filename) {
      return NextResponse.json(
        { error: "audioFile and filename are required" },
        { status: 400 }
      );
    }

    // Decode base64 and build a multipart form to POST to /audio/split
    const audioBuffer = Buffer.from(audioFile, "base64");
    const ext = filename.includes(".") ? filename.split(".").pop() : "wav";
    const mimeType = ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/wav";

    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
    form.append("stems", String(stems));
    form.append("midi", String(midi));
    form.append("beat_grid", String(beatGrid));
    form.append("key", String(detectKey));

    const response = await fetch(`${AGENT_API_URL}/audio/split`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SoundSplit] Agent server error:", response.status, errorText);
      return NextResponse.json(
        { error: `SoundSplit service error: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[SoundSplit] Error:", message);

    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return NextResponse.json(
        { error: "Cannot connect to agent server. Make sure wonder-agent is running on port 8001." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
