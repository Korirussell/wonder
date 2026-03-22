/**
 * Sample Search — semantic search via backend_but_better
 *
 * Calls /api/samples/search which proxies to the Python backend's
 * LanceDB vector search. Falls back to empty results if backend is offline.
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

// Shape returned by the backend's SampleSearchResult
interface BackendSearchResult {
  id: string;
  file_path: string;
  file_name: string;
  source: string;
  category?: string;
  sub_category?: string;
  tags: string[];
  description?: string;
  duration?: number;
  similarity_score: number;
}

function backendToSample(r: BackendSearchResult): Sample {
  return {
    id: r.id,
    name: r.file_name,
    // Audio served through the proxy route
    url: `/api/samples/${r.id}/audio`,
    type: "one-shot",
    instrument: r.sub_category ?? r.category ?? "unknown",
    tags: r.tags ?? [],
    bpm: null,
    key: null,
    duration_seconds: r.duration ?? 0,
    source: r.source,
  };
}

/**
 * Semantic search via backend_but_better (LanceDB + Gemini embeddings).
 * Returns an empty array when the backend is unreachable.
 */
export async function searchSamples(
  query: string,
  limit = 10
): Promise<Sample[]> {
  if (!query.trim()) return [];

  try {
    const res = await fetch("/api/samples/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });

    if (!res.ok) return [];

    const results: BackendSearchResult[] = await res.json();
    return results.map(backendToSample);
  } catch (error) {
    console.error("[Wonder] Sample search failed:", error);
    return [];
  }
}

/**
 * Find samples by instrument type
 */
export async function findByInstrument(instrument: string): Promise<Sample[]> {
  return searchSamples(instrument, 20);
}

/**
 * Find loops that match a given BPM — passes BPM hint in the query
 */
export async function findByBPM(bpm: number): Promise<Sample[]> {
  return searchSamples(`${bpm} bpm`, 20);
}
