"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Tone from "tone";
import {
  X,
  AudioWaveform,
  Cpu,
  Music2,
  Zap,
  Thermometer,
  ChevronRight,
} from "lucide-react";
import { useDAWContext } from "@/lib/DAWContext";
import type { SampleLibraryEntry } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  sample: SampleLibraryEntry;
  onClose: () => void;
}

// ─── Mock agentic analysis — deterministic from sample id so it's stable ────

function deriveAnalysis(sample: SampleLibraryEntry) {
  // Hash the id to seed "random" but stable values
  let h = 0;
  for (let i = 0; i < sample.id.length; i++) {
    h = (Math.imul(31, h) + sample.id.charCodeAt(i)) | 0;
  }
  const rng = (lo: number, hi: number) => {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    return lo + ((h >>> 0) / 0xffffffff) * (hi - lo);
  };

  const centroid = Math.round(rng(1200, 5800));
  const punch = Math.round(rng(55, 98));
  const brightness = Math.round(rng(30, 95));
  const noiseFloor = -Math.round(rng(62, 92));

  const vibes = [
    ["Warm", "Analog", "Lo-fi"],
    ["Crisp", "Digital", "Clinical"],
    ["Dark", "Sub-heavy", "Atmospheric"],
    ["Bright", "Airy", "Spatial"],
    ["Gritty", "Saturated", "Vintage"],
    ["Clean", "Transparent", "Studio"],
    ["Punchy", "Compressed", "Radio-ready"],
    ["Lush", "Reverberant", "Cinematic"],
  ];
  const vibe = vibes[Math.abs(h) % vibes.length];

  const insights = [
    `Spectral tail decays in ~${Math.round(rng(80, 400))}ms — ideal for tight grooves.`,
    `Detected mild ${Math.round(rng(2, 8))}x harmonic saturation consistent with tape emulation.`,
    `Transient attack at ${Math.round(rng(2, 18))}ms — recommend parallel compression for punch.`,
    `Low-end rolls off at ~${Math.round(rng(60, 200))}Hz — consider a sub-sine layer at -12 dBFS.`,
    `Mid-range presence at ${Math.round(rng(800, 3200))}Hz — pairs well with filtered pad layers.`,
    `Stereo width score: ${Math.round(rng(60, 99))}% — mono-compatible at low volumes.`,
  ];
  const insight = insights[Math.abs(h >> 4) % insights.length];

  // Waveform shape: 80 bars
  const bars: number[] = [];
  let env = 0.9;
  for (let i = 0; i < 80; i++) {
    env *= rng(0.97, 1.0);
    bars.push(Math.max(0.05, Math.abs(env * (rng(-1, 1)))));
  }

  return { centroid, punch, brightness, noiseFloor, vibe, insight, bars };
}

// ─── Waveform Visualizer ──────────────────────────────────────────────────────

