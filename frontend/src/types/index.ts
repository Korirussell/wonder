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
}

export interface SessionState {
  bpm: number;
  key: string;
  tracks: Track[];
  isPlaying: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface WonderProfile {
  genres: string[];
  plugins: string[];
  artists: string[];
  bpmRange: [number, number];
  defaultKey: string;
}
