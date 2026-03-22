"use client";

import {
  Play,
  Square,
  SkipBack,
  Circle,
  RefreshCw,
  Download,
  Drum,
  Grid3X3,
  Wand2,
  Music2,
  Timer,
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
  onRecord?: () => void;
  isRecording?: boolean;
  loopEnabled?: boolean;
  onToggleLoop?: () => void;
  monitorEnabled?: boolean;
  onToggleMonitor?: () => void;
  metronomeOn?: boolean;
  onToggleMetronome?: () => void;
  countInOn?: boolean;
  onToggleCountIn?: () => void;
  calibrating?: boolean;
  calibratedMs?: number | null;
  onCalibrate?: () => void;
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
  onRecord,
  isRecording = false,
  loopEnabled = false,
  onToggleLoop,
  monitorEnabled = false,
  onToggleMonitor,
  metronomeOn = false,
  onToggleMetronome,
  countInOn = false,
  onToggleCountIn,
  calibrating = false,
  calibratedMs = null,
  onCalibrate,
}: DAWTransportBarProps) {
  const measure = Math.floor(transport.currentMeasure);
  const positionStr = `${String(measure).padStart(2, "0")}.01.128`;

  const totalSecs = ((transport.currentMeasure - 1) * 4 * 60) / transport.bpm;
  const totalMins = Math.floor(totalSecs / 60);
  const remSecs = Math.floor(totalSecs % 60);
  const lengthStr = `${String(totalMins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}:32`;

  return (
    /* Dark transport bar — charcoal with clear internal contrast */
    <div className="h-[60px] bg-[#232323] border-t border-[#333] flex items-center px-5 gap-4 shrink-0">

      {/* Left: transport controls in a visible pill */}
      <div className="flex items-center gap-0.5 bg-[#303030] rounded-sm px-2.5 py-1.5 border-2 border-[#1A1A1A] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
        {/* Rewind */}
        <button
          onClick={onRewind}
          className="w-8 h-8 flex items-center justify-center text-[#aaa] hover:text-white transition-colors rounded-sm hover:bg-white/8"
          title="Return to start"
        >
          <SkipBack size={13} strokeWidth={2} />
        </button>

        {/* Play / Stop */}
        <button
          onClick={transport.isPlaying ? onStop : onPlay}
          className="w-[38px] h-[38px] rounded-sm bg-[#3DBE4E] hover:bg-[#35AB44] flex items-center justify-center transition-all shadow-[0_0_12px_rgba(61,190,78,0.35)] active:scale-95"
          title={transport.isPlaying ? "Stop" : "Play"}
        >
          {transport.isPlaying ? (
            <Square size={12} strokeWidth={3} fill="white" color="white" />
          ) : (
            <Play size={13} strokeWidth={2.5} fill="white" color="white" className="ml-0.5" />
          )}
        </button>

        {/* Stop */}
        <button
          onClick={onStop}
          className="w-8 h-8 flex items-center justify-center text-[#aaa] hover:text-white transition-colors rounded-sm hover:bg-white/8"
          title="Stop"
        >
          <Square size={12} strokeWidth={1.5} />
        </button>

        {/* Record */}
        <button
          onClick={onRecord}
          className={`w-8 h-8 flex items-center justify-center transition-colors rounded-sm hover:bg-white/8 ${isRecording ? "bg-[#E05A3A]/20" : ""}`}
          title={isRecording ? "Stop recording" : "Record audio"}
        >
          <Circle
            size={10}
            fill={isRecording ? "#E05A3A" : "#E05A3A"}
            strokeWidth={0}
            className={isRecording ? "animate-pulse" : "opacity-70"}
          />
        </button>

        <button
          onClick={onToggleMonitor}
          className={`px-2 py-1 rounded-sm border-2 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors ${
            monitorEnabled
              ? "bg-[#C1E1C1] border-[#C1E1C1] text-[#1A1A1A]"
              : "border-[#444] text-[#888] hover:text-white hover:border-[#666]"
          }`}
          title={monitorEnabled ? "Disable input monitoring" : "Enable input monitoring"}
        >
          Mon
        </button>

        {/* Metronome */}
        <button
          onClick={onToggleMetronome}
          className={`w-8 h-8 flex items-center justify-center transition-colors rounded-sm ${
            metronomeOn
              ? "bg-[#9945FF]/20 text-[#9945FF]"
              : "text-[#888] hover:text-[#ccc] hover:bg-white/6"
          }`}
          title={metronomeOn ? "Metronome on" : "Metronome off"}
        >
          <Music2 size={13} strokeWidth={1.5} />
        </button>

        {/* Count-in */}
        <button
          onClick={onToggleCountIn}
          className={`flex items-center gap-1 px-2 py-1 rounded-sm border-2 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors ${
            countInOn
              ? "bg-[#FB923C]/20 border-[#FB923C]/50 text-[#FB923C]"
              : "border-[#444] text-[#888] hover:text-white hover:border-[#666]"
          }`}
          title={countInOn ? "Count-in: 1 bar before recording" : "Count-in off"}
        >
          <Timer size={10} strokeWidth={1.8} />
          1
        </button>

        {/* Latency calibration */}
        <button
          onClick={onCalibrate}
          disabled={calibrating}
          className={`flex items-center gap-1 px-2 py-1 rounded-sm border-2 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 ${
            calibratedMs !== null && calibratedMs >= 0
              ? "border-[#14F195]/40 text-[#14F195]"
              : calibratedMs === -1
              ? "border-red-500/40 text-red-400"
              : "border-[#444] text-[#888] hover:text-white hover:border-[#666]"
          }`}
          title="Measure recording latency via loopback (play a click → record → find offset). Keep speakers on."
        >
          {calibrating ? "…" : calibratedMs !== null && calibratedMs >= 0 ? `${calibratedMs}ms` : calibratedMs === -1 ? "err" : "CAL"}
        </button>
      </div>

      {/* Center: position readout */}
      <div className="flex-1 flex items-center justify-center gap-5">
        <div className="flex flex-col items-end">
          <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#666] leading-none mb-0.5">
            POSITION
          </span>
          <span className="text-[17px] font-mono font-bold text-[#E8E8E8] leading-none tracking-widest tabular-nums">
            {positionStr}
          </span>
        </div>

        <div className="w-px h-6 bg-[#444]" />

        <div className="flex flex-col items-start">
          <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#666] leading-none mb-0.5">
            LENGTH
          </span>
          <span className="text-[17px] font-mono font-bold text-[#666] leading-none tracking-widest tabular-nums">
            {lengthStr}
          </span>
        </div>
      </div>

      {/* Right: utility controls */}
      <div className="flex items-center gap-1.5">
        {/* Loop */}
        <button
          onClick={onToggleLoop}
          className={`w-8 h-8 flex items-center justify-center transition-colors rounded-sm ${
            loopEnabled
              ? "bg-[#FEF08A]/20 text-[#FEF08A]"
              : "text-[#888] hover:text-[#ccc] hover:bg-white/6"
          }`}
          title="Loop"
        >
          <RefreshCw size={13} strokeWidth={1.5} />
        </button>

        {/* Grid */}
        <button
          onClick={onToggleDrums}
          className={`w-8 h-8 flex items-center justify-center transition-colors rounded-sm ${drumsOpen
              ? "text-[#F5C542] bg-[#F5C542]/12"
              : "text-[#888] hover:text-[#ccc] hover:bg-white/6"
            }`}
          title="Toggle drum rack"
        >
          <Grid3X3 size={13} strokeWidth={1.5} />
        </button>

        {/* AI Wand — yellow button, very visible */}
        <button
          className="w-8 h-8 rounded-sm bg-[#F5C542] flex items-center justify-center text-[#1a1a1a] hover:bg-[#e6b830] transition-colors shadow-[0_0_10px_rgba(245,197,66,0.3)]"
          title="AI Suggestions"
        >
          <Wand2 size={13} strokeWidth={2} />
        </button>

        <div className="w-px h-5 bg-[#3a3a3a]" />

        {/* Drums text button */}
        <button
          onClick={onToggleDrums}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-widest transition-colors border-2 ${drumsOpen
              ? "bg-[#F5C542]/12 border-[#F5C542]/35 text-[#F5C542]"
              : "bg-[#2c2c2c] border-[#3e3e3e] text-[#888] hover:text-[#bbb] hover:border-[#555]"
            }`}
          title="Toggle drum rack"
        >
          <Drum size={11} strokeWidth={1.5} />
          Drums
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-widest bg-[#2c2c2c] border-2 border-[#3e3e3e] text-[#888] hover:text-[#bbb] hover:border-[#555] transition-colors"
          title="Export as WAV"
        >
          <Download size={11} strokeWidth={1.5} />
          Export
        </button>

      </div>

      {/* BPM — visible on hover */}
      <div className="group flex items-center gap-1 pl-3 border-l border-[#3a3a3a]">
        <span className="text-[8px] font-mono text-[#555] uppercase tracking-widest group-hover:text-[#888] transition-colors">
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
          className="w-10 bg-transparent text-[12px] font-mono font-bold text-[#888] text-center focus:outline-none focus:text-white transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}
