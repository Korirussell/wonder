"use client";

import { useState } from "react";
import { Play, Square, Circle } from "lucide-react";
import TrackColumn from "./TrackColumn";
import { Track } from "@/types";
import { useAbleton } from "@/lib/AbletonContext";

export default function SessionMirror() {
  const { connected, session, refresh } = useAbleton();

  // Local track overrides for optimistic UI updates
  const [trackOverrides, setTrackOverrides] = useState<Record<number, Partial<Track>>>({});

  const sendCommand = async (command: string, params: Record<string, unknown> = {}) => {
    try {
      await fetch("/api/ableton-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, params }),
      });
      // Refresh state after command so UI reconciles with real Ableton state
      setTimeout(refresh, 300);
    } catch (err) {
      console.error(`[Wonder] Command failed: ${command}`, err);
    }
  };

  const updateTrack = (id: number, patch: Partial<Track>) => {
    setTrackOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  // Merge real session tracks with optimistic overrides
  const displayTracks: Track[] = session.tracks.map((t) => ({
    ...t,
    ...trackOverrides[t.id],
  }));

  return (
    <section className="flex-1 flex flex-col bg-[#FDFDFB]/30 relative overflow-hidden">
      {/* Top HUD */}
      <header className="px-8 pt-6 pb-4 flex justify-between items-center flex-shrink-0 border-b-2 border-[#2D2D2D]/10">
        <div className="flex gap-3">
          <div className="bg-white border-2 border-[#2D2D2D] px-4 py-2 rounded-xl hard-shadow-sm flex flex-col">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">
              Tempo
            </span>
            <span className="font-mono text-xl font-bold leading-none">
              {session.bpm.toFixed(2)}
            </span>
          </div>
          <div className="bg-white border-2 border-[#2D2D2D] px-4 py-2 rounded-xl hard-shadow-sm flex flex-col">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">
              Key
            </span>
            <span className="font-mono text-xl font-bold leading-none uppercase">
              {session.key}
            </span>
          </div>
        </div>

        {/* Ableton connection pill */}
        <div className={`flex items-center gap-2 border-2 border-[#2D2D2D] px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest ${connected ? "bg-[#C1E1C1]" : "bg-[#fa7150]/20"}`}>
          <div className={`w-1.5 h-1.5 rounded-full border border-[#2D2D2D] ${connected ? "bg-[#4a664c]" : "bg-[#fa7150] animate-pulse"}`} />
          {connected ? "Ableton Live" : "Not Connected"}
        </div>

        {/* Transport controls */}
        <div className="flex gap-2">
          <button
            onClick={() => sendCommand(session.isPlaying ? "stop_playback" : "start_playback")}
            className="w-11 h-11 bg-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push"
          >
            {session.isPlaying ? (
              <Square size={18} strokeWidth={2.5} />
            ) : (
              <Play size={18} strokeWidth={2.5} fill="#2D2D2D" />
            )}
          </button>
          <button
            onClick={() => sendCommand("start_playback")}
            className="w-11 h-11 bg-[#fa7150] border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push"
          >
            <Circle size={14} fill="white" strokeWidth={0} />
          </button>
        </div>
      </header>

      {/* Track grid */}
      <div className="flex-1 px-8 pt-6 pb-28 overflow-x-auto custom-scrollbar flex gap-5 items-start">
        {!connected && displayTracks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-40">
            <div className="w-16 h-16 border-2 border-dashed border-[#2D2D2D]/30 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">🎛️</span>
            </div>
            <div className="text-center">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-stone-400">
                Ableton not connected
              </p>
              <p className="font-mono text-[10px] text-stone-300 mt-1">
                Start the Remote Script in Ableton Preferences
              </p>
            </div>
          </div>
        ) : (
          <>
            {displayTracks.map((track, i) => (
              <TrackColumn
                key={track.id}
                track={track}
                index={i}
                onUpdate={updateTrack}
                onAbletonCommand={sendCommand}
              />
            ))}

            {/* Add track placeholder */}
            <div className="w-52 flex-shrink-0 h-64 border-2 border-dashed border-[#2D2D2D]/30 rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#2D2D2D]/60 hover:bg-white/40 transition-all group">
              <span className="font-mono text-xs text-stone-400 group-hover:text-stone-600 transition-colors">
                + new track
              </span>
            </div>
          </>
        )}
      </div>

      {/* Waveform strip */}
      <div className="absolute bottom-6 left-8 right-8 h-16 bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow p-4 flex items-center gap-4">
        <div className="flex-1 h-full flex items-center gap-[3px] overflow-hidden">
          {Array.from({ length: 36 }, (_, i) => {
            const h = session.isPlaying
              ? 20 + Math.abs(Math.sin(i * 0.7 + Date.now() * 0.001) * 75)
              : 15 + Math.abs(Math.sin(i * 0.9) * 55);
            return (
              <div
                key={i}
                className="w-[3px] rounded-full flex-shrink-0 transition-all duration-300"
                style={{
                  height: `${h}%`,
                  backgroundColor: "#4a664c",
                  opacity: session.isPlaying ? 0.5 + (i % 3) * 0.15 : 0.25 + (i % 5) * 0.08,
                }}
              />
            );
          })}
        </div>
        <span className="font-mono text-[11px] font-bold opacity-40 whitespace-nowrap">
          {session.isPlaying ? "▶ PLAYING" : "◼ STOPPED"}
        </span>
      </div>
    </section>
  );
}
