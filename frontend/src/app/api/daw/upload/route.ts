import { NextRequest, NextResponse } from "next/server";
import { audioStore } from "../_store";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const trackId = crypto.randomUUID();
    audioStore.set(trackId, { buffer, filename: file.name, mimeType: file.type || "audio/wav" });
    return NextResponse.json({ trackId, filename: file.name, sizeBytes: buffer.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
