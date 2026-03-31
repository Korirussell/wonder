export interface MusicBlock {
  id: string;
  name: string;
  type: "melody" | "bass" | "drums" | "percussion";
  color: string;
  startTime: number;
  duration: number;
  track: number;
  trackId?: string; // ID of the associated track for AI agent use
  audioFile?: File; // Optional audio file for the block
  audioBlob?: Blob; // Optional audio blob for the block
  waveformData?: number[]; // Optional cached waveform data
}

export interface Track {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  volume: number;
  audioFile?: File; // Optional audio file for uploaded tracks
  audioBlob?: Blob; // Optional audio blob for recorded tracks
  waveformData?: number[]; // Optional cached waveform data for performance
}
