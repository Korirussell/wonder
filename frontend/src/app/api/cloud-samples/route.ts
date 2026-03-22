import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const FALLBACK_CLOUD_SAMPLES = [
  {
    id: "local-drum-bangit",
    name: "Drum Loop — Bangit (90)",
    url: "/samples/SO_RE_90_drum_loop_bangit.wav",
    tags: ["drum", "90bpm"],
  },
  {
    id: "local-drum-waterworld",
    name: "Drum Loop — Waterworld (90)",
    url: "/samples/SO_RE_90_drum_loop_waterworld.wav",
    tags: ["drum", "90bpm"],
  },
  {
    id: "local-drum-galapagos",
    name: "Drum Loop — Galapagos (90)",
    url: "/samples/SO_RE_90_drum_loop_galapagos.wav",
    tags: ["drum", "90bpm"],
  },
  {
    id: "local-guitar-basil",
    name: "Guitar Arp — Basil (90, Cmaj)",
    url: "/samples/SO_RE_90_guitar_arp_basil_Cmaj.wav",
    tags: ["guitar", "melody", "90bpm"],
  },
  {
    id: "local-melodic-emerald",
    name: "Melodic Stack — Emerald Piano (90, Cmaj)",
    url: "/samples/SO_RE_90_melodic_stack_emerald_piano_Cmaj.wav",
    tags: ["melodic", "piano", "90bpm"],
  },
  {
    id: "local-80-drum",
    name: "Drum Loop — Modern Pop (80)",
    url: "/samples/OLIVER_80_drum_loop_modern_pop_tight_foley.wav",
    tags: ["drum", "80bpm", "pop"],
  },
];

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    let resp: Response;
    try {
      resp = await fetch(`${BACKEND_URL}/api/cloud-samples`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      console.error(`[cloud-samples] backend returned ${resp.status}`);
      return NextResponse.json(FALLBACK_CLOUD_SAMPLES, { status: 200 });
    }

    const data = await resp.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[cloud-samples] ${msg} — serving fallback`);
    return NextResponse.json(FALLBACK_CLOUD_SAMPLES, { status: 200 });
  }
}
