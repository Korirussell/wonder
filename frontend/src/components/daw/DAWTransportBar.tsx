"use client";

import {
  Play,
  Square,
  SkipBack,
  Circle,
  RefreshCw,
  Download,
  Drum,
} from "lucide-react";
import type { DAWTransport } from "@/types";

interface DAWTransportBarProps {
  transport: DAWTransport;
  onPlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  onBPMChange: (bpm: number) => void;
  onExport: () => void;
  drumsOpen: boolean;
  onToggleDrums: () => void;
}

export function DAWTransportBar({
  transport,
  onPlay,
  onStop,
  onRewind,
  onBPMChange,
  onExport,
  drumsOpen,
  onToggleDrums,
}: DAWTransportBarProps) {
  const positionStr = `${String(Math.floor(transport.currentMeasure)).padStart(2, "0")}.01.000`;

  return (
    <div className="h-14 bg-[#1A1A1A] border-b-2 border-[#2D2D2D] flex items-center px-5 gap-4 shrink-0">
      {/* Rewind */}
      <button
        onClick={onRewind}
        className="text-white/50 hover:text-white transition-colors"
        title="Return to start"
      >
        <SkipBack size={15} strokeWidth={1.5} />
      </button>

      {/* Play / Stop */}
      <button
        onClick={transport.isPlaying ? onStop : onPlay}
        className="w-9 h-9 rounded-full bg-[#4CAF50] hover:bg-[#3d9940] flex items-center justify-center transition-colors"
        title={transport.isPlaying ? "Stop" : "Play"}
      >
        {transport.isPlaying ? (
          <Square size={13} strokeWidth={2.5} fill="white" color="white" />
        ) : (
          <Play size={13} strokeWidth={2.5} fill="white" color="white" />
        )}
      </button>

      {/* Stop */}
      <button
        onClick={onStop}
        className="text-white/50 hover:text-white transition-colors"
        title="Stop"
      >
        <Square size={13} strokeWidth={1.5} />
      </button>

      {/* Record dot */}
      <button
        className="w-6 h-6 rounded-full bg-[#E06030] flex items-center justify-center hover:bg-[#c04820] transition-colors"
        title="Record"
      >
        <Circle size={8} fill="white" strokeWidth={0} />
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-white/15" />

      {/* BPM */}
      <div className="flex flex-col items-center">
        <span className="text-[7.5px] font-mono font-bold uppercase tracking-widest text-white/35 leading-none mb-0.5">
          BPM
        </span>
        <input
          type="number"
          value={transport.bpm}
          min={20}
          max={300}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 20 && v <= 300) onBPMChange(v);
          }}
          className="w-14 bg-transparent text-[13px] font-mono font-bold text-white text-center leading-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Position */}
      <div className="flex flex-col items-center">
        <span className="text-[7.5px] font-mono font-bold uppercase tracking-widest text-white/35 leading-none mb-0.5">
          Position
        </span>
        <span className="text-[13px] font-mono font-bold text-white leading-none tracking-wide">
          {positionStr}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/15" />

      {/* Loop */}
      <button className="text-white/40 hover:text-white transition-colors" title="Loop">
        <RefreshCw size={14} strokeWidth={1.5} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Drums toggle */}
      <button
        onClick={onToggleDrums}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-widest transition-colors border ${
          drumsOpen
            ? "bg-[#FCA5A5] border-[#FCA5A5] text-[#2D2D2D]"
            : "bg-transparent border-white/20 text-white/60 hover:text-white hover:border-white/40"
        }`}
        title="Toggle drum rack"
      >
        <Drum size={12} strokeWidth={1.5} />
        Drums
      </button>

      {/* Export */}
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-widest bg-transparent border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
        title="Export as WAV"
      >
        <Download size={12} strokeWidth={1.5} />
        Export
      </button>
    </div>
  );
}
