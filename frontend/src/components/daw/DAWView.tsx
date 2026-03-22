"use client";

import { useState } from "react";
import { useDAWContext } from "@/lib/DAWContext";
import { useDAWEngine } from "@/lib/useDAWEngine";
import { DAWTransportBar } from "./DAWTransportBar";
import { DAWTrackList } from "./DAWTrackList";
import { DAWTimeline } from "./DAWTimeline";
import { DrumRack } from "./DrumRack";
import ToneWaveformViz from "@/components/ToneWaveformViz";
import type { DAWTrack, DrumPattern } from "@/types";

const TRACK_COLORS = [
  "#C1E1C1",
  "#E9D5FF",
  "#FEF08A",
  "#FCA5A5",
  "#BAE6FD",
  "#DDD6FE",
  "#BBF7D0",
  "#FED7AA",
];

export default function DAWView() {
  const { state, dispatch } = useDAWContext();
  const { startPlayback, stopPlayback, seekTo, exportToWAV } = useDAWEngine({
    state,
    dispatch: dispatch as React.Dispatch<{ type: string; payload?: unknown }>,
  });
  const [drumsOpen, setDrumsOpen] = useState(false);

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
      <div className="flex-1 flex flex-col bg-[#FDFDFB]">
        {transportBar}
        {drumRack}
        <div className="flex-1 flex items-center justify-center">
          <div className="border-2 border-dashed border-[#2D2D2D]/20 rounded-2xl p-14 text-center max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-[#2D2D2D] flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-lg">+</span>
            </div>
            <p className="font-headline text-sm font-extrabold text-[#2D2D2D] uppercase tracking-widest">
              No tracks yet
            </p>
            <p className="font-body text-[11px] text-[#2D2D2D]/40 mt-1">
              Add a track to start building your session
            </p>
            <button
              onClick={handleAddTrack}
              className="mt-5 border-2 border-[#2D2D2D] rounded-xl px-6 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest interactive-push bg-white hard-shadow"
            >
              + Add Track
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Full DAW layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FDFDFB]">
      {transportBar}
      {drumRack}
      {/* Live waveform visualizer — visible when playing */}
      {state.transport.isPlaying && (
        <div className="h-10 bg-[#1A1A1A] border-b border-[#2D2D2D] flex items-center px-4 shrink-0">
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-white/25 mr-3 shrink-0">Live</span>
          <ToneWaveformViz
            width={800}
            height={32}
            mode="waveform"
            color="#4CAF50"
            className="flex-1 opacity-80"
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
    </div>
  );
}
