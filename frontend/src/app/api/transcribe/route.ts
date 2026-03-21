import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/transcribe
 * 
 * Transcribes hummed/whistled audio to MIDI notes using the Python REST API
 * which internally uses Spotify's basic-pitch for pitch detection.
 * 
 * Request body:
 * - audio_data: Base64-encoded audio data (WebM or WAV)
 * - input_format: Audio format ("webm" or "wav", default: "webm")
 * - tempo_bpm: Tempo for beat conversion (default: 120)
 * 
 * Response:
 * - success: boolean
 * - notes: Array of note objects with pitch, start_time, duration, velocity
 * - note_count: Number of notes detected
 * - suggested_clip_length: Recommended clip length in beats
 * - error: Error message (if failed)
 */

// Python REST API server URL (runs alongside the MCP server)
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      audio_data: string;
      input_format?: string;
      tempo_bpm?: number;
      pitch_correction_strength?: number;
    };

    const {
      audio_data,
      input_format = "webm",
      tempo_bpm = 120,
      pitch_correction_strength = 0.7,
    } = body;

    if (!audio_data) {
      return NextResponse.json(
        { success: false, error: "No audio data provided", notes: [], note_count: 0 },
        { status: 400 }
      );
    }

    console.log(`[Transcribe] Received ${audio_data.length} chars of base64 ${input_format} audio`);

    // Call the Python REST API transcribe endpoint
    const response = await fetch(`${PYTHON_API_URL}/api/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_data,
        input_format,
        tempo_bpm,
        pitch_correction_strength,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Transcribe] Python API error:", response.status, errorText);
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Transcription service error: ${response.status}`, 
          notes: [], 
          note_count: 0 
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log("[Transcribe] Result:", {
      success: result.success,
      note_count: result.note_count,
      suggested_clip_length: result.suggested_clip_length,
    });

    return NextResponse.json(result);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Transcribe] Error:", message);

    // Check if it's a connection error to the Python server
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Cannot connect to transcription service. Make sure the Python REST API server is running (python rest_api_server.py)", 
          notes: [], 
          note_count: 0 
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: message, notes: [], note_count: 0 },
      { status: 500 }
    );
  }
}
