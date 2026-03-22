"use client";

import { useState, useCallback } from "react";

export interface AudioAnalysis {
  bpm: number;
  key: string;
  error?: string;
}

export function useAudioAnalysis() {
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = useCallback(async (file: File | Blob) => {
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append("file", file instanceof File ? file : new File([file], "recording.webm", { type: file.type }));

      const res = await fetch("http://localhost:8000/api/analyze-audio", {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AudioAnalysis = await res.json();
      setAnalysis(data);
      return data;
    } catch {
      const fallback: AudioAnalysis = { bpm: 90, key: "C Major", error: "fetch-failed" };
      setAnalysis(fallback);
      return fallback;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  return { analysis, analyzing, analyze };
}
