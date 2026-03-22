"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import TrackColumn from "./TrackColumn";
import ArrangementView from "./ArrangementView";
import TempoModal from "./TempoModal";
import ScaleModal from "./ScaleModal";
import { Track, SessionState } from "@/types";

const MOCK_TRACKS: Track[] = [
  {
    id: 1,
    name: "KICK",
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    devices: [],
    clips: [
      { index: 0, name: "KICK_BASIC_44.WAV", length: 16, isPlaying: false },
    ],
  },
  {
    id: 2,
    name: "SNARE",
    volume: 0.75,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    devices: [],
    clips: [
      { index: 1, name: "SNARE_LAYER_01", length: 4, isPlaying: false },
      { index: 3, name: "SNARE_LAYER_01", length: 4, isPlaying: false },
    ],
  },
  {
    id: 3,
    name: "SUB BASS",
    volume: 0.7,
    pan: 0,
    mute: false,
    solo: true,
    armed: false,
    devices: [],
    clips: [
      { index: 0, name: "DEEP SUB F MINOR", length: 24, isPlaying: false },
    ],
  },
  {
    id: 4,
    name: "LEAD SYNTH",
    volume: 0.75,
    pan: 0,
    mute: false,
    solo: false,
    armed: true,
    devices: [],
    clips: [
      { index: 1, name: "MIDNIGHT SYNTH LEAD", length: 16, isPlaying: false },
    ],
  },
];

