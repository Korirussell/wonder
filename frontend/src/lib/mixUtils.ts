"use client";

import type { DAWGridSize, DAWTrack } from "@/types";

export const TRACK_VOLUME_DB_MIN = -60;
export const TRACK_VOLUME_DB_MAX = 6;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function volumePercentToDb(volume: number) {
  const safeVolume = clamp(volume, 0, 100);
  const ratio = safeVolume / 100;
  return TRACK_VOLUME_DB_MIN + ratio * (TRACK_VOLUME_DB_MAX - TRACK_VOLUME_DB_MIN);
}

export function dbToVolumePercent(db: number) {
  const safeDb = clamp(db, TRACK_VOLUME_DB_MIN, TRACK_VOLUME_DB_MAX);
  return Math.round(((safeDb - TRACK_VOLUME_DB_MIN) / (TRACK_VOLUME_DB_MAX - TRACK_VOLUME_DB_MIN)) * 100);
}

export function withTrackMixDefaults(track: DAWTrack): DAWTrack {
  const hasVolumeDb = typeof track.volumeDb === "number" && Number.isFinite(track.volumeDb);
  const volumeDb = hasVolumeDb ? track.volumeDb! : volumePercentToDb(track.volume ?? 80);
  const volume = typeof track.volume === "number" && Number.isFinite(track.volume)
    ? clamp(Math.round(track.volume), 0, 100)
    : dbToVolumePercent(volumeDb);

  return {
    ...track,
    volume,
    volumeDb,
    pan: clamp(track.pan ?? 0, -1, 1),
    solo: track.solo ?? false,
    mixAnimating: track.mixAnimating ?? false,
  };
}

export function normalizeTrackPatch(patch: Partial<DAWTrack>): Partial<DAWTrack> {
  const next = { ...patch };

  if (typeof next.volume === "number" && Number.isFinite(next.volume)) {
    next.volume = clamp(Math.round(next.volume), 0, 100);
    if (typeof next.volumeDb !== "number" || !Number.isFinite(next.volumeDb)) {
      next.volumeDb = volumePercentToDb(next.volume);
    }
  }

  if (typeof next.volumeDb === "number" && Number.isFinite(next.volumeDb)) {
    next.volumeDb = clamp(next.volumeDb, TRACK_VOLUME_DB_MIN, TRACK_VOLUME_DB_MAX);
    if (typeof next.volume !== "number" || !Number.isFinite(next.volume)) {
      next.volume = dbToVolumePercent(next.volumeDb);
    }
  }

  if (typeof next.pan === "number" && Number.isFinite(next.pan)) {
    next.pan = clamp(next.pan, -1, 1);
  }

  return next;
}

export function gridSizeToMeasureStep(gridSize: DAWGridSize) {
  return 4 / gridSize;
}
