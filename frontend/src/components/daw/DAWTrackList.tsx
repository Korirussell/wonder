"use client";

import { useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import type { DAWTrack, DAWBlock } from "@/types";
import { Waveform } from "@/components/Waveform";
import { AudioInterfaceRecorder } from "./AudioInterfaceRecorder";

interface DAWTrackListProps {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  onAddTrack: () => void;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
  onDeleteTrack: (id: string) => void;
  onUploadAudio: (trackId: string, file: File) => void;
}

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
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(track.name);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="border-b-2 border-[#2D2D2D]/10 hover:bg-stone-50/80 transition-colors group">
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Color stripe */}
        <div
          className="w-1.5 self-stretch rounded-full shrink-0 border border-[#2D2D2D]/20"
          style={{ backgroundColor: track.color }}
        />

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold text-[#2D2D2D]/30 shrink-0 select-none">
              {trackNum}
            </span>
            {editing ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setNameInput(track.name);
                  }
                }}
                className="w-full font-mono text-[11px] font-bold border-2 border-[#2D2D2D] rounded-lg px-1.5 py-0.5 bg-white focus:outline-none"
              />
            ) : (
              <span
                className="font-headline text-[11px] font-extrabold uppercase tracking-tight truncate block cursor-default select-none"
                onDoubleClick={() => setEditing(true)}
                title={track.name}
                style={{ opacity: track.muted ? 0.35 : 1 }}
              >
                {track.name}
              </span>
            )}
          </div>

          {/* Waveform preview */}
          {track.audioBlob && (
            <div className="mt-1.5">
              <Waveform
                audioBlob={track.audioBlob}
                width={150}
                height={22}
                color={track.color}
              />
            </div>
          )}
        </div>

        {/* M / S buttons */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
            title={track.muted ? "Unmute" : "Mute"}
            className={`w-6 h-6 rounded-lg text-[9px] font-bold font-mono flex items-center justify-center border-2 transition-colors select-none ${
              track.muted
                ? "bg-[#FEF08A] border-[#2D2D2D] text-[#2D2D2D]"
                : "bg-white border-[#D0D0D0] text-[#555] hover:border-[#2D2D2D]"
            }`}
          >
            M
          </button>
        </div>
      </div>

      {/* Bottom row: volume + actions */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        {/* Volume slider */}
        <input
          type="range"
          min={0}
          max={100}
          value={track.volume}
          onChange={(e) =>
            onUpdateTrack(track.id, { volume: Number(e.target.value) })
          }
          className={`flex-1 h-1 accent-[#2D2D2D] ${track.muted ? "opacity-30" : ""}`}
        />
        <span className="font-mono text-[9px] font-bold text-[#2D2D2D]/40 w-6 text-right">
          {track.volume}
        </span>

        {/* Upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload audio"
          className="w-5 h-5 flex items-center justify-center text-[#2D2D2D]/30 hover:text-[#2D2D2D] transition-colors"
        >
          <Upload size={11} strokeWidth={2} />
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
          className="w-5 h-5 flex items-center justify-center text-[#2D2D2D]/0 group-hover:text-[#2D2D2D]/30 hover:!text-red-500 transition-all"
        >
          <Trash2 size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function DAWTrackList({
  tracks,
  blocks: _blocks,
  onAddTrack,
  onUpdateTrack,
  onDeleteTrack,
  onUploadAudio,
}: DAWTrackListProps) {
  return (
    <div className="w-[240px] shrink-0 border-r-2 border-[#2D2D2D] flex flex-col bg-[#FDFDFB] overflow-y-auto">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b-2 border-[#2D2D2D]/15 bg-[#F5F5F0]">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/40">
          Tracks
        </span>
        <span className="font-mono text-[9px] font-bold text-[#2D2D2D]/25">
          {tracks.length}
        </span>
      </div>

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
      </div>

      {/* Add Track */}
      <div className="p-3 border-t-2 border-[#2D2D2D]/15 shrink-0 bg-[#F5F5F0]">
        <button
          onClick={onAddTrack}
          className="w-full border-2 border-[#2D2D2D] rounded-xl py-2 font-mono text-[10px] font-bold uppercase tracking-widest interactive-push bg-white hard-shadow-sm"
        >
          + Add Track
        </button>
      </div>
    </div>
  );
}
