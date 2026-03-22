export interface Clip {
  index: number;     // Scene slot (0, 1, 2, …)
  name: string;
  length: number;    // In beats (4.0 = 1 bar at 4/4)
  isPlaying: boolean;
}

export interface Track {
  id: number;
  name: string;
  volume: number; // 0.0 – 1.0
  pan: number;    // -1.0 – 1.0
  mute: boolean;
  solo: boolean;
  armed: boolean;
  devices: string[];
  color?: string; // optional accent color class
  clips: Clip[];
}

export interface SessionState {
  bpm: number;
  key: string;
  tracks: Track[];
  isPlaying: boolean;
}

export interface ToolLogEntry {
  icon: string;
  message: string;
  success: boolean;
  toolName?: string;
}

export interface ChatResponse {
  content: string;
  toolLog?: ToolLogEntry[];
  suggestions?: string[];
}

export interface AudioAttachment {
  filename: string;
  base64: string;
  mimeType: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isGreeting?: boolean; // If true, don't send to Gemini (just display)
  toolLog?: ToolLogEntry[];
  suggestions?: string[];
  audioAttachment?: AudioAttachment;
}

export interface TranscribedNote {
  pitch: number;      // MIDI pitch 0-127
  start_time: number; // Start time in beats
  duration: number;   // Duration in beats
  velocity: number;   // MIDI velocity 0-127
  mute?: boolean;
}

// Compact summary of transcribed notes (sent to Gemini instead of full array)
export interface NotesSummary {
  note_count: number;
  pitch_range?: [string, string]; // e.g., ["C3", "G4"]
  duration_beats?: number;
  first_notes?: string[]; // e.g., ["C4", "E4", "G4"]
}

// MIDI context passed to Gemini (lightweight reference instead of full notes)
export interface MidiContext {
  midi_id: string;
  midi_path: string;
  note_count: number;
  notes_summary: NotesSummary;
  suggested_clip_length: number;
  tempo_bpm: number;
}

export interface WonderProfile {
  genres: string[];
  plugins: string[];
  artists: string[];
  bpmRange: [number, number];
  defaultKey: string;
}

// ─── Browser DAW Types ────────────────────────────────────────────────────────

export interface DAWTrack {
  id: string;
  name: string;
  color: string; // hex e.g. "#C1E1C1"
  muted: boolean;
  volume: number; // 0–100
  audioBlob?: Blob;
  audioStorageId?: string; // IndexedDB key
  waveformCache?: number[];
  // Loop stem config — set when track was generated as a looping backing track
  loop?: boolean;
  loopBars?: number;        // How many bars before the loop point
  loopDurationSec?: number; // Exact audio duration in seconds (for loopEnd)
}

export interface DAWBlock {
  id: string;
  trackId: string;
  name: string;
  startMeasure: number; // 1-based, 0.25 snap granularity
  durationMeasures: number;
  color?: string;
}

export interface DAWTransport {
  isPlaying: boolean;
  currentMeasure: number;
  bpm: number;
  totalMeasures: number;
}

export interface DrumPattern {
  kick:    boolean[];  // 16 steps
  snare:   boolean[];
  hihat:   boolean[];
  openHat: boolean[];
}

export interface SampleLibraryEntry {
  id: string;
  name: string;
  audioUrl: string; // data URI or blob URL
  tags: string[];
  createdAt: number; // Date.now()
}

export interface DAWState {
  transport: DAWTransport;
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  selectedBlockId: string | null;
  drumPattern?: DrumPattern;
  sampleLibrary: SampleLibraryEntry[];
}
