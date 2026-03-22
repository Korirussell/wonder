"use client";

import { getAudio, storeAudio } from "./audioLocalStorage";
import type { DAWBlock, DAWGridSize, DAWLoopState, DAWRecordingState, DAWState, DAWTrack, DrumPattern, SampleLibraryEntry } from "@/types";

const SESSION_STORAGE_KEY = "wonder_saved_sessions_v1";
const MAX_SAVED_SESSIONS = 8;

type SessionTrackSnapshot = Omit<DAWTrack, "audioBlob" | "waveformCache">;

interface SavedSessionSnapshot {
  id: string;
  name: string;
  savedAt: number;
  transport: DAWState["transport"];
  tracks: SessionTrackSnapshot[];
  blocks: DAWBlock[];
  sampleLibrary: SampleLibraryEntry[];
  recording: DAWRecordingState;
  loop: DAWLoopState;
  gridSize: DAWGridSize;
  kidsMode: boolean;
  drumPattern?: DrumPattern;
}

export interface SavedSessionMeta {
  id: string;
  name: string;
  savedAt: number;
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readSnapshots(): SavedSessionSnapshot[] {
  if (!canUseBrowserStorage()) return [];

  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSessionSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: SavedSessionSnapshot[]) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshots.slice(0, MAX_SAVED_SESSIONS)));
  window.dispatchEvent(new CustomEvent("wonder-sessions-changed"));
}

function inferAudioType(trackName: string): "main" | "bass" | "chords" | "melody" | "percussion" {
  const lower = trackName.toLowerCase();
  if (/(kick|snare|hat|drum|perc)/.test(lower)) return "percussion";
  if (/(bass|sub|808)/.test(lower)) return "bass";
  if (/(chord|pad|string|rhodes|organ)/.test(lower)) return "chords";
  if (/(lead|melody|arp|flute|glock|piano)/.test(lower)) return "melody";
  return "main";
}

function makeSessionName(state: DAWState) {
  const primaryTrack = state.tracks[0]?.name ?? "Session";
  const stamp = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${primaryTrack} · ${stamp}`;
}

export function listSavedSessions(): SavedSessionMeta[] {
  return readSnapshots().map(({ id, name, savedAt }) => ({ id, name, savedAt }));
}

export async function saveSessionSnapshot(state: DAWState, customName?: string): Promise<SavedSessionMeta> {
  const sessionId = crypto.randomUUID();
  const savedAt = Date.now();
  const name = customName?.trim() || makeSessionName(state);

  const tracks = await Promise.all(
    state.tracks.map(async (track) => {
      let audioStorageId = track.audioStorageId;
      if (track.audioBlob) {
        audioStorageId = `session:${sessionId}:track:${track.id}`;
        await storeAudio(audioStorageId, track.audioBlob, {
          type: inferAudioType(track.name),
          prompt: track.name,
          createdAt: new Date(savedAt).toISOString(),
        });
      }

      const { audioBlob, waveformCache, ...trackSnapshot } = track;
      void audioBlob;
      void waveformCache;
      return {
        ...trackSnapshot,
        audioStorageId,
      };
    }),
  );

  const snapshot: SavedSessionSnapshot = {
    id: sessionId,
    name,
    savedAt,
    transport: state.transport,
    tracks,
    blocks: state.blocks,
    sampleLibrary: [],
    recording: {
      isRecording: false,
      armedTrackId: null,
      recordStartTime: null,
      monitorEnabled: state.recording.monitorEnabled,
    },
    loop: state.loop,
    gridSize: state.gridSize,
    kidsMode: false,
    drumPattern: state.drumPattern,
  };

  const existing = readSnapshots().filter((entry) => entry.id !== sessionId);
  writeSnapshots([snapshot, ...existing]);

  return { id: sessionId, name, savedAt };
}

export async function loadSessionSnapshot(sessionId?: string): Promise<DAWState | null> {
  const snapshots = readSnapshots();
  const snapshot = sessionId
    ? snapshots.find((entry) => entry.id === sessionId)
    : snapshots[0];

  if (!snapshot) return null;

  const tracks: DAWTrack[] = await Promise.all(
    snapshot.tracks.map(async (track) => {
      if (!track.audioStorageId) return track;
      const stored = await getAudio(track.audioStorageId);
      if (!stored) return track;
      return {
        ...track,
        audioBlob: stored.blob,
      };
    }),
  );

  return {
    transport: {
      ...snapshot.transport,
      isPlaying: false,
      currentMeasure: 1,
    },
    tracks,
    blocks: snapshot.blocks,
    selectedBlockId: null,
    drumPattern: snapshot.drumPattern,
    sampleLibrary: snapshot.sampleLibrary,
    recording: snapshot.recording,
    loop: snapshot.loop,
    gridSize: snapshot.gridSize,
    kidsMode: snapshot.kidsMode,
  };
}
