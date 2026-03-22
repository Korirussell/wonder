"use client";

import { useEffect, useState } from "react";
import { Play, Square, Circle } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import TrackColumn from "./TrackColumn";
import ArrangementView from "./ArrangementView";
import TempoModal from "./TempoModal";
import ScaleModal from "./ScaleModal";
import { type Track, type SessionState } from "@/types";
import { useAbleton } from "@/lib/AbletonContext";

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
    clips: [
      { index: 0, name: "Drums A", length: 8, isPlaying: false },
      { index: 1, name: "Drums B", length: 8, isPlaying: false },
      { index: 2, name: "Break", length: 4, isPlaying: false },
    ],
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
    clips: [
      { index: 0, name: "Bass A", length: 8, isPlaying: false },
      { index: 1, name: "Bass B", length: 8, isPlaying: false },
      { index: 2, name: "Fill", length: 4, isPlaying: false },
    ],
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
    clips: [
      { index: 0, name: "Chords A", length: 8, isPlaying: false },
      { index: 1, name: "Chords B", length: 16, isPlaying: false },
    ],
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
    clips: [
      { index: 1, name: "Lead A", length: 8, isPlaying: false },
      { index: 2, name: "Lead B", length: 8, isPlaying: false },
    ],
  },
];

const MOCK_WAVEFORM = [20, 35, 60, 85, 40, 90, 55, 30, 70, 45, 85, 25, 65, 40, 95, 35, 75, 50, 90, 40, 60, 80, 40, 90, 55, 30, 70, 45, 85, 25, 65, 95, 35, 75, 50, 40];

