"use client";

import { useState, useEffect } from "react";
import { Play, Square, Circle } from "lucide-react";
import TrackColumn from "./TrackColumn";
import { Track, SessionState } from "@/types";

const MOCK_TRACKS: Track[] = [
  {
    id: 1,
    name: "Lo-Fi Drums",
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    devices: ["Drum Buss", "RC-20"],
  },
  {
    id: 2,
    name: "Gritty Bass",
    volume: 0.7,
    pan: -0.1,
    mute: false,
    solo: false,
    armed: true,
    devices: ["RC-20", "OTT"],
  },
  {
    id: 3,
    name: "Chord Stabs",
    volume: 0.65,
    pan: 0.15,
    mute: false,
    solo: false,
    armed: false,
    devices: ["SketchCassette", "Vulf Comp"],
  },
  {
    id: 4,
    name: "Synth Lead",
    volume: 0.75,
    pan: 0.05,
    mute: false,
    solo: true,
    armed: false,
    devices: ["Digitalis"],
  },
];

const MOCK_WAVEFORM = [20, 35, 60, 85, 40, 90, 55, 30, 70, 45, 85, 25, 65, 40, 95, 35, 75, 50, 90, 40, 60, 80, 40, 90, 55, 30, 70, 45, 85, 25, 65, 95, 35, 75, 50, 40];

export default function SessionMirror() {
  const [session, setSession] = useState<SessionState>({
    bpm: 88,
    key: "A Minor",
    tracks: MOCK_TRACKS,
    isPlaying: false,
  });

  const updateTrack = (id: number, patch: Partial<Track>) => {
    setSession((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const [abletonConnected, setAbletonConnected] = useState(false);

  // Poll Ableton state every 2 seconds and sync to UI
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/ableton-state");
        const data = await res.json();
        setAbletonConnected(data.connected ?? false);
        if (data.connected && data.tracks?.length > 0) {
          setSession((prev) => ({
            ...prev,
            bpm: data.bpm ?? prev.bpm,
            isPlaying: data.isPlaying ?? prev.isPlaying,
            tracks: data.tracks,
          }));
        }
      } catch {
        setAbletonConnected(false);
      }
    };

    poll(); // immediate first call
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

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
        <div className={`flex items-center gap-2 border-2 border-[#2D2D2D] px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest ${abletonConnected ? "bg-[#C1E1C1]" : "bg-[#fa7150]/20"}`}>
          <div className={`w-1.5 h-1.5 rounded-full border border-[#2D2D2D] ${abletonConnected ? "bg-[#4a664c]" : "bg-[#fa7150] animate-pulse"}`} />
          {abletonConnected ? "Ableton Live" : "Not Connected"}
        </div>

        {/* Transport controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setSession((s) => ({ ...s, isPlaying: !s.isPlaying }))}
            className="w-11 h-11 bg-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push"
          >
            {session.isPlaying ? (
              <Square size={18} strokeWidth={2.5} />
            ) : (
              <Play size={18} strokeWidth={2.5} fill="#2D2D2D" />
            )}
          </button>
          <button className="w-11 h-11 bg-[#fa7150] border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push">
            <Circle size={14} fill="white" strokeWidth={0} />
          </button>
        </div>
      </header>

      {/* Track grid */}
      <div className="flex-1 px-8 pt-6 pb-28 overflow-x-auto custom-scrollbar flex gap-5 items-start">
        {session.tracks.map((track, i) => (
          <TrackColumn
            key={track.id}
            track={track}
            index={i}
            onUpdate={updateTrack}
          />
        ))}

        {/* Add track placeholder */}
        <div className="w-52 flex-shrink-0 h-64 border-2 border-dashed border-[#2D2D2D]/30 rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#2D2D2D]/60 hover:bg-white/40 transition-all group">
          <span className="font-mono text-xs text-stone-400 group-hover:text-stone-600 transition-colors">
            + new track
          </span>
        </div>
      </div>

      {/* Waveform strip */}
      <div className="absolute bottom-6 left-8 right-8 h-16 bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow p-4 flex items-center gap-4">
        <div className="flex-1 h-full flex items-center gap-[3px] overflow-hidden">
          {MOCK_WAVEFORM.map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full flex-shrink-0"
              style={{
                height: `${h}%`,
                backgroundColor: "#4a664c",
                opacity: session.isPlaying ? 0.4 + (i % 3) * 0.2 : 0.3 + (i % 5) * 0.12,
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[11px] font-bold opacity-40 whitespace-nowrap">
          {session.isPlaying ? "▶ PLAYING" : "◼ STOPPED"}
        </span>
      </div>
    </section>
  );
}
