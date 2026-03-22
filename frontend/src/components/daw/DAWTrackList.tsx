"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Circle, Upload, Trash2, X } from "lucide-react";
import type { DAWTrack, DAWBlock } from "@/types";
import { toneEngine } from "@/lib/toneEngine";

const TRACK_ROW_HEIGHT = 72; // must match DAWTimeline

// ─── Volume toast (pops from bottom on volume change) ─────────────────────────

function VolumeToast({ label, onDone }: { label: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 20);
    const t2 = setTimeout(() => setPhase("out"),  1600);
    const t3 = setTimeout(onDone,                 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const y = phase === "hold" ? "0px" : "64px";
  const opacity = phase === "hold" ? 1 : 0;

  return createPortal(
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9995] pointer-events-none"
      style={{ transform: `translateX(-50%) translateY(${y})`, opacity, transition: "transform 280ms cubic-bezier(0.34,1.56,0.64,1), opacity 220ms ease" }}
    >
      <div className="flex items-center gap-2.5 bg-[#1A1A1A] border border-white/10 px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="w-1 h-4 bg-[#C1E1C1] animate-pulse" />
        <span className="font-mono text-[11px] font-bold text-white tracking-wide">{label}</span>
      </div>
    </div>,
    document.body,
  );
}

// ─── FX state (persisted in TrackRow) ─────────────────────────────────────────

interface FxState {
  volDb: number;
  reverbWet: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  soloed: boolean;
  ampEnabled: boolean;
  ampDrive: number;
  ampBass: number;
  ampMid: number;
  ampTreble: number;
  ampCab: boolean;
}

const DEFAULT_FX: FxState = {
  volDb: 0,
  reverbWet: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  soloed: false,
  ampEnabled: false,
  ampDrive: 0.5,
  ampBass: 0,
  ampMid: 0,
  ampTreble: 0,
  ampCab: true,
};

// ─── FX Panel (portal) ────────────────────────────────────────────────────────

interface FXPanelProps {
  trackId: string;
  trackName: string;
  color: string;
  fx: FxState;
  onUpdate: (patch: Partial<FxState>) => void;
  onClose: () => void;
}

function FXPanel({ trackId, trackName, color, fx, onUpdate, onClose }: FXPanelProps) {
  const set = (patch: Partial<FxState>) => onUpdate(patch);

  const updateVol = (v: number) => { set({ volDb: v }); toneEngine.setStemVolume(trackId, v); };
  const updateRev = (v: number) => { set({ reverbWet: v }); toneEngine.setStemReverb(trackId, v); };
  const updateEq  = (l: number, m: number, h: number) => {
    set({ eqLow: l, eqMid: m, eqHigh: h });
    toneEngine.setStemEQ(trackId, l, m, h);
  };
  const toggleSolo = () => {
    const next = !fx.soloed;
    set({ soloed: next });
    toneEngine.setStemSolo(trackId, next);
  };
  const toggleAmp = () => {
    const next = !fx.ampEnabled;
    set({ ampEnabled: next });
    toneEngine.setStemAmpEnabled(trackId, next);
  };
  const updateAmpDrive = (v: number) => {
    set({ ampDrive: v });
    toneEngine.setStemAmpDrive(trackId, v);
  };
  const updateAmpTone = (b: number, m: number, t: number) => {
    set({ ampBass: b, ampMid: m, ampTreble: t });
    toneEngine.setStemAmpTone(trackId, b, m, t);
  };
  const toggleAmpCab = () => {
    const next = !fx.ampCab;
    set({ ampCab: next });
    toneEngine.setStemAmpCabinet(trackId, next);
  };

  const labelCls = "font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1 block";
  const sliderCls = "w-full h-[3px] appearance-none rounded-full cursor-pointer accent-[#7DBF7D]";
  const valCls    = "font-mono text-[8px] text-[#1A1A1A]/40 text-right w-8 shrink-0";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-[9999] w-[320px] -translate-x-1/2 -translate-y-1/2 bg-[#FDFDFB] border-2 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 border-b border-[#1A1A1A]/10 pb-3">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]/70 flex-1 truncate">
            {trackName} — Channel Strip
          </span>
          <button
            onClick={toggleSolo}
            className={`px-2 py-0.5 border font-mono text-[9px] font-bold uppercase transition-colors ${
              fx.soloed
                ? "bg-[#FEF08A] border-[#1A1A1A] text-[#1A1A1A]"
                : "border-[#1A1A1A]/20 text-[#1A1A1A]/40 hover:border-[#1A1A1A]/60 hover:text-[#1A1A1A]"
            }`}
          >
            S
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-[#1A1A1A]/30 hover:text-[#1A1A1A] transition-colors"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>

        {/* Volume */}
        <label className={labelCls}>Volume</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="range" min={-40} max={6} step={0.5}
            value={fx.volDb}
            onChange={(e) => updateVol(Number(e.target.value))}
            className={sliderCls}
          />
          <span className={valCls}>{fx.volDb > 0 ? `+${fx.volDb}` : fx.volDb}dB</span>
        </div>

        {/* EQ */}
        <div className="border-t border-[#1A1A1A]/10 pt-3 mb-3">
          <span className={labelCls}>EQ</span>
          <div className="space-y-2">
            {([
              ["Low",  fx.eqLow,  (v: number) => updateEq(v, fx.eqMid,  fx.eqHigh)],
              ["Mid",  fx.eqMid,  (v: number) => updateEq(fx.eqLow, v,  fx.eqHigh)],
              ["High", fx.eqHigh, (v: number) => updateEq(fx.eqLow, fx.eqMid, v)],
            ] as [string, number, (v: number) => void][]).map(([label, val, set]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-[#1A1A1A]/35 w-6 shrink-0">{label}</span>
                <input
                  type="range" min={-15} max={6} step={0.5}
                  value={val}
                  onChange={(e) => set(Number(e.target.value))}
                  className={sliderCls}
                />
                <span className={valCls}>{val > 0 ? `+${val}` : val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reverb */}
        <div className="border-t border-[#1A1A1A]/10 pt-3 mb-3">
          <label className={labelCls}>Reverb Mix</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={0} max={1} step={0.01}
              value={fx.reverbWet}
              onChange={(e) => updateRev(Number(e.target.value))}
              className={sliderCls}
            />
            <span className={valCls}>{Math.round(fx.reverbWet * 100)}%</span>
          </div>
        </div>

        {/* Amp Simulator */}
        <div className="border-t border-[#1A1A1A]/10 pt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className={`${labelCls} mb-0 flex-1`}>AMP SIM</span>
            <button
              onClick={toggleAmp}
              className={`px-2 py-0.5 border font-mono text-[9px] font-bold uppercase transition-colors ${
                fx.ampEnabled
                  ? "bg-[#F5A623] border-[#1A1A1A] text-[#1A1A1A]"
                  : "border-[#1A1A1A]/20 text-[#1A1A1A]/40 hover:border-[#1A1A1A]/60"
              }`}
            >
              {fx.ampEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className={`space-y-2 ${fx.ampEnabled ? "opacity-100" : "opacity-35 pointer-events-none"}`}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[8px] text-[#1A1A1A]/35 w-8 shrink-0">Drive</span>
              <input
                type="range" min={0} max={1} step={0.01}
                value={fx.ampDrive}
                onChange={(e) => updateAmpDrive(Number(e.target.value))}
                className={sliderCls}
              />
              <span className={valCls}>{Math.round(fx.ampDrive * 100)}%</span>
            </div>

            {([
              ["Bass",   fx.ampBass,   (v: number) => updateAmpTone(v, fx.ampMid, fx.ampTreble)],
              ["Mid",    fx.ampMid,    (v: number) => updateAmpTone(fx.ampBass, v, fx.ampTreble)],
              ["Treble", fx.ampTreble, (v: number) => updateAmpTone(fx.ampBass, fx.ampMid, v)],
            ] as [string, number, (v: number) => void][]).map(([label, val, setVal]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-[#1A1A1A]/35 w-8 shrink-0">{label}</span>
                <input
                  type="range" min={-15} max={6} step={0.5}
                  value={val}
                  onChange={(e) => setVal(Number(e.target.value))}
                  className={sliderCls}
                />
                <span className={valCls}>{val > 0 ? `+${val}` : val}</span>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <span className="font-mono text-[8px] text-[#1A1A1A]/35 flex-1">Cabinet Sim</span>
              <button
                onClick={toggleAmpCab}
                className={`px-2 py-0.5 border font-mono text-[9px] font-bold uppercase transition-colors ${
                  fx.ampCab
                    ? "bg-[#F0F0EB] border-[#1A1A1A]/40 text-[#1A1A1A]/70"
                    : "border-[#1A1A1A]/15 text-[#1A1A1A]/25"
                }`}
              >
                {fx.ampCab ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── TrackRow ─────────────────────────────────────────────────────────────────

function TrackRow({
  track,
  index,
  isArmed,
  isRecording,
  kidsMode,
  onUpdateTrack,
  onDeleteTrack,
  onUploadAudio,
  onRecordTrack,
  onVolumeToast,
}: {
  track: DAWTrack;
  index: number;
  isArmed: boolean;
  isRecording: boolean;
  kidsMode: boolean;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
  onDeleteTrack: (id: string) => void;
  onUploadAudio: (trackId: string, file: File) => void;
  onRecordTrack: (trackId: string) => void;
  onVolumeToast: (label: string) => void;
}) {
  const [editing,   setEditing]   = useState(false);
  const [nameInput, setNameInput] = useState(track.name);
  const [fxOpen,    setFxOpen]    = useState(false);
  // FX state lives here so it persists across panel open/close
  const [fx, setFx] = useState<FxState>(DEFAULT_FX);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFx = (patch: Partial<FxState>) => {
    setFx((prev) => ({ ...prev, ...patch }));
    // Fire volume toast when FX panel volDb changes
    if (patch.volDb !== undefined) {
      const db = patch.volDb;
      onVolumeToast(`${track.name} · ${db > 0 ? "+" : ""}${db}dB`);
    }
  };

  const commitName = () => {
    setEditing(false);
    if (nameInput.trim() && nameInput.trim() !== track.name) {
      onUpdateTrack(track.id, { name: nameInput.trim() });
    } else {
      setNameInput(track.name);
    }
  };

  const trackNum = String(index + 1).padStart(2, "0");

  return (
    <div className="border-b border-[#E4E4DF] group relative" style={{ height: TRACK_ROW_HEIGHT }}>
      {/* Left color accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: track.color, opacity: track.muted ? 0.3 : 1 }}
      />

      <div className="pl-4 pr-3 pt-2 pb-1 flex flex-col justify-between h-full">
        {/* Top: number + name + M/S/FX buttons */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") { setEditing(false); setNameInput(track.name); }
                }}
                className="w-full font-mono text-[12px] font-bold border border-[#2D2D2D]/30 rounded px-1.5 py-0.5 bg-white focus:outline-none"
              />
            ) : (
              <span
                className="font-mono text-[12px] font-bold uppercase tracking-tight truncate block cursor-default select-none"
                onDoubleClick={() => setEditing(true)}
                title={track.name}
                style={{ opacity: track.muted ? 0.4 : 1, color: "#1a1a1a" }}
              >
                {trackNum} {track.name}
              </span>
            )}
          </div>

          <div className="flex gap-1 shrink-0">
            {/* Mute */}
            <button
              onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
              title={track.muted ? "Unmute" : "Mute"}
              className={`w-[22px] h-[22px] rounded text-[9px] font-bold font-mono flex items-center justify-center border transition-all select-none ${
                track.muted
                  ? "bg-[#F5C542] border-[#D4A800] text-[#1a1a1a]"
                  : "bg-[#F0F0EB] border-[#C8C8C2] text-[#555] hover:border-[#888]"
              }`}
            >M</button>

            {kidsMode ? null : (
              <>
                <button
                  title="Solo — open FX panel"
                  onClick={() => setFxOpen(true)}
                  className="w-[22px] h-[22px] rounded text-[9px] font-bold font-mono flex items-center justify-center border border-[#C8C8C2] bg-[#F0F0EB] text-[#555] hover:border-[#888] transition-all select-none"
                >S</button>

                <button
                  onClick={() => setFxOpen(true)}
                  title="Channel strip (EQ + Reverb)"
                  className="w-[22px] h-[22px] rounded text-[8px] font-bold font-mono flex items-center justify-center border border-[#C8C8C2] bg-[#F0F0EB] text-[#555] hover:bg-[#C1E1C1] hover:border-[#7DBF7D] transition-all select-none"
                >FX</button>
              </>
            )}
          </div>
        </div>

        {/* Bottom: route label + volume + actions */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8.5px] text-[#2D2D2D]/30 select-none tracking-wide">
            {kidsMode ? "READY TO PLAY" : "IN MIDI \u00a0 OUT MASTER"}
          </span>
          <div className="flex-1" />

          {/* Volume slider */}
          <input
            type="range" min={0} max={100}
            value={track.volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              onUpdateTrack(track.id, { volume: v });
              onVolumeToast(`${track.name} · ${v}%`);
            }}
            className={`w-16 h-[3px] accent-[#7DBF7D] ${track.muted ? "opacity-30" : ""}`}
          />

          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload audio"
            className="w-5 h-5 flex items-center justify-center text-[#2D2D2D]/25 hover:text-[#2D2D2D]/60 transition-colors"
          >
            <Upload size={10} strokeWidth={2} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadAudio(track.id, file);
              e.target.value = "";
            }}
          />

          {/* Record */}
          <button
            onClick={() => onRecordTrack(track.id)}
            title={isRecording ? "Stop overdub recording" : isArmed ? "Start overdub recording" : "Arm track and record"}
            className={`w-6 h-6 flex items-center justify-center rounded border transition-colors ${
              isRecording
                ? "bg-[#E05A3A] border-[#B33F24] text-white"
                : isArmed
                  ? "bg-[#FEF08A] border-[#1A1A1A] text-[#1A1A1A]"
                  : "bg-white border-[#1A1A1A]/20 text-[#1A1A1A]/45 hover:border-[#1A1A1A]"
            }`}
          >
            <Circle
              size={10}
              fill="currentColor"
              strokeWidth={0}
              className={isRecording ? "recording-pulse" : ""}
            />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDeleteTrack(track.id)}
            title="Delete track"
            className="w-5 h-5 flex items-center justify-center text-transparent group-hover:text-[#2D2D2D]/25 hover:!text-red-500 transition-all"
          >
            <Trash2 size={10} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* FX Channel Strip Panel */}
      {fxOpen && !kidsMode ? (
        <FXPanel
          trackId={track.id}
          trackName={track.name}
          color={track.color}
          fx={fx}
          onUpdate={updateFx}
          onClose={() => setFxOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ─── DAWTrackList ─────────────────────────────────────────────────────────────

export function DAWTrackList({
  tracks,
  recordingTrackId,
  isRecording,
  kidsMode,
  onAddTrack,
  onUpdateTrack,
  onDeleteTrack,
  onUploadAudio,
  onRecordTrack,
}: {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  recordingTrackId: string | null;
  isRecording: boolean;
  kidsMode: boolean;
  onAddTrack: () => void;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
  onDeleteTrack: (id: string) => void;
  onUploadAudio: (trackId: string, file: File) => void;
  onRecordTrack: (trackId: string) => void;
}) {
  const [volToast, setVolToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showVolToast = (label: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setVolToast(label);
  };

  return (
    <div className="w-[230px] min-w-[230px] flex-shrink-0 border-r border-[#D4D4CE] flex flex-col bg-[#F8F8F4] overflow-hidden">
      <div className="h-8 border-b-2 border-[#1A1A1A] bg-[#F0F0EB] shrink-0" />
      <div className="h-10 border-b border-[#D4D4CE] bg-[#F0F0EB] shrink-0" />
      <div className="h-8 border-b-2 border-[#1A1A1A] bg-[#F7F6F1] shrink-0" />

      {/* Track rows */}
      <div className="flex-1 overflow-y-auto no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            isArmed={recordingTrackId === track.id}
            isRecording={isRecording && recordingTrackId === track.id}
            kidsMode={kidsMode}
            onUpdateTrack={onUpdateTrack}
            onDeleteTrack={onDeleteTrack}
            onUploadAudio={onUploadAudio}
            onRecordTrack={onRecordTrack}
            onVolumeToast={showVolToast}
          />
        ))}

        {Array.from({ length: Math.max(0, 4 - tracks.length) }, (_, i) => (
          <div key={`empty-${i}`} className="border-b border-[#E4E4DF]" style={{ height: TRACK_ROW_HEIGHT }} />
        ))}
      </div>

      {/* Add Track */}
      <div className="p-2.5 border-t border-[#D4D4CE] shrink-0 bg-[#F0F0EB]">
        <button
          onClick={onAddTrack}
          className="w-full border border-dashed border-[#2D2D2D]/25 rounded-lg py-2 font-mono text-[9.5px] font-bold uppercase tracking-widest text-[#2D2D2D]/40 hover:text-[#2D2D2D]/70 hover:border-[#2D2D2D]/50 transition-colors"
        >
          + Add Track
        </button>
      </div>

      {/* Volume toast */}
      {volToast && (
        <VolumeToast
          label={volToast}
          onDone={() => setVolToast(null)}
        />
      )}
    </div>
  );
}
