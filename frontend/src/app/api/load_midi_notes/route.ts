import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/load_midi_notes
 *
 * Retrieves notes for a previously transcribed MIDI file by its midi_id.
 * Called by the chat route when Gemini needs to load notes from a transcription.
 *
 * Request body:
 * - midi_id: string — ID returned by /api/transcribe
 *
 * Response:
 * - success: boolean
 * - midi_id: string
 * - notes: Array of { pitch, start_time, duration, velocity, mute }
 * - note_count: number
 * - tempo_bpm: number
 */

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { midi_id?: string };
    const { midi_id } = body;

    if (!midi_id) {
      return NextResponse.json(
        { success: false, error: "midi_id is required", notes: [], note_count: 0 },
        { status: 400 }
      );
    }

    console.log(`[LoadMidiNotes] Fetching notes for midi_id: ${midi_id}`);

    const response = await fetch(`${PYTHON_API_URL}/midi/${encodeURIComponent(midi_id)}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LoadMidiNotes] Python API error:", response.status, errorText);
      return NextResponse.json(
        { success: false, error: `MIDI not found: ${midi_id}`, notes: [], note_count: 0 },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log(`[LoadMidiNotes] Loaded ${result.note_count} notes for ${midi_id}`);
    return NextResponse.json(result);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[LoadMidiNotes] Error:", message);

    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot connect to Python REST API. Make sure the server is running.",
          notes: [],
          note_count: 0,
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
