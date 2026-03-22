"use client";

import { useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import type { DAWState, DAWTransport } from "@/types";
import { toneEngine } from "./toneEngine";
import { volumePercentToDb } from "./mixUtils";

// ─── WAV Encoder ──────────────────────────────────────────────────────────────

function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length * numChannels;
  const dataSize = samples * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  // RIFF header
  const writeStr = (off: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// ─── Hook Interface ───────────────────────────────────────────────────────────

interface UseDAWEngineProps {
  state: DAWState;
  dispatch: React.Dispatch<{ type: string; payload?: unknown }>;
}

interface DAWEngineReturn {
  startPlayback: () => Promise<void>;
  stopPlayback: () => void;
  seekTo: (measure: number) => void;
  exportToWAV: () => Promise<void>;
}

// ─── Hook (Tone.js powered) ──────────────────────────────────────────────────

export function useDAWEngine({ state, dispatch }: UseDAWEngineProps): DAWEngineReturn {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentMeasureRef = useRef<number>(state.transport.currentMeasure);
  const stateRef = useRef<DAWState>(state);
  const loadedBlobsRef = useRef<Map<string, string>>(new Map()); // trackId → blobFingerprint

  // Keep refs current
  useEffect(() => {
    stateRef.current = state;
    currentMeasureRef.current = state.transport.currentMeasure;
  });

  // Sync BPM to Tone.Transport whenever it changes
  useEffect(() => {
    if (toneEngine.isReady()) {
      toneEngine.setBPM(state.transport.bpm);
    }
  }, [state.transport.bpm]);

  // Load track audio blobs into toneEngine stems
  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentTracks = stateRef.current.tracks;
    const validIds = new Set(currentTracks.map((t) => t.id));

    // Clean up removed tracks from toneEngine
    loadedBlobsRef.current.forEach((_, trackId) => {
      if (!validIds.has(trackId)) {
        loadedBlobsRef.current.delete(trackId);
        toneEngine.removeStem(trackId);
      }
    });

    // Load new/updated blobs
    currentTracks.forEach((track) => {
      if (!track.audioBlob) return;

      const fingerprint = `${track.audioBlob.size}-${track.audioBlob.type}`;
      const prev = loadedBlobsRef.current.get(track.id);

      if (prev !== fingerprint) {
        loadedBlobsRef.current.set(track.id, fingerprint);
        const loopConfig = track.loop
          ? { loop: true, durationSeconds: track.loopDurationSec }
          : undefined;
        toneEngine.loadStemFromBlob(track.id, track.name, track.audioBlob, loopConfig)
          .then(() => {
            const durationSec = toneEngine.getStemDuration(track.id);
            if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) return;

            // Update audioDurationSec on the track
            if (Math.abs((stateRef.current.tracks.find((t) => t.id === track.id)?.audioDurationSec ?? 0) - durationSec) > 0.01) {
              dispatch({
                type: "UPDATE_TRACK",
                payload: { id: track.id, audioDurationSec: durationSec },
              });
            }

            // Sync durationMeasures on all non-sliced blocks for this track to the
            // actual buffer duration so visual width matches real audio length.
            const bpm = stateRef.current.transport.bpm;
            const spm = (4 * 60) / bpm;
            const accurateDurationMeasures = durationSec / spm;
            stateRef.current.blocks
              .filter((b) => b.trackId === track.id && !b.bufferOffsetSec)
              .forEach((b) => {
                if (Math.abs(b.durationMeasures - accurateDurationMeasures) > 0.01) {
                  dispatch({
                    type: "UPDATE_BLOCK",
                    payload: { id: b.id, durationMeasures: accurateDurationMeasures },
                  });
                }
              });
          })
          .catch(() => {
            console.warn(`[useDAWEngine] Failed to load stem: ${track.name}`);
          });
      }

      const durationSec = toneEngine.getStemDuration(track.id);
      if (
        typeof durationSec === "number" &&
        Number.isFinite(durationSec) &&
        Math.abs((track.audioDurationSec ?? 0) - durationSec) > 0.01
      ) {
        dispatch({
          type: "UPDATE_TRACK",
          payload: { id: track.id, audioDurationSec: durationSec },
        });
      }

      // Sync volume/mute
      if (toneEngine.isReady()) {
        const db = track.volumeDb ?? volumePercentToDb(track.volume);
        toneEngine.setStemVolume(track.id, db);
        toneEngine.setStemPan(track.id, track.pan ?? 0);
        toneEngine.muteStem(track.id, track.muted);
        toneEngine.setStemSolo(track.id, track.solo ?? false);
      }
    });
  }, [dispatch, state.tracks]);

  // ─── startPlayback ──────────────────────────────────────────────────────────

  const ensureTrackStemsLoaded = useCallback(async (): Promise<void> => {
    const currentTracks = stateRef.current.tracks;
    await Promise.all(
      currentTracks.map(async (track) => {
        if (!track.audioBlob) return;

        const fingerprint = `${track.audioBlob.size}-${track.audioBlob.type}`;
        const prev = loadedBlobsRef.current.get(track.id);
        if (prev === fingerprint) return;

        loadedBlobsRef.current.set(track.id, fingerprint);
        const loopConfig = track.loop
          ? { loop: true, durationSeconds: track.loopDurationSec }
          : undefined;

        await toneEngine.loadStemFromBlob(track.id, track.name, track.audioBlob, loopConfig);
        const durationSec = toneEngine.getStemDuration(track.id);
        if (
          typeof durationSec === "number" &&
          Number.isFinite(durationSec) &&
          Math.abs((stateRef.current.tracks.find((t) => t.id === track.id)?.audioDurationSec ?? 0) - durationSec) > 0.01
        ) {
          dispatch({
            type: "UPDATE_TRACK",
            payload: { id: track.id, audioDurationSec: durationSec },
          });
        }
      }),
    );
  }, [dispatch]);

  const startPlayback = useCallback(async (): Promise<void> => {
    if (stateRef.current.transport.isPlaying) return;

    // Ensure toneEngine is initialized (handles Tone.start() for user gesture)
    await toneEngine.init();
    toneEngine.setBPM(stateRef.current.transport.bpm);
    await ensureTrackStemsLoaded();

    // Start all loaded stems synced to the Transport at their block positions.
    // Each track may have >1 block after razor-slicing; schedule all of them
    // by stacking multiple .start() calls on the same synced player.
    const secondsPerMeasure = (60 / stateRef.current.transport.bpm) * 4;

    // Group blocks by trackId so we can detect multi-block tracks
    const blocksByTrack = new Map<string, typeof stateRef.current.blocks>();
    stateRef.current.blocks.forEach((b) => {
      const arr = blocksByTrack.get(b.trackId) ?? [];
      arr.push(b);
      blocksByTrack.set(b.trackId, arr);
    });

    stateRef.current.tracks.forEach((track) => {
      if (!track.audioBlob || track.muted) return;
      const blocks = blocksByTrack.get(track.id);
      if (!blocks || blocks.length === 0) return;

      // Sort ascending so the first block triggers the unsync/resync
      const sorted = [...blocks].sort((a, b) => a.startMeasure - b.startMeasure);
      sorted.forEach((block, i) => {
        const transportStartSec = (block.startMeasure - 1) * secondsPerMeasure;
        const durationSec       = block.durationMeasures * secondsPerMeasure;
        const bufferOffsetSec   = block.bufferOffsetSec ?? 0;
        toneEngine.playStem(track.id, transportStartSec, bufferOffsetSec, durationSec, i === 0);
      });
    });

    // Start Tone.Transport
    await toneEngine.play();

    dispatch({ type: "SET_TRANSPORT", payload: { isPlaying: true } as Partial<DAWTransport> });

    // Tick interval: poll Tone.Transport position directly so the playhead
    // never drifts from the audio engine regardless of timer jitter.
    intervalRef.current = setInterval(() => {
      const s = stateRef.current;
      const transportSec = Tone.getTransport().seconds;
      const rawMeasure = transportSec / secondsPerMeasure + 1;

      // Loop at totalMeasures
      const nextMeasure = rawMeasure >= s.transport.totalMeasures ? 1 : rawMeasure;
      currentMeasureRef.current = nextMeasure;

      dispatch({
        type: "SET_TRANSPORT",
        payload: { currentMeasure: nextMeasure } as Partial<DAWTransport>,
      });
    }, 50); // 50ms poll — tight enough for smooth playhead, cheap enough to not stutter
  }, [dispatch, ensureTrackStemsLoaded]);

  // ─── stopPlayback ───────────────────────────────────────────────────────────

  const stopPlayback = useCallback((): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    toneEngine.stop();

    // Stop all stems
    stateRef.current.tracks.forEach((track) => {
      toneEngine.stopStem(track.id);
    });

    dispatch({ type: "SET_TRANSPORT", payload: { isPlaying: false, currentMeasure: 1 } as Partial<DAWTransport> });
    currentMeasureRef.current = 1;
  }, [dispatch]);

  // ─── seekTo ─────────────────────────────────────────────────────────────────

  const seekTo = useCallback((measure: number): void => {
    const wasPlaying = stateRef.current.transport.isPlaying;
    if (wasPlaying) stopPlayback();
    currentMeasureRef.current = measure;
    dispatch({ type: "SET_TRANSPORT", payload: { currentMeasure: measure } as Partial<DAWTransport> });
    if (wasPlaying) {
      setTimeout(() => startPlayback(), 0);
    } else {
      // Move rAF playhead to the seek point without starting transport
      const spm = (60 / stateRef.current.transport.bpm) * 4;
      Tone.getTransport().seconds = (measure - 1) * spm;
    }
  }, [dispatch, stopPlayback, startPlayback]);

  // ─── exportToWAV (still uses OfflineAudioContext for best quality) ─────────

  const exportToWAV = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") return;

    const s = stateRef.current;
    const sampleRate = 44100;
    const timelineDurationSeconds =
      ((s.transport.totalMeasures * 60) / s.transport.bpm) * 4;

    const offlineContext = new OfflineAudioContext(
      2,
      Math.ceil(sampleRate * timelineDurationSeconds),
      sampleRate
    );

    const scheduled: { buffer: AudioBuffer; startTime: number }[] = [];

    for (const block of s.blocks) {
      const track = s.tracks.find((t) => t.id === block.trackId);
      if (!track || !track.audioBlob || track.muted) continue;

      try {
        const audioData = await track.audioBlob.arrayBuffer();
        const audioBuffer = await offlineContext.decodeAudioData(audioData);
        const startSeconds = (((block.startMeasure - 1) * 60) / s.transport.bpm) * 4;
        scheduled.push({ buffer: audioBuffer, startTime: startSeconds });
      } catch {
        // skip undecodable tracks
      }
    }

    scheduled.forEach(({ buffer, startTime }) => {
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(startTime);
    });

    try {
      const renderedBuffer = await offlineContext.startRendering();
      const wavBlob = encodeWAV(renderedBuffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wonder-export-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  }, []);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { startPlayback, stopPlayback, seekTo, exportToWAV };
}
