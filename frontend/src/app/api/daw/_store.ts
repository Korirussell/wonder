// Shared in-memory audio store for DAW tracks
export const audioStore = new Map<string, { buffer: Buffer; filename: string; mimeType: string }>();
