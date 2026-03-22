import { NextRequest, NextResponse } from "next/server";
import { audioStore } from "../../_store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = audioStore.get(id);
  if (!entry) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  return new NextResponse(entry.buffer.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": entry.mimeType,
      "Content-Disposition": `attachment; filename="${entry.filename}"`,
    },
  });
}
