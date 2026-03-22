"use client";

import { useState } from "react";
import { useDAWContext } from "@/lib/DAWContext";
import { useDAWEngine } from "@/lib/useDAWEngine";
import { useAudioAnalysis } from "@/lib/useAudioAnalysis";
import { DAWTransportBar } from "./DAWTransportBar";
import { DAWTrackList } from "./DAWTrackList";
import { DAWTimeline } from "./DAWTimeline";
import { DrumRack } from "./DrumRack";
import ToneWaveformViz from "@/components/ToneWaveformViz";
import type { DAWTrack, DrumPattern } from "@/types";

// DAW clip colors — sage greens, yellows, muted tones matching the mockup
const TRACK_COLORS = [
  "#A8D5A2", // sage green
  "#F0E08A", // muted yellow
  "#9ECFCC", // muted teal
  "#F0C080", // warm amber
  "#B8D4F0", // muted blue
  "#D4A8D0", // muted lavender
  "#BCE8B0", // light green
  "#F0B8A8", // muted coral
];

export default function DAWView() {
  const { state, dispatch } = useDAWContext();
  const { startPlayback, stopPlayback, seekTo, exportToWAV } = useDAWEngine({
    state,
    dispatch: dispatch as React.Dispatch<{ type: string; payload?: unknown }>,
  });
  const [drumsOpen, setDrumsOpen] = useState(false);
  const { analysis, analyzing, analyze } = useAudioAnalysis();

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleAddTrack = () => {
    const newTrack: DAWTrack = {
      id: crypto.randomUUID(),
      name: `Track ${state.tracks.length + 1}`,
      color: TRACK_COLORS[state.tracks.length % TRACK_COLORS.length],
      muted: false,
      volume: 80,
    };
    dispatch({ type: "ADD_TRACK", payload: newTrack });
  };

  const handleUploadAudio = async (trackId: string, file: File) => {
    const blob = new Blob([file], { type: file.type });
    dispatch({ type: "LOAD_AUDIO", payload: { trackId, blob } });
    analyze(file);
    // Auto-create a block at measure 1 if none exists for this track
    if (!state.blocks.find((b) => b.trackId === trackId)) {
      // Calculate actual duration in measures
      let durationMeasures = 4;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const tempCtx = new AudioContext();
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        await tempCtx.close();
        const secondsPerMeasure = (4 * 60) / state.transport.bpm;
        durationMeasures = Math.max(1, Math.ceil(audioBuffer.duration / secondsPerMeasure));
      } catch {
        // fallback to 4 measures
      }
      dispatch({
        type: "ADD_BLOCK",
        payload: {
          id: crypto.randomUUID(),
          trackId,
          name: file.name.replace(/\.[^/.]+$/, ""),
          startMeasure: 1,
          durationMeasures,
        },
      });
    }
  };

  // ─── Transport Bar (shared between empty and populated state) ───────────────

  const analysisBadge = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t-2 border-[#1A1A1A] bg-[#FDFDFB]">
      {analyzing ? (
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 animate-pulse">
          ◌ Analyzing…
        </span>
      ) : analysis ? (
        <>
          <div className="border-2 border-[#1A1A1A] bg-[#FDFDFB] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] px-2 py-0.5 font-mono text-[10px] font-bold">
            {analysis.bpm} BPM
          </div>
          <div className="border-2 border-[#1A1A1A] bg-[#A8D5A2] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] px-2 py-0.5 font-mono text-[10px] font-bold">
            {analysis.key}
          </div>
          {analysis.error && (
            <span className="font-mono text-[9px] text-[#1A1A1A]/30 ml-1">
              (estimated)
            </span>
          )}
        </>
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/20">
          Record a loop to detect key + BPM
        </span>
      )}
    </div>
  );

  const transportBar = (
    <DAWTransportBar
      transport={state.transport}
      onPlay={startPlayback}
      onStop={stopPlayback}
      onRewind={() => seekTo(1)}
      onBPMChange={(bpm) => dispatch({ type: "SET_TRANSPORT", payload: { bpm } })}
      onExport={exportToWAV}
      drumsOpen={drumsOpen}
      onToggleDrums={() => setDrumsOpen((v) => !v)}
    />
  );

  const drumRack = drumsOpen ? (
    <DrumRack
      pattern={state.drumPattern ?? { kick: Array(16).fill(false), snare: Array(16).fill(false), hihat: Array(16).fill(false), openHat: Array(16).fill(false) }}
      bpm={state.transport.bpm}
      onPatternChange={(patch: Partial<DrumPattern>) => dispatch({ type: "SET_DRUM_PATTERN", payload: patch })}
    />
  ) : null;

  // ─── Empty state ─────────────────────────────────────────────────────────────

  if (state.tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-[#F8F8F4]">
        <div className="flex-1 flex items-center justify-center">
          <div className="border border-dashed border-[#2D2D2D]/20 rounded-2xl p-14 text-center max-w-sm bg-white/60">
            <div className="w-11 h-11 rounded-xl bg-[#A8D5A2] flex items-center justify-center mx-auto mb-4 border border-[#2D2D2D]/10">
              <span className="text-[#1a1a1a] text-lg font-bold">+</span>
            </div>
            <p className="font-mono text-[11px] font-bold text-[#2D2D2D]/70 uppercase tracking-widest">
              No tracks yet
            </p>
            <p className="font-mono text-[10px] text-[#2D2D2D]/35 mt-1.5">
              Add a track to start your session
            </p>
            <button
              onClick={handleAddTrack}
              className="mt-5 border border-[#2D2D2D]/30 rounded-lg px-6 py-2 font-mono text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-[#F0F0EB] hover:border-[#2D2D2D]/50 transition-colors"
            >
              + Add Track
            </button>
          </div>
        </div>
        {drumRack}
        {analysisBadge}
        {transportBar}
      </div>
    );
  }

  // ─── Full DAW layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F8F8F4]">
      {/* Live waveform visualizer — visible when playing */}
      {state.transport.isPlaying && (
        <div className="h-8 bg-[#1C1C1C] border-b border-white/5 flex items-center px-4 shrink-0">
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-white/20 mr-3 shrink-0">● LIVE</span>
          <ToneWaveformViz
            width={800}
            height={24}
            mode="waveform"
            color="#A8D5A2"
            className="flex-1 opacity-70"
          />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <DAWTrackList
          tracks={state.tracks}
          blocks={state.blocks}
          onAddTrack={handleAddTrack}
          onUpdateTrack={(id, patch) =>
            dispatch({ type: "UPDATE_TRACK", payload: { id, ...patch } })
          }
          onDeleteTrack={(id) => dispatch({ type: "DELETE_TRACK", payload: id })}
          onUploadAudio={handleUploadAudio}
        />
        <DAWTimeline
          transport={state.transport}
          tracks={state.tracks}
          blocks={state.blocks}
          selectedBlockId={state.selectedBlockId}
          onSeek={seekTo}
          onUpdateBlock={(id, patch) =>
            dispatch({ type: "UPDATE_BLOCK", payload: { id, ...patch } })
          }
          onDeleteBlock={(id) =>
            dispatch({ type: "DELETE_BLOCK", payload: id })
          }
          onSelectBlock={(id) =>
            dispatch({ type: "SET_SELECTED_BLOCK", payload: id })
          }
        />
      </div>
      {drumRack}
      {analysisBadge}
      {transportBar}
    </div>
  );
}
