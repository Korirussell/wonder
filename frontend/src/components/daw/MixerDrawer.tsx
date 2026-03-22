"use client";

import type { DAWTrack } from "@/types";
import { toneEngine } from "@/lib/toneEngine";
import {
  TRACK_VOLUME_DB_MAX,
  TRACK_VOLUME_DB_MIN,
  dbToVolumePercent,
  volumePercentToDb,
} from "@/lib/mixUtils";

interface MixerDrawerProps {
  open: boolean;
  tracks: DAWTrack[];
  onClose: () => void;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
}

function formatPanLabel(pan: number) {
  if (Math.abs(pan) < 0.05) return "C";
  return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
}

function ChannelStrip({
  track,
  onUpdateTrack,
}: {
  track: DAWTrack;
  onUpdateTrack: (id: string, patch: Partial<DAWTrack>) => void;
}) {
  const volumeDb = track.volumeDb ?? volumePercentToDb(track.volume);
  const volumePercent = dbToVolumePercent(volumeDb);
  const pan = track.pan ?? 0;
  const transitionClass = track.mixAnimating ? "transition-all duration-[1500ms] ease-in-out" : "";

  return (
    <div className="flex h-full min-w-[148px] flex-col border-2 border-[#1A1A1A] bg-[#F7F6F1] p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]">
            {track.name}
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#1A1A1A]/45">
            Channel
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const nextMuted = !track.muted;
              toneEngine.muteStem(track.id, nextMuted);
              onUpdateTrack(track.id, { muted: nextMuted });
            }}
            className={`min-w-8 border-2 border-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${
              track.muted ? "bg-[#F5C542] text-[#1A1A1A]" : "bg-[#FDFDFB] text-[#1A1A1A]"
            }`}
          >
            M
          </button>
          <button
            onClick={() => {
              const nextSolo = !(track.solo ?? false);
              toneEngine.setStemSolo(track.id, nextSolo);
              onUpdateTrack(track.id, { solo: nextSolo });
            }}
            className={`min-w-8 border-2 border-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest ${
              track.solo ? "bg-[#FEF08A] text-[#1A1A1A]" : "bg-[#FDFDFB] text-[#1A1A1A]"
            }`}
          >
            S
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-end justify-center gap-4">
        <div className="relative flex h-40 w-14 items-center justify-center">
          <div className="absolute inset-x-0 bottom-0 top-0 border-2 border-[#1A1A1A] bg-[#ECE9DF]" />
          <div
            className={`absolute inset-x-0 bottom-0 border-t-2 border-[#1A1A1A] bg-[#C1E1C1] ${transitionClass}`}
            style={{ height: `${volumePercent}%` }}
          />
          <div
            className={`absolute left-1/2 h-3 w-16 -translate-x-1/2 border-2 border-[#1A1A1A] bg-[#FDFDFB] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] ${transitionClass}`}
            style={{ bottom: `calc(${volumePercent}% - 6px)` }}
          />
          <input
            type="range"
            min={TRACK_VOLUME_DB_MIN}
            max={TRACK_VOLUME_DB_MAX}
            step={0.1}
            value={volumeDb}
            onChange={(event) => {
              const nextVolumeDb = Number(event.target.value);
              toneEngine.setStemVolume(track.id, nextVolumeDb);
              onUpdateTrack(track.id, {
                volumeDb: nextVolumeDb,
                volume: dbToVolumePercent(nextVolumeDb),
                mixAnimating: false,
              });
            }}
            className="absolute left-1/2 top-1/2 h-10 w-40 -translate-x-1/2 -translate-y-1/2 -rotate-90 cursor-ns-resize opacity-0"
            aria-label={`${track.name} volume`}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/50">
          Vol
        </span>
        <span className="font-mono text-[10px] font-bold text-[#1A1A1A]">
          {volumeDb > 0 ? `+${volumeDb.toFixed(1)}` : volumeDb.toFixed(1)} dB
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/50">
            Pan
          </span>
          <span className="font-mono text-[10px] font-bold text-[#1A1A1A]">
            {formatPanLabel(pan)}
          </span>
        </div>
        <div className="relative h-8">
          <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 border-2 border-[#1A1A1A] bg-[#ECE9DF]" />
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#1A1A1A]/35" />
          <div
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 border-2 border-[#1A1A1A] bg-[#FEF08A] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${transitionClass}`}
            style={{ left: `calc(${((pan + 1) / 2) * 100}% - 8px)` }}
          />
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={pan}
            onChange={(event) => {
              const nextPan = Number(event.target.value);
              toneEngine.setStemPan(track.id, nextPan);
              onUpdateTrack(track.id, {
                pan: nextPan,
                mixAnimating: false,
              });
            }}
            className="absolute inset-0 cursor-ew-resize opacity-0"
            aria-label={`${track.name} pan`}
          />
        </div>
      </div>
    </div>
  );
}

export function MixerDrawer({ open, tracks, onClose, onUpdateTrack }: MixerDrawerProps) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 h-72 border-t-2 border-[#1A1A1A] bg-[#FDFDFB] shadow-[0_-8px_0px_0px_rgba(26,26,26,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] bg-[#F3F2ED] px-4 py-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
              Mixer
            </p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#1A1A1A]/45">
              Tone.Channel routing
            </p>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-[#1A1A1A] bg-[#FDFDFB] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex h-full items-stretch gap-4">
            {tracks.map((track) => (
              <ChannelStrip
                key={track.id}
                track={track}
                onUpdateTrack={onUpdateTrack}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