function WaveformViz({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-center gap-[2px] h-full w-full">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-[#1A1A1A] origin-center"
          style={{
            height: `${Math.round(h * 100)}%`,
            opacity: 0.15 + h * 0.85,
            animationDelay: `${i * 15}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="border-2 border-[#1A1A1A] rounded-xl p-3 flex flex-col gap-1"
      style={{ background: accent ?? "#FDFDFB" }}
    >
      <div className="flex items-center gap-1.5 text-[#1A1A1A]/50">
        <Icon size={11} strokeWidth={2.5} />
        <span className="font-mono text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="font-mono text-[13px] font-bold text-[#1A1A1A] leading-tight">{value}</p>
    </div>
  );
}

// ─── Modal Body ───────────────────────────────────────────────────────────────

function ModalBody({ sample, onClose }: Props) {
  const { dispatch } = useDAWContext();
  const analysis = useMemo(() => deriveAnalysis(sample), [sample]);
  const [loading, setLoading] = useState(false);

  // Trap focus inside modal
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleLoadToTrack = async () => {
    setLoading(true);
    try {
      const trackId = crypto.randomUUID();
      const blockId = crypto.randomUUID();

      // Fetch audio blob from object URL / data URI
      const res = await fetch(sample.audioUrl);
      const blob = await res.blob();

      const colors = ["#C1E1C1", "#FEF08A", "#E9D5FF", "#FBCFE8", "#BAE6FD"];
      const color = colors[Math.floor(Math.random() * colors.length)];

      dispatch({
        type: "ADD_TRACK",
        payload: {
          id: trackId,
          name: sample.name,
          color,
          muted: false,
          volume: 80,
          audioBlob: blob,
        },
      });
      dispatch({
        type: "ADD_BLOCK",
        payload: {
          id: blockId,
          trackId,
          name: sample.name,
          startMeasure: 1,
          durationMeasures: 4,
          color,
        },
      });

      onClose();
    } catch (err) {
      console.error("Load to track failed:", err);
      setLoading(false);
    }
  };

  return (
    /* ── Overlay ── */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 backdrop-blur-md bg-black/25"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Card ── */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-xl bg-[#FDFDFB] border-2 border-[#1A1A1A] rounded-xl shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] outline-none overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`Analysis: ${sample.name}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1A1A1A] bg-[#1A1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg border-2 border-white/20 bg-white/10 flex items-center justify-center">
              <Cpu size={13} className="text-white" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Agentic Analysis
              </p>
              <p className="font-mono text-[13px] font-bold text-white truncate max-w-[300px]">
                {sample.name}
              </p>
            </div>
          </div>

          {/* BIG X — z-index safe, always on top */}
          <button
            onClick={onClose}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border-2 border-white/20 bg-white/10 text-white hover:bg-white hover:text-[#1A1A1A] transition-colors"
            aria-label="Close"
          >
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 flex flex-col gap-4">

          {/* Tags */}
          <div className="flex gap-2 flex-wrap">
            {analysis.vibe.map((v) => (
              <span
                key={v}
                className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-white px-2.5 py-1 rounded-full"
              >
                {v}
              </span>
            ))}
            {sample.tags.map((t) => (
              <span
                key={t}
                className="font-mono text-[10px] uppercase tracking-widest border-2 border-[#1A1A1A] text-[#1A1A1A] px-2.5 py-1 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              icon={Music2}
              label="Spectral Centroid"
              value={`${analysis.centroid.toLocaleString()} Hz`}
            />
            <StatCard
              icon={Zap}
              label="Transient Punch"
              value={`${analysis.punch}%`}
              accent={`hsl(${analysis.punch * 1.2}, 60%, 95%)`}
            />
            <StatCard
              icon={Thermometer}
              label="Brightness Score"
              value={`${analysis.brightness}%`}
            />
            <StatCard
              icon={AudioWaveform}
              label="Noise Floor"
              value={`${analysis.noiseFloor} dBFS`}
            />
          </div>

          {/* Waveform box */}
          <div className="border-2 border-[#1A1A1A] rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
            <div className="px-3 py-2 border-b-2 border-[#1A1A1A] bg-[#F5F5F2] flex items-center gap-1.5">
              <AudioWaveform size={11} className="text-[#1A1A1A]/50" strokeWidth={2.5} />
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/50">
                Waveform Analysis
              </span>
            </div>
            <div className="h-20 px-3 py-2.5 flex items-center bg-white">
              <WaveformViz bars={analysis.bars} />
            </div>
          </div>

          {/* Insight */}
          <div className="border-2 border-[#1A1A1A] rounded-xl p-3 bg-[#F5F5F2]">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 w-5 h-5 rounded-md bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center">
                <ChevronRight size={11} className="text-white" strokeWidth={2.5} />
              </div>
              <p className="font-mono text-[11px] text-[#1A1A1A]/70 leading-relaxed">
                {analysis.insight}
              </p>
            </div>
          </div>

          {/* Load to Track CTA */}
          <button
            onClick={handleLoadToTrack}
            disabled={loading}
            className="w-full py-3.5 border-2 border-[#1A1A1A] rounded-xl font-mono text-[12px] font-bold uppercase tracking-widest transition-all shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#FEF08A" }}
          >
            {loading ? "Loading…" : "↓ Load to Track"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Portal wrapper ────────────────────────────────────────────────────────────

export default function SampleAnalysisModal({ sample, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<ModalBody sample={sample} onClose={onClose} />, document.body);
}
