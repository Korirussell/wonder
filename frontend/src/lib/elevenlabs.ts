/**
 * ElevenLabs REST API client for Wonder.
 * Uses fetch — no npm dependency required.
 * Files are saved to the Ableton User Library so they can be loaded directly.
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** Where generated audio lands — same path the ElevenLabs MCP server uses */
const OUTPUT_DIR = process.env.ELEVENLABS_OUTPUT_DIR
  ?? path.join(os.homedir(), "Documents", "Ableton", "User Library", "eleven_labs_audio");

/** Sanitise a description into a safe filename segment */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)
    .replace(/_+$/, "");
}

async function ensureOutputDir(): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}

// ── Sound Effects ─────────────────────────────────────────────────────────────

export interface SoundEffectResult {
  file_path: string;
  ableton_uri: string;
  description: string;
  duration_seconds: number;
}

/**
 * Generate a sound effect from a text description via ElevenLabs.
 * Duration must be 0.5–5 seconds.
 */
export async function generateSoundEffect(
  description: string,
  durationSeconds: number = 2.0,
  apiKey: string
): Promise<SoundEffectResult> {
  const clampedDuration = Math.min(5, Math.max(0.5, durationSeconds));

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
    const err = await response.text();
    throw new Error(`ElevenLabs sound-generation failed (${response.status}): ${err}`);
  }

  const audioBytes = Buffer.from(await response.arrayBuffer());
  const timestamp = Date.now();
  const filename = `sfx_${slug(description)}_${timestamp}.mp3`;
  const dir = await ensureOutputDir();
  const filePath = path.join(dir, filename);

  await writeFile(filePath, audioBytes);

  return {
    file_path: filePath,
    ableton_uri: `query:UserLibrary#eleven_labs_audio:${filename}`,
    description,
    duration_seconds: clampedDuration,
  };
}

// ── Sound Effect Buffer (returns base64, no disk write — for browser DAW) ────

export interface SoundEffectBufferResult {
  audioBase64: string;
  mimeType: string;
  filename: string;
  duration_seconds: number;
}

/**
 * Generate a sound effect and return it as base64 — does NOT write to disk.
 * Use this when the audio needs to land in the browser DAW rather than Ableton.
 */
export async function generateSoundEffectBuffer(
  description: string,
  durationSeconds: number = 2.0,
  apiKey: string
): Promise<SoundEffectBufferResult> {
  const clampedDuration = Math.min(5, Math.max(0.5, durationSeconds));

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
    const err = await response.text();
    throw new Error(`ElevenLabs sound-generation failed (${response.status}): ${err}`);
  }

  const audioBytes = Buffer.from(await response.arrayBuffer());
  const filename = `sfx_${slug(description)}_${Date.now()}.mp3`;

  return {
    audioBase64: audioBytes.toString("base64"),
    mimeType: "audio/mpeg",
    filename,
    duration_seconds: clampedDuration,
  };
}

// ── Text to Speech ────────────────────────────────────────────────────────────

const DEFAULT_VOICE_ID = "dPEieVXDPKaDPRG5YA6R"; // same default as the MCP server

export interface TextToSpeechResult {
  file_path: string;
  ableton_uri: string;
  text: string;
  voice_id: string;
}

/**
 * Convert text to speech and save to the Ableton User Library.
 * If voice_name is provided, searches for it first and falls back to the default.
 */
export async function textToSpeech(
  text: string,
  apiKey: string,
  voiceId: string = DEFAULT_VOICE_ID
): Promise<TextToSpeechResult> {
  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.45,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${err}`);
  }

  const audioBytes = Buffer.from(await response.arrayBuffer());
  const timestamp = Date.now();
  const filename = `tts_${slug(text)}_${timestamp}.mp3`;
  const dir = await ensureOutputDir();
  const filePath = path.join(dir, filename);

  await writeFile(filePath, audioBytes);

  return {
    file_path: filePath,
    ableton_uri: `query:UserLibrary#eleven_labs_audio:${filename}`,
    text,
    voice_id: voiceId,
  };
}