export default function SessionMirror() {
  const { connected, session: liveSession } = useAbleton();
  const [session, setSession] = useState<SessionState>({
    bpm: 88,
    key: "A Minor",
    tracks: MOCK_TRACKS,
    isPlaying: false,
  });
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<"arrangement" | "session">("arrangement");
  const [showTempoModal, setShowTempoModal] = useState(false);
  const [showScaleModal, setShowScaleModal] = useState(false);

  const updateTrack = (id: number, patch: Partial<Track>) => {
    setSession((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)),
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSession((current) => {
        const oldIndex = current.tracks.findIndex((track) => track.id === active.id);
        const newIndex = current.tracks.findIndex((track) => track.id === over.id);
        return { ...current, tracks: arrayMove(current.tracks, oldIndex, newIndex) };
      });
    }
  };

  const sendCommand = async (command: string, params: Record<string, unknown> = {}) => {
    try {
      const res = await fetch("/api/ableton-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, params }),
      });
      const data = await res.json();

      if (command === "start_playback") setSession((current) => ({ ...current, isPlaying: true }));
      if (command === "stop_playback") setSession((current) => ({ ...current, isPlaying: false }));
      if (command === "fire_clip") {
        const { track_index, clip_index } = params as { track_index: number; clip_index: number };
        setSession((current) => ({
          ...current,
          tracks: current.tracks.map((track, index) =>
            index === track_index
              ? { ...track, clips: track.clips.map((clip) => clip.index === clip_index ? { ...clip, isPlaying: true } : clip) }
              : track
          ),
        }));
      }
      if (command === "stop_clip") {
        const { track_index, clip_index } = params as { track_index: number; clip_index: number };
        setSession((current) => ({
          ...current,
          tracks: current.tracks.map((track, index) =>
            index === track_index
              ? { ...track, clips: track.clips.map((clip) => clip.index === clip_index ? { ...clip, isPlaying: false } : clip) }
              : track
          ),
        }));
      }

      return data;
    } catch (error) {
      console.error(`[Wonder] Command failed: ${command}`, error);
      return undefined;
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!connected) return;

    setSession((current) => ({
      ...current,
      bpm: liveSession.bpm ?? current.bpm,
      key: liveSession.key ?? current.key,
      isPlaying: liveSession.isPlaying ?? current.isPlaying,
      ...(liveSession.tracks.length > 0 ? { tracks: liveSession.tracks } : {}),
    }));
  }, [connected, liveSession]);

  return (
    <section className="flex-1 flex flex-col bg-[#FDFDFB]/30 relative overflow-hidden">
      <header className="px-6 py-3 flex items-center flex-shrink-0 border-b-2 border-[#2D2D2D]/10">
        <div className="flex-1 flex gap-3">
          <button
            onClick={() => setShowTempoModal(true)}
            className="bg-white border-2 border-[#2D2D2D] px-4 py-2 rounded-xl hard-shadow-sm flex flex-col cursor-pointer hover:bg-stone-50 transition-colors interactive-push"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">Tempo</span>
            <span className="font-mono text-xl font-bold leading-none">{session.bpm.toFixed(2)}</span>
          </button>
          <button
            onClick={() => setShowScaleModal(true)}
            className="bg-white border-2 border-[#2D2D2D] px-4 py-2 rounded-xl hard-shadow-sm flex flex-col cursor-pointer hover:bg-stone-50 transition-colors interactive-push"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">Scale</span>
            <span className="font-mono text-xl font-bold leading-none uppercase">{session.key}</span>
          </button>
        </div>

        <div className="flex-1 flex items-center gap-2 justify-center">
          <div className="flex bg-white border-2 border-[#2D2D2D] rounded-xl overflow-hidden hard-shadow-sm">
            <button
              onClick={() => setView("arrangement")}
              className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${view === "arrangement" ? "bg-[#2D2D2D] text-white" : "hover:bg-stone-100"}`}
            >
              Arrange
            </button>
            <button
              onClick={() => setView("session")}
              className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors border-l-2 border-[#2D2D2D] ${view === "session" ? "bg-[#2D2D2D] text-white" : "hover:bg-stone-100"}`}
            >
              Session
            </button>
          </div>

          <div className={`flex items-center gap-2 border-2 border-[#2D2D2D] px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest ${connected ? "bg-[#C1E1C1]" : "bg-[#fa7150]/20"}`}>
            <div className={`w-1.5 h-1.5 rounded-full border border-[#2D2D2D] ${connected ? "bg-[#4a664c]" : "bg-[#fa7150] animate-pulse"}`} />
            {connected ? "Ableton Live" : "Not Connected"}
          </div>
        </div>

        <div className="flex-1 flex gap-2 justify-end">
          <button
            onClick={() => void sendCommand(session.isPlaying ? "stop_playback" : "start_playback")}
            className="w-11 h-11 bg-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push"
          >
            {session.isPlaying ? <Square size={18} strokeWidth={2.5} /> : <Play size={18} strokeWidth={2.5} fill="#2D2D2D" />}
          </button>
          <button className="w-11 h-11 bg-[#fa7150] border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push">
            <Circle size={14} fill="white" strokeWidth={0} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {view === "arrangement" ? (
          <ArrangementView session={session} onCommand={sendCommand} />
        ) : (
          <div className="h-full px-8 pt-6 pb-28 overflow-y-auto custom-scrollbar flex flex-wrap gap-4 content-start relative">
            {mounted ? (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={session.tracks.map((track) => track.id)} strategy={rectSortingStrategy}>
                  {session.tracks.map((track, index) => (
                    <TrackColumn key={track.id} track={track} index={index} onUpdate={updateTrack} />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              session.tracks.map((track, index) => (
                <TrackColumn key={track.id} track={track} index={index} onUpdate={updateTrack} sortable={false} />
              ))
            )}

            <div className="flex-1 min-w-[200px] h-64 border-2 border-dashed border-[#2D2D2D]/30 rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#2D2D2D]/60 hover:bg-white/40 transition-all group">
              <span className="font-mono text-xs text-stone-400 group-hover:text-stone-600 transition-colors">+ new track</span>
            </div>

            <div className="absolute bottom-6 left-8 right-8 h-16 bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow p-4 flex items-center gap-4">
              <div className="flex-1 h-full flex items-center gap-[3px] overflow-hidden">
                {MOCK_WAVEFORM.map((height, index) => (
                  <div
                    key={index}
                    className="w-[3px] rounded-full flex-shrink-0"
                    style={{
                      height: `${height}%`,
                      backgroundColor: "#4a664c",
                      opacity: session.isPlaying ? 0.4 + (index % 3) * 0.2 : 0.3 + (index % 5) * 0.12,
                    }}
                  />
                ))}
              </div>
              <span className="font-mono text-[11px] font-bold opacity-40 whitespace-nowrap">
                {session.isPlaying ? "▶ PLAYING" : "◼ STOPPED"}
              </span>
            </div>
          </div>
        )}
      </div>

      {showTempoModal && (
        <TempoModal
          initialBpm={session.bpm}
          onConfirm={(newBpm) => setSession((current) => ({ ...current, bpm: newBpm }))}
          onClose={() => setShowTempoModal(false)}
        />
      )}
      {showScaleModal && (
        <ScaleModal
          initialKey={session.key}
          onConfirm={(key) => setSession((current) => ({ ...current, key }))}
          onClose={() => setShowScaleModal(false)}
        />
      )}
    </section>
  );
}
