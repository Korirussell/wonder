"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as Tone from "tone";
import { useDAWContext } from "@/lib/DAWContext";
import { useDAWEngine } from "@/lib/useDAWEngine";
import { useAudioAnalysis } from "@/lib/useAudioAnalysis";
import { toneEngine } from "@/lib/toneEngine";
import { DAWTransportBar } from "./DAWTransportBar";
import { DAWTrackList } from "./DAWTrackList";
import { DAWTimeline } from "./DAWTimeline";
import { DrumRack } from "./DrumRack";
import { MixerDrawer } from "./MixerDrawer";
import { KidsModeStage } from "./KidsModeStage";
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
  const [mixerOpen, setMixerOpen] = useState(false);
  const { analysis, analyzing, analyze } = useAudioAnalysis();
  const stateRef = useRef(state);
  const kidsPlaybackTokenRef = useRef(0);
  // Raw MediaStream from getUserMedia — used for both MediaRecorder and monitoring
  const rawStreamRef     = useRef<MediaStream | null>(null);
  const monitorNodeRef   = useRef<AudioNode | null>(null);
  const micGainNodeRef   = useRef<GainNode | null>(null);      // mic input boost
  const recordStreamRef  = useRef<MediaStream | null>(null);   // boosted stream fed to MediaRecorder
  const recordCtxRef     = useRef<AudioContext | null>(null);  // Web Audio ctx for gain chain
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRecordingRef = useRef<{
    trackId: string;
    startSec: number;
    stopSec: number | null;
    mimeType: string;
  } | null>(null);

  // Metronome + count-in state (local — no need to persist in DAWContext)
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn,   setCountInOn]   = useState(false);
  const countInRef = useRef(countInOn);
  useEffect(() => { countInRef.current = countInOn; }, [countInOn]);

  // Loopback-measured latency offset (null = not yet calibrated, use baseLatency fallback)
  const measuredLatencyRef  = useRef<number | null>(null);
  const [calibrating,       setCalibrating]  = useState(false);
  const [calibratedMs,      setCalibratedMs] = useState<number | null>(null);

  const handleCalibrate = useCallback(async () => {
    setCalibrating(true);
    try {
      await toneEngine.init();
      const sec = await toneEngine.measureRecordingLatency();
      measuredLatencyRef.current = sec;
      setCalibratedMs(Math.round(sec * 1000));
    } catch (e) {
      console.warn("[Calibrate]", e);
      setCalibratedMs(-1); // signal error in UI
    } finally {
      setCalibrating(false);
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const queueKidsPlayback = useCallback(async () => {
    const token = ++kidsPlaybackTokenRef.current;

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 220);
    });

    if (token !== kidsPlaybackTokenRef.current) return;

    stopPlayback();
    Tone.getTransport().seconds = 0;
    dispatch({
      type: "SET_TRANSPORT",
      payload: { currentMeasure: 1, isPlaying: false },
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    if (token !== kidsPlaybackTokenRef.current) return;
    await startPlayback();
  }, [dispatch, startPlayback, stopPlayback]);

  // Connect / disconnect mic stream to speakers for live monitoring
  const syncMonitorRouting = useCallback(() => {
    const stream = rawStreamRef.current;
    // Tear down previous monitor node first
    if (monitorNodeRef.current) {
      try { monitorNodeRef.current.disconnect(); } catch { /* ignore */ }
      monitorNodeRef.current = null;
    }
    if (!stream || !stateRef.current.recording.monitorEnabled) return;
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(ctx.destination);
      monitorNodeRef.current = src;
    } catch { /* ignore */ }
  }, []);

  // Toggle metronome via toneEngine
  const handleToggleMetronome = useCallback(() => {
    setMetronomeOn((prev) => {
      const next = !prev;
      toneEngine.setMetronome(next);
      return next;
    });
  }, []);

  useEffect(() => {
    syncMonitorRouting();
  }, [state.recording.monitorEnabled, syncMonitorRouting]);

  // Pre-warm: open mic stream eagerly so getUserMedia doesn't add latency at record time
  useEffect(() => {
    let cancelled = false;
    const warmUp = async () => {
      try {
        await toneEngine.init();
        if (cancelled) return;
        if (!rawStreamRef.current || rawStreamRef.current.getTracks().every((t) => t.readyState === "ended")) {
          rawStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
        }
      } catch { /* permission not granted yet — will retry on record */ }
    };
    void warmUp();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Tone.getTransport().loop = state.loop.loopEnabled;
    Tone.getTransport().loopStart = state.loop.loopStart;
    Tone.getTransport().loopEnd = state.loop.loopEnd;
  }, [state.loop]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
      try { monitorNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { recordCtxRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__wonderPlayFromStart = queueKidsPlayback;

    return () => {
      delete win.__wonderPlayFromStart;
    };
  }, [queueKidsPlayback]);

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

  const createRecordingTrack = useCallback((name?: string) => {
    const trackId = crypto.randomUUID();
    dispatch({
      type: "ADD_TRACK",
      payload: {
        id: trackId,
        name: name ?? `Record ${stateRef.current.tracks.length + 1}`,
        color: TRACK_COLORS[stateRef.current.tracks.length % TRACK_COLORS.length],
        muted: false,
        volume: 80,
      },
    });
    return trackId;
  }, [dispatch]);

  const ensureRecordTrack = useCallback((requestedTrackId?: string) => {
    const currentState = stateRef.current;
    const requestedTrack = requestedTrackId
      ? currentState.tracks.find((track) => track.id === requestedTrackId)
      : undefined;

    if (requestedTrack && !requestedTrack.audioBlob && !currentState.blocks.some((block) => block.trackId === requestedTrack.id)) {
      return requestedTrack.id;
    }

    const armedTrack = currentState.recording.armedTrackId
      ? currentState.tracks.find((track) => track.id === currentState.recording.armedTrackId)
      : undefined;

    if (armedTrack && !armedTrack.audioBlob && !currentState.blocks.some((block) => block.trackId === armedTrack.id)) {
      return armedTrack.id;
    }

    return createRecordingTrack(requestedTrack?.name ? `${requestedTrack.name} Take` : undefined);
  }, [createRecordingTrack]);

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

  const handleUpdateTrack = useCallback((id: string, patch: Partial<DAWTrack>) => {
    dispatch({ type: "UPDATE_TRACK", payload: { id, ...patch } });
  }, [dispatch]);

  const stopRecordingOnly = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    if (activeRecordingRef.current) {
      activeRecordingRef.current.stopSec = Tone.getTransport().seconds;
    }
    recorder.stop();
  }, []);

  const startRecording = useCallback(async (requestedTrackId?: string) => {
    if (stateRef.current.recording.isRecording) return;

    const trackId = ensureRecordTrack(requestedTrackId);

    // ── Step 1: All async pre-work BEFORE touching the recorder ──────────────
    // Do everything async here so recorder.start() + transport.start() can fire
    // back-to-back with zero awaits between them.
    await toneEngine.init();

    // Get mic stream (usually already open from warm-up effect above)
    if (!rawStreamRef.current || rawStreamRef.current.getTracks().every((t) => t.readyState === "ended")) {
      rawStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    }
    const rawStream = rawStreamRef.current;

    // ── Mic gain boost ───────────────────────────────────────────────────────
    if (recordCtxRef.current) {
      try { await recordCtxRef.current.close(); } catch { /* ignore */ }
    }
    const recordCtx = new AudioContext();
    recordCtxRef.current = recordCtx;
    const micSrc   = recordCtx.createMediaStreamSource(rawStream);
    const gainNode = recordCtx.createGain();
    gainNode.gain.value = 4;
    micGainNodeRef.current = gainNode;
    const destNode = recordCtx.createMediaStreamDestination();
    micSrc.connect(gainNode);
    gainNode.connect(destNode);
    recordStreamRef.current = destNode.stream;

    syncMonitorRouting();

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    // Pre-build the recorder but don't start it yet
    chunksRef.current = [];
    const recorder = new MediaRecorder(destNode.stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.onstop = async () => {
      const activeRecording = activeRecordingRef.current;
      mediaRecorderRef.current = null;

      if (!activeRecording) {
        dispatch({ type: "SET_RECORDING_STATE", payload: { isRecording: false, recordStartTime: null } });
        return;
      }

      const blob = new Blob(chunksRef.current, { type: activeRecording.mimeType });
      chunksRef.current = [];
      activeRecordingRef.current = null;

      let durationSec = Math.max(0.25, (activeRecording.stopSec ?? Tone.getTransport().seconds) - activeRecording.startSec);
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        durationSec = decoded.duration;
        await audioContext.close();
      } catch {
        // fall back to transport delta
      }

      const currentBpm = stateRef.current.transport.bpm;
      const secondsPerMeasure = (4 * 60) / currentBpm;
      const startMeasure = activeRecording.startSec / secondsPerMeasure + 1;
      const durationMeasures = Math.max(0.25, Math.ceil((durationSec / secondsPerMeasure) * 4) / 4);
      const file = new File([blob], `wonder-take-${Date.now()}.webm`, { type: activeRecording.mimeType });

      dispatch({
        type: "UPDATE_TRACK",
        payload: {
          id: activeRecording.trackId,
          audioDurationSec: durationSec,
        },
      });
      dispatch({ type: "LOAD_AUDIO", payload: { trackId: activeRecording.trackId, blob } });
      dispatch({
        type: "ADD_BLOCK",
        payload: {
          id: crypto.randomUUID(),
          trackId: activeRecording.trackId,
          name: `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          startMeasure,
          durationMeasures,
          color: stateRef.current.tracks.find((track) => track.id === activeRecording.trackId)?.color,
        },
      });
      analyze(file);

      dispatch({
        type: "SET_RECORDING_STATE",
        payload: {
          isRecording: false,
          recordStartTime: null,
          armedTrackId: activeRecording.trackId,
        },
      });
    };

    // ── Step 2: Count-in (still async, happens before we arm) ────────────────
    const doCountIn = countInRef.current;
    if (!stateRef.current.transport.isPlaying) {
      if (doCountIn) {
        const bpm = stateRef.current.transport.bpm;
        const barMs = (4 * 60 * 1000) / bpm;
        const wasMetronome = metronomeOn;
        toneEngine.setMetronome(true);
        await startPlayback();
        await new Promise<void>((resolve) => setTimeout(resolve, barMs));
        if (!wasMetronome) toneEngine.setMetronome(metronomeOn);
      }
      // If no count-in, DO NOT startPlayback here — we start it synchronously below
    }

    // ── Step 3: Arm recorder + start transport back-to-back (no awaits) ───────
    // Everything async is done. From here, recorder.start() and transport start
    // happen in the same JS microtask turn — minimising the timing gap.
    const needsPlay = !stateRef.current.transport.isPlaying;

    // Latency offset: prefer loopback-measured; fall back to outputLatency+baseLatency
    const streamLatency = measuredLatencyRef.current
      ?? Math.max(0, (recordCtx.outputLatency ?? 0) + (recordCtx.baseLatency ?? 0));

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    // Fire recorder + transport start synchronously
    recorder.start(10); // 10ms chunks — tighter buffer window
    const recordStartTime = Math.max(0, Tone.getTransport().seconds - streamLatency);

    activeRecordingRef.current = {
      trackId,
      startSec: recordStartTime,
      stopSec: null,
      mimeType,
    };

    if (needsPlay) {
      // startPlayback is async but we've already snapped recordStartTime above.
      // Fire it without await so the UI isn't blocked.
      void startPlayback();
    }

    dispatch({
      type: "SET_RECORDING_STATE",
      payload: {
        isRecording: true,
        armedTrackId: trackId,
        recordStartTime,
      },
    });
  }, [analyze, dispatch, ensureRecordTrack, metronomeOn, startPlayback, syncMonitorRouting]);

  const handleRecord = useCallback(() => {
    if (stateRef.current.recording.isRecording) {
      stopRecordingOnly();
      return;
    }

    void startRecording();
  }, [startRecording, stopRecordingOnly]);

  const handleTrackRecord = useCallback((trackId: string) => {
    if (stateRef.current.recording.isRecording) {
      stopRecordingOnly();
      return;
    }

    void startRecording(trackId);
  }, [startRecording, stopRecordingOnly]);

  const handleStop = useCallback(() => {
    if (stateRef.current.recording.isRecording) {
      stopRecordingOnly();
      dispatch({
        type: "SET_RECORDING_STATE",
        payload: {
          isRecording: false,
          recordStartTime: null,
        },
      });
    }
    stopPlayback();
  }, [dispatch, stopPlayback, stopRecordingOnly]);

  // ─── Global spacebar play/pause ──────────────────────────────────────────────
  // Mirrors Ableton's spacebar shortcut. Skips if focus is inside a text input.
  const handleSpacebar = useCallback((e: KeyboardEvent) => {
    if (e.code !== "Space") return;

    const el = document.activeElement;
    const tag = el?.tagName.toLowerCase() ?? "";
    if (
      tag === "input" ||
      tag === "textarea" ||
      (el as HTMLElement)?.isContentEditable
    ) return;

    e.preventDefault();

    if (Tone.getTransport().state === "started") {
      handleStop();
    } else {
      startPlayback();
    }
  }, [handleStop, startPlayback]);

  useEffect(() => {
    window.addEventListener("keydown", handleSpacebar);
    return () => window.removeEventListener("keydown", handleSpacebar);
  }, [handleSpacebar]);

  // ─── Transport Bar (shared between empty and populated state) ───────────────

  const analysisBadge = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t-2 border-[#1A1A1A] bg-[#FDFDFB]">
      {analyzing ? (
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 animate-pulse">
          ◌ Analyzing…
        </span>
      ) : analysis && !analysis.error ? (
        <>
          <div className="border-2 border-[#1A1A1A] bg-[#FDFDFB] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] px-2 py-0.5 font-mono text-[10px] font-bold">
            {analysis.bpm} BPM
          </div>
          <div className="border-2 border-[#1A1A1A] bg-[#A8D5A2] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] px-2 py-0.5 font-mono text-[10px] font-bold">
            {analysis.key}
          </div>
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
      onStop={handleStop}
      onRewind={() => seekTo(1)}
      onBPMChange={(bpm) => dispatch({ type: "SET_TRANSPORT", payload: { bpm } })}
      onExport={exportToWAV}
      drumsOpen={drumsOpen}
      onToggleDrums={() => setDrumsOpen((v) => !v)}
      onRecord={handleRecord}
      isRecording={state.recording.isRecording}
      loopEnabled={state.loop.loopEnabled}
      onToggleLoop={() =>
        dispatch({
          type: "SET_LOOP_STATE",
          payload: { loopEnabled: !state.loop.loopEnabled },
        })
      }
      monitorEnabled={state.recording.monitorEnabled}
      onToggleMonitor={() =>
        dispatch({
          type: "SET_RECORDING_STATE",
          payload: { monitorEnabled: !state.recording.monitorEnabled },
        })
      }
      mixerOpen={!state.kidsMode && mixerOpen}
      onToggleMixer={() => setMixerOpen((value) => (state.kidsMode ? false : !value))}
      kidsMode={state.kidsMode}
      metronomeOn={metronomeOn}
      onToggleMetronome={handleToggleMetronome}
      countInOn={countInOn}
      onToggleCountIn={() => setCountInOn((v) => !v)}
      calibrating={calibrating}
      calibratedMs={calibratedMs}
      onCalibrate={handleCalibrate}
    />
  );

  const drumRack = drumsOpen ? (
    <DrumRack
      pattern={state.drumPattern ?? { kick: Array(16).fill(false), snare: Array(16).fill(false), hihat: Array(16).fill(false), openHat: Array(16).fill(false) }}
      bpm={state.transport.bpm}
      onPatternChange={(patch: Partial<DrumPattern>) => dispatch({ type: "SET_DRUM_PATTERN", payload: patch })}
    />
  ) : null;

  const handleKidsPrompt = useCallback(async (prompt: string, title?: string) => {
    try {
      await toneEngine.init();
    } catch {
      // Keep the kids surface responsive even if Tone.init fails once.
    }

    window.dispatchEvent(new CustomEvent("wonder-kids-prompt", {
      detail: { prompt, title, autoplay: true, playFromStart: true },
    }));
  }, []);

  if (state.kidsMode) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FFFBEB]">
        <KidsModeStage
          onPrompt={handleKidsPrompt}
        />
      </div>
    );
  }

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
      {state.transport.isPlaying && !state.kidsMode ? (
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
      ) : null}
      <div className="flex-1 flex overflow-hidden">
        <DAWTrackList
          tracks={state.tracks}
          blocks={state.blocks}
          recordingTrackId={state.recording.armedTrackId}
          isRecording={state.recording.isRecording}
          kidsMode={state.kidsMode}
          onAddTrack={handleAddTrack}
          onUpdateTrack={handleUpdateTrack}
          onDeleteTrack={(id) => dispatch({ type: "DELETE_TRACK", payload: id })}
          onUploadAudio={handleUploadAudio}
          onRecordTrack={handleTrackRecord}
        />
        <DAWTimeline
          transport={state.transport}
          tracks={state.tracks}
          blocks={state.blocks}
          recording={state.recording}
          loop={state.loop}
          gridSize={state.gridSize}
          kidsMode={state.kidsMode}
          selectedBlockId={state.selectedBlockId}
          sampleLibrary={state.sampleLibrary}
          onSeek={seekTo}
          onUpdateBlock={(id, patch) =>
            dispatch({ type: "UPDATE_BLOCK", payload: { id, ...patch } })
          }
          onDeleteBlock={(id) =>
            dispatch({ type: "DELETE_BLOCK", payload: id })
          }
          onAddBlock={(block) =>
            dispatch({ type: "ADD_BLOCK", payload: block })
          }
          onSelectBlock={(id) =>
            dispatch({ type: "SET_SELECTED_BLOCK", payload: id })
          }
          onLoopChange={(patch) =>
            dispatch({ type: "SET_LOOP_STATE", payload: patch })
          }
          onGridSizeChange={(gridSize) =>
            dispatch({ type: "SET_GRID_SIZE", payload: gridSize })
          }
        />
      </div>
      {state.kidsMode ? null : (
        <MixerDrawer
          open={mixerOpen}
          tracks={state.tracks}
          onClose={() => setMixerOpen(false)}
          onUpdateTrack={handleUpdateTrack}
        />
      )}
      {drumRack}
      {analysisBadge}
      {transportBar}
    </div>
  );
}