export default function SessionMirror() {
  const [session, setSession] = useState<SessionState>({
    bpm: 120,
    key: "F Minor",
    tracks: MOCK_TRACKS,
    isPlaying: false,
  });

  const [view, setView] = useState<"arrangement" | "session">("arrangement");
  const [showTempoModal, setShowTempoModal] = useState(false);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [abletonConnected, setAbletonConnected] = useState(false);

  const updateTrack = (id: number, patch: Partial<Track>) => {
    setSession((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSession((s) => {
        const oldIndex = s.tracks.findIndex((t) => t.id === active.id);
        const newIndex = s.tracks.findIndex((t) => t.id === over.id);
        return { ...s, tracks: arrayMove(s.tracks, oldIndex, newIndex) };
      });
    }
  };

  const sendCommand = async (cmd: string, params: Record<string, unknown> = {}) => {
    try {
      const res = await fetch("/api/ableton-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, params }),
      });
      const data = await res.json();
      if (cmd === "start_playback") setSession((s) => ({ ...s, isPlaying: true }));
      if (cmd === "stop_playback") setSession((s) => ({ ...s, isPlaying: false }));
      if (cmd === "fire_clip") {
        const { track_index, clip_index } = params as { track_index: number; clip_index: number };
        setSession((s) => ({
          ...s,
          tracks: s.tracks.map((t, i) =>
            i === track_index
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.index === clip_index ? { ...c, isPlaying: true } : c
                  ),
                }
              : t
          ),
        }));
      }
      if (cmd === "stop_clip") {
        const { track_index, clip_index } = params as { track_index: number; clip_index: number };
        setSession((s) => ({
          ...s,
          tracks: s.tracks.map((t, i) =>
            i === track_index
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.index === clip_index ? { ...c, isPlaying: false } : c
                  ),
                }
              : t
          ),
        }));
      }
      if (cmd === "set_track_mute") {
        const { track_index, mute } = params as { track_index: number; mute: boolean };
        setSession((s) => ({
          ...s,
          tracks: s.tracks.map((t, i) =>
            i === track_index ? { ...t, mute } : t
          ),
        }));
      }
      if (cmd === "set_track_solo") {
        const { track_index, solo } = params as { track_index: number; solo: boolean };
        setSession((s) => ({
          ...s,
          tracks: s.tracks.map((t, i) =>
            i === track_index ? { ...t, solo } : t
          ),
        }));
      }
      if (cmd === "set_track_arm") {
        const { track_index, armed } = params as { track_index: number; armed: boolean };
        setSession((s) => ({
          ...s,
          tracks: s.tracks.map((t, i) =>
            i === track_index ? { ...t, armed } : t
          ),
        }));
      }
      return data;
    } catch (err) {
      console.error(`[Wonder] Command failed: ${cmd}`, err);
    }
  };

  // Poll Ableton state
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/ableton-state");
        const data = await res.json();
        setAbletonConnected(data.connected ?? false);
        if (data.connected) {
          setSession((prev) => ({
            ...prev,
            bpm: data.bpm ?? prev.bpm,
            isPlaying: data.isPlaying ?? prev.isPlaying,
            ...(data.tracks?.length > 0 ? { tracks: data.tracks } : {}),
          }));
        }
      } catch {
        setAbletonConnected(false);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="flex-1 flex flex-col overflow-hidden relative">
      {/* View toggle + connection status strip */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#EFEFEC] border-b border-[#D8D8D8] flex-shrink-0">
        {/* View toggle */}
        <div className="flex bg-white border border-[#D0D0D0] rounded-lg overflow-hidden">
          <button
            onClick={() => setView("arrangement")}
            className={`px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
              view === "arrangement"
                ? "bg-[#2D2D2D] text-white"
                : "text-[#2D2D2D]/50 hover:bg-[#F0F0ED]"
            }`}
          >
            Arrange
          </button>
          <button
            onClick={() => setView("session")}
            className={`px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors border-l border-[#D0D0D0] ${
              view === "session"
                ? "bg-[#2D2D2D] text-white"
                : "text-[#2D2D2D]/50 hover:bg-[#F0F0ED]"
            }`}
          >
            Session
          </button>
        </div>

        {/* Connection + BPM/Key edit */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTempoModal(true)}
            className="font-mono text-[10px] font-bold text-[#2D2D2D]/50 hover:text-[#2D2D2D] transition-colors uppercase tracking-widest"
          >
            {session.bpm.toFixed(0)} BPM
          </button>
          <span className="text-[#2D2D2D]/20">·</span>
          <button
            onClick={() => setShowScaleModal(true)}
            className="font-mono text-[10px] font-bold text-[#E03030]/70 hover:text-[#E03030] transition-colors uppercase tracking-widest"
          >
            {session.key}
          </button>
          <span className="text-[#2D2D2D]/20">·</span>
          <div
            className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest ${
              abletonConnected ? "text-[#3da84a]" : "text-[#2D2D2D]/30"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                abletonConnected ? "bg-[#3da84a]" : "bg-[#2D2D2D]/20 animate-pulse"
              }`}
            />
            {abletonConnected ? "Live" : "Offline"}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === "arrangement" ? (
          <ArrangementView session={session} onCommand={sendCommand} />
        ) : (
          <div className="h-full px-6 pt-5 pb-24 overflow-y-auto custom-scrollbar flex flex-wrap gap-4 content-start">
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={session.tracks.map((t) => t.id)}
                strategy={rectSortingStrategy}
              >
                {session.tracks.map((track, i) => (
                  <TrackColumn
                    key={track.id}
                    track={track}
                    index={i}
                    onUpdate={updateTrack}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <div className="flex-1 min-w-[180px] h-56 border-2 border-dashed border-[#2D2D2D]/20 rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#2D2D2D]/40 hover:bg-white/40 transition-all group">
              <span className="font-mono text-xs text-[#2D2D2D]/30 group-hover:text-[#2D2D2D]/50 transition-colors">
                + new track
              </span>
            </div>
          </div>
        )}
      </div>

      {showTempoModal && (
        <TempoModal
          initialBpm={session.bpm}
          onConfirm={(newBpm) => setSession((s) => ({ ...s, bpm: newBpm }))}
          onClose={() => setShowTempoModal(false)}
        />
      )}
      {showScaleModal && (
        <ScaleModal
          initialKey={session.key}
          onConfirm={(key) => setSession((s) => ({ ...s, key }))}
          onClose={() => setShowScaleModal(false)}
        />
      )}
    </section>
  );
}
