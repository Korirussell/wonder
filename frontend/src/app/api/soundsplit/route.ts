import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";

interface SoundSplitRequest {
  audioFile: string; // base64 encoded audio
  filename: string;
  stems?: boolean;
  midi?: boolean;
  beatGrid?: boolean;
  key?: boolean;
}

interface SoundSplitResult {
  bpm?: number;
  time_signature?: string;
  key?: string;
  duration_s?: number;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
  };
  midi_path?: string;
  output_dir: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SoundSplitRequest;
    const { audioFile, filename, stems = true, midi = true, beatGrid = true, key: detectKey = true } = body;

    if (!audioFile || !filename) {
      return NextResponse.json({ error: "audioFile and filename are required" }, { status: 400 });
    }

    // Create temp directory for processing
    const tempDir = path.join(process.cwd(), "..", "temp", "soundsplit");
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Decode base64 and save audio file
    const audioBuffer = Buffer.from(audioFile, "base64");
    const inputPath = path.join(tempDir, filename);
    await writeFile(inputPath, audioBuffer);

    // Run soundsplit CLI
    const outputDir = path.join(tempDir, path.parse(filename).name);
    const result = await runSoundSplit(inputPath, outputDir, { stems, midi, beatGrid, key: detectKey });

    return NextResponse.json(result);
  } catch (error) {
    console.error("SoundSplit error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function runSoundSplit(
  inputPath: string,
  outputDir: string,
  options: { stems: boolean; midi: boolean; beatGrid: boolean; key: boolean }
): Promise<SoundSplitResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-m", "soundsplit.cli",
      inputPath,
      "-o", outputDir,
    ];

    if (!options.stems) args.push("--no-stems");
    if (!options.midi) args.push("--no-midi");
    if (!options.beatGrid) args.push("--no-beats");
    if (!options.key) args.push("--no-key");

    const python = spawn("python3", args, {
      cwd: path.join(process.cwd(), "..", "backend", "soundsplit"),
    });

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("[SoundSplit]", data.toString());
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error("[SoundSplit Error]", data.toString());
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`SoundSplit failed with code ${code}: ${stderr}`));
        return;
      }

      // Parse output for metadata
      const result: SoundSplitResult = {
        output_dir: outputDir,
      };

      // Extract BPM from output
      const bpmMatch = stdout.match(/BPM:\s+([\d.]+)/);
      if (bpmMatch) result.bpm = parseFloat(bpmMatch[1]);

      // Extract time signature
      const timeSigMatch = stdout.match(/Time sig:\s+(\d+\/\d+)/);
      if (timeSigMatch) result.time_signature = timeSigMatch[1];

      // Extract key
      const keyMatch = stdout.match(/Key:\s+([A-G][#b]?\s+(?:major|minor))/);
      if (keyMatch) result.key = keyMatch[1];

      // Extract duration
      const durationMatch = stdout.match(/Duration:\s+([\d.]+)s/);
      if (durationMatch) result.duration_s = parseFloat(durationMatch[1]);

      // Build stem paths
      if (options.stems) {
        result.stems = {
          vocals: path.join(outputDir, "vocals.wav"),
          drums: path.join(outputDir, "drums.wav"),
          bass: path.join(outputDir, "bass.wav"),
          other: path.join(outputDir, "other.wav"),
        };
      }

      // MIDI path
      if (options.midi) {
        result.midi_path = path.join(outputDir, "full_mix.mid");
      }

      resolve(result);
    });

    python.on("error", (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
