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

  switch (toolName) {
    case "set_tempo":
      newState.bpm = params.tempo as number;
      break;

    case "set_swing_amount":
      newState.swing = params.amount as number;
      break;

    case "create_midi_track":
    case "create_audio_track":
      newState.tracks.push({
        index: params.index as number,
        name: `Track ${params.index}`,
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

    case "load_browser_item":
    case "load_plugin_by_name":
      const trackToLoadInstrument = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackToLoadInstrument) {
        trackToLoadInstrument.instrument =
          (params.item_uri as string) || (params.plugin_name as string) || "Unknown";
        trackToLoadInstrument.instrument_loaded = true;
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

    case "create_wonder_session":
      // Extract session-level info from create_wonder_session params
      if (params.bpm) newState.bpm = params.bpm as number;
      if (params.swing) newState.swing = params.swing as number;
      if (params.key_root !== undefined && params.scale) {
        const keyMap = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
        newState.key = keyMap[params.key_root as number] || "C";
        newState.scale = params.scale as string;
      }
      // Tracks will be added via subsequent create_midi_track calls
      break;

    case "generate_drum_pattern":
    case "generate_bassline":
      const trackWithPattern = newState.tracks.find(
        (t) => t.index === params.track_index
      );
      if (trackWithPattern) {
        const clip = trackWithPattern.clips.find(
          (c) => c.index === params.clip_index
        );
        if (clip) {
          clip.pattern_type = (params.style as string) || (params.root as string) || "generated";
        }
      }
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
