/**
 * Sample Search — lightweight frontend .filter() over samples.json
 * No backend needed. Pure vibe-tag matching.
 */

export interface Sample {
  id: string;
  name: string;
  url: string;
  type: "one-shot" | "loop";
  instrument: string;
  tags: string[];
  bpm: number | null;
  key: string | null;
  duration_seconds: number;
  source: string;
}

interface SamplesData {
  samples: Sample[];
}

let cachedSamples: Sample[] | null = null;

/**
 * Load samples.json from public directory (client-side)
 */
export async function loadSamples(): Promise<Sample[]> {
  if (cachedSamples) return cachedSamples;

  try {
    const res = await fetch("/samples.json");
    const data: SamplesData = await res.json();
    cachedSamples = data.samples;
    return cachedSamples;
  } catch (error) {
    console.error("[Wonder] Failed to load samples.json:", error);
    return [];
  }
}

/**
 * Search samples by a natural language query.
 * Splits the query into words and matches against tags, name, instrument, and source.
 * Returns results sorted by relevance (number of matching words).
 */
export async function searchSamples(query: string): Promise<Sample[]> {
  const samples = await loadSamples();
  if (!query.trim()) return samples;

  const words = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 1);

  const scored = samples.map((sample) => {
    const searchable = [
      ...sample.tags,
      sample.name.toLowerCase(),
      sample.instrument.toLowerCase(),
      sample.source.toLowerCase(),
      sample.type,
      sample.key?.toLowerCase() ?? "",
    ].join(" ");

    let score = 0;
    for (const word of words) {
      if (searchable.includes(word)) score++;
    }
    return { sample, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.sample);
}

/**
 * Find samples by instrument type
 */
export async function findByInstrument(instrument: string): Promise<Sample[]> {
  const samples = await loadSamples();
  return samples.filter(
    (s) => s.instrument.toLowerCase() === instrument.toLowerCase()
  );
}

/**
 * Find loops that match a given BPM (within ±5 tolerance)
 */
export async function findByBPM(bpm: number, tolerance: number = 5): Promise<Sample[]> {
  const samples = await loadSamples();
  return samples.filter(
    (s) => s.bpm !== null && Math.abs(s.bpm - bpm) <= tolerance
  );
}
