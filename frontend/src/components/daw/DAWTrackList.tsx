"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Trash2 } from "lucide-react";
import type { DAWTrack, DAWBlock } from "@/types";
import { AudioInterfaceRecorder } from "./AudioInterfaceRecorder";
import { toneEngine } from "@/lib/toneEngine";

const TRACK_ROW_HEIGHT = 72; // must match DAWTimeline

// ─── FX Panel (portal) ────────────────────────────────────────────────────────

interface FXPanelProps {
  trackId: string;
  trackName: string;
  color: string;
  anchorTop: number;
  anchorLeft: number;
  onClose: () => void;
}

function FXPanel({ trackId, trackName, color, anchorTop, anchorLeft, onClose }: FXPanelProps) {
  const [volDb,      setVolDb]      = useState(0);
  const [reverbWet,  setReverbWet]  = useState(0);
  const [eqLow,      setEqLow]      = useState(0);
  const [eqMid,      setEqMid]      = useState(0);
  const [eqHigh,     setEqHigh]     = useState(0);
  const [soloed,     setSoloed]     = useState(false);

  const updateVol = (v: number)  => { setVolDb(v);      toneEngine.setStemVolume(trackId, v); };
  const updateRev = (v: number)  => { setReverbWet(v);  toneEngine.setStemReverb(trackId, v); };
  const updateEq  = (l: number, m: number, h: number) => {
    setEqLow(l); setEqMid(m); setEqHigh(h);
    toneEngine.setStemEQ(trackId, l, m, h);
  };
  const toggleSolo = () => {
    const next = !soloed;
    setSoloed(next);
    toneEngine.setStemSolo(trackId, next);
  };

  const labelCls = "font-mono text-[8px] uppercase tracking-widest text-white/40 mb-1 block";
  const sliderCls = "w-full h-[3px] appearance-none rounded-full cursor-pointer accent-[#C1E1C1]";
  const valCls = "font-mono text-[8px] text-white/30 text-right w-8 shrink-0";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] bg-[#1A1A1A] border-2 border-white/20 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.08)] p-4 w-64"
        style={{ bottom: `calc(100vh - ${anchorTop}px + 6px)`, left: anchorLeft }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/70 flex-1 truncate">
            {trackName}
          </span>
          <button
            onClick={toggleSolo}
            className={`px-2 py-0.5 border font-mono text-[9px] font-bold uppercase transition-colors ${
              soloed
                ? "bg-[#FEF08A] border-[#FEF08A] text-[#1A1A1A]"
                : "border-white/20 text-white/40 hover:text-white/70"
            }`}
          >
            S
          </button>
        </div>

        {/* Volume */}
        <label className={labelCls}>Volume</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="range" min={-40} max={6} step={0.5}
            value={volDb}
            onChange={(e) => updateVol(Number(e.target.value))}
            className={sliderCls}
          />
          <span className={valCls}>{volDb > 0 ? `+${volDb}` : volDb}dB</span>
        </div>

        {/* EQ */}
        <div className="border-t border-white/10 pt-3 mb-3">
          <span className={labelCls}>EQ</span>
          <div className="space-y-2">
            {([
              ["Low",  eqLow,  (v: number) => updateEq(v, eqMid,  eqHigh)],
              ["Mid",  eqMid,  (v: number) => updateEq(eqLow, v,  eqHigh)],
              ["High", eqHigh, (v: number) => updateEq(eqLow, eqMid, v)],
            ] as [string, number, (v: number) => void][]).map(([label, val, set]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-white/35 w-6 shrink-0">{label}</span>
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
        <div className="border-t border-white/10 pt-3">
          <label className={labelCls}>Reverb Mix</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={0} max={1} step={0.01}
              value={reverbWet}
              onChange={(e) => updateRev(Number(e.target.value))}
              className={sliderCls}
            />
            <span className={valCls}>{Math.round(reverbWet * 100)}%</span>
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
  onUpdateTrack,
  onDeleteTrack,
  onUploadAudio,
}: {
  track: DAWTrack;
  index: number;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
  onDeleteTrack: (id: string) => void;
  onUploadAudio: (trackId: string, file: File) => void;
}) {
  const [editing,  setEditing]  = useState(false);
  const [nameInput, setNameInput] = useState(track.name);
  const [fxOpen,   setFxOpen]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fxBtnRef     = useRef<HTMLButtonElement>(null);
  const [fxPos, setFxPos] = useState({ top: 0, left: 0 });

  const openFX = () => {
    if (fxBtnRef.current) {
      const r = fxBtnRef.current.getBoundingClientRect();
      setFxPos({ top: r.top, left: r.left });
    }
    setFxOpen(true);
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

            {/* Solo */}
            <button
              title="Solo — open FX panel"
              onClick={openFX}
              className="w-[22px] h-[22px] rounded text-[9px] font-bold font-mono flex items-center justify-center border border-[#C8C8C2] bg-[#F0F0EB] text-[#555] hover:border-[#888] transition-all select-none"
            >S</button>

            {/* FX button */}
            <button
              ref={fxBtnRef}
              onClick={openFX}
              title="Channel strip (EQ + Reverb)"
              className="w-[22px] h-[22px] rounded text-[8px] font-bold font-mono flex items-center justify-center border border-[#C8C8C2] bg-[#F0F0EB] text-[#555] hover:bg-[#C1E1C1] hover:border-[#7DBF7D] transition-all select-none"
            >FX</button>
          </div>
        </div>

        {/* Bottom: route label + volume + actions */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8.5px] text-[#2D2D2D]/30 select-none tracking-wide">
            IN MIDI &nbsp; OUT MASTER
          </span>
          <div className="flex-1" />

          {/* Volume slider (maps to channel dB via useDAWEngine) */}
          <input
            type="range" min={0} max={100}
            value={track.volume}
            onChange={(e) => onUpdateTrack(track.id, { volume: Number(e.target.value) })}
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
          <AudioInterfaceRecorder
            trackId={track.id}
            onRecordingComplete={(id, file) => onUploadAudio(id, file)}
          />

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
      {fxOpen && (
        <FXPanel
          trackId={track.id}
          trackName={track.name}
          color={track.color}
          anchorTop={fxPos.top}
          anchorLeft={fxPos.left}
          onClose={() => setFxOpen(false)}
        />
      )}
    </div>
  );
}

// ─── DAWTrackList ─────────────────────────────────────────────────────────────

export function DAWTrackList({
  tracks,
  blocks: _blocks,
  onAddTrack,
  onUpdateTrack,
  onDeleteTrack,
  onUploadAudio,
}: {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  onAddTrack: () => void;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
  onDeleteTrack: (id: string) => void;
  onUploadAudio: (trackId: string, file: File) => void;
}) {
  return (
    <div className="w-[230px] shrink-0 border-r border-[#D4D4CE] flex flex-col bg-[#F8F8F4] overflow-hidden">
      {/* Ruler-height spacer */}
      <div className="h-10 border-b border-[#D4D4CE] bg-[#F0F0EB] shrink-0" />

      {/* Track rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            onUpdateTrack={onUpdateTrack}
            onDeleteTrack={onDeleteTrack}
            onUploadAudio={onUploadAudio}
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
    </div>
  );
}
