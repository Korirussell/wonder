/**
 * Session State Tracker for Wonder
 * Maintains coherent state across Gemini's tool calls
 */

export interface SessionClip {
  index: number;
  length: number;
  notes?: number[][];
  notes_count?: number;
  pattern_type?: string;
}

export interface SessionTrack {
  index: number;
  name: string;
  type: "midi" | "audio";
  instrument: string | null;
  instrument_loaded: boolean;
  preset?: string;
  clips: SessionClip[];
}

export interface SessionState {
  bpm: number;
  key: string;
  scale: string;
  time_signature: string;
  swing: number;
  tracks: SessionTrack[];
  chord_progression: string[];
  melody_motif: number[][];
  last_updated: number;
}

export function createInitialState(): SessionState {
  return {
    bpm: 120,
    key: "C",
    scale: "major",
    time_signature: "4/4",
    swing: 0,
    tracks: [],
    chord_progression: [],
    melody_motif: [],
    last_updated: Date.now(),
  };
}

export function updateStateAfterToolCall(
  state: SessionState,
  toolName: string,
  params: Record<string, unknown>,
  result: unknown
): SessionState {
  const newState = { ...state, last_updated: Date.now() };
  const toolResult = (result ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "set_tempo":
      newState.bpm = params.tempo as number;
      break;

    case "set_swing_amount":
      newState.swing = params.amount as number;
      break;

    case "create_midi_track":
    case "create_audio_track":
      const createdTrackIndex = typeof toolResult.index === "number"
        ? toolResult.index
        : (params.index as number);
      const createdTrackName = typeof toolResult.name === "string"
        ? toolResult.name
        : `Track ${createdTrackIndex}`;
      newState.tracks.push({
        index: createdTrackIndex,
        name: createdTrackName,
        type: toolName === "create_midi_track" ? "midi" : "audio",
        instrument: null,
        instrument_loaded: false,
        clips: [],
      });
      break;

    case "set_track_name":
      const trackToRename = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackToRename) {
        trackToRename.name = params.name as string;
      }
      break;

    case "load_instrument_or_effect":
    case "load_browser_item":
      const trackToLoadInstrument = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackToLoadInstrument) {
        trackToLoadInstrument.instrument = (params.uri as string) || (params.item_uri as string) || "Unknown";
        trackToLoadInstrument.instrument_loaded = true;
      }
      break;

    case "load_drum_kit":
      const trackToLoadDrumKit = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackToLoadDrumKit) {
        trackToLoadDrumKit.instrument = (toolResult.kit_name as string) || (params.kit_path as string) || "Drum Kit";
        trackToLoadDrumKit.instrument_loaded = true;
      }
      break;

    case "create_clip":
      const trackToAddClip = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackToAddClip) {
        trackToAddClip.clips.push({
          index: params.clip_index as number,
          length: params.length as number,
          notes: [],
          notes_count: 0,
        });
      }
      break;

    case "add_notes_to_clip":
      const trackWithNotes = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackWithNotes) {
        const clip = trackWithNotes.clips.find(
          (c) => c.index === params.clip_index
        );
        if (clip) {
          clip.notes = params.notes as number[][];
          clip.notes_count = (params.notes as unknown[]).length;
        }
      }
      break;

    case "delete_track": {
      const deleteIdx = params.track_index as number;
      newState.tracks = newState.tracks
        .filter((t) => t.index !== deleteIdx)
        .map((t) => ({
          ...t,
          // Shift indices down for tracks after the deleted one
          index: t.index > deleteIdx ? t.index - 1 : t.index,
        }));
      break;
    }

    case "delete_clip": {
      const trackForClipDelete = newState.tracks.find((t) => t.index === params.track_index);
      if (trackForClipDelete) {
        trackForClipDelete.clips = trackForClipDelete.clips.filter(
          (c) => c.index !== (params.clip_index as number)
        );
      }
      break;
    }

    case "get_track_info":
    case "get_browser_tree":
    case "get_browser_items_at_path":
    case "search_browser":
      // Read-only tools — no state update needed
      break;
  }

  return newState;
}

export function getTrackByIndex(state: SessionState, index: number): SessionTrack | undefined {
  return state.tracks.find((t) => t.index === index);
}

export function isInstrumentLoaded(state: SessionState, trackIndex: number): boolean {
  const track = getTrackByIndex(state, trackIndex);
  return track?.instrument_loaded ?? false;
}

export function getChordProgression(state: SessionState): string[] {
  return state.chord_progression;
}

export function setChordProgression(state: SessionState, chords: string[]): SessionState {
  return {
    ...state,
    chord_progression: chords,
    last_updated: Date.now(),
  };
}

export function getMelodyMotif(state: SessionState): number[][] {
  return state.melody_motif;
}

export function setMelodyMotif(state: SessionState, motif: number[][]): SessionState {
  return {
    ...state,
    melody_motif: motif,
    last_updated: Date.now(),
  };
}

export function serializeState(state: SessionState): string {
  return JSON.stringify(state, null, 2);
}

export function deserializeState(json: string): SessionState {
  try {
    return JSON.parse(json) as SessionState;
  } catch {
    return createInitialState();
  }
}
