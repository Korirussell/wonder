import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

interface SearchRequest {
  query: string;
  tags?: string[];
  bpm_range?: [number, number];
  key?: string;
  limit?: number;
}

interface SampleResult {
  id: string;
  name: string;
  file_path: string;
  tags: string[];
  bpm?: number;
  key?: string;
  duration_s: number;
  category?: string;
  sub_category?: string;
  description?: string;
  similarity_score?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SearchRequest;
    const { query, tags = [], bpm_range, key, limit = 10 } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Call the Python tagging search script
    const pythonScript = path.join(process.cwd(), "..", "tagging", "search.py");
    
    const searchArgs = [
      pythonScript,
      "--query", query,
      "--limit", String(limit),
    ];

    if (tags.length > 0) {
      searchArgs.push("--tags", tags.join(","));
    }

    if (bpm_range) {
      searchArgs.push("--bpm-min", String(bpm_range[0]));
      searchArgs.push("--bpm-max", String(bpm_range[1]));
    }

    if (key) {
      searchArgs.push("--key", key);
    }

    const results = await runPythonSearch(searchArgs);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Sound index search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function runPythonSearch(args: string[]): Promise<SampleResult[]> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", args);
    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python search failed: ${stderr}`));
        return;
      }

      try {
        const results = JSON.parse(stdout) as SampleResult[];
        resolve(results);
      } catch (err) {
        reject(new Error(`Failed to parse search results: ${err}`));
      }
    });

    python.on("error", (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
