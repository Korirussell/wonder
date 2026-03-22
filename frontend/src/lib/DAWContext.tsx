"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { DAWState, DAWTrack, DAWBlock, DAWTransport, DrumPattern } from "@/types";

// ─── Action Types ─────────────────────────────────────────────────────────────

type DAWAction =
  | { type: "SET_TRANSPORT"; payload: Partial<DAWTransport> }
  | { type: "ADD_TRACK"; payload: DAWTrack }
  | { type: "UPDATE_TRACK"; payload: { id: string } & Partial<DAWTrack> }
  | { type: "DELETE_TRACK"; payload: string }
  | { type: "ADD_BLOCK"; payload: DAWBlock }
  | { type: "UPDATE_BLOCK"; payload: { id: string } & Partial<DAWBlock> }
  | { type: "DELETE_BLOCK"; payload: string }
  | { type: "LOAD_AUDIO"; payload: { trackId: string; blob: Blob } }
  | { type: "SET_SELECTED_BLOCK"; payload: string | null }
  | { type: "SET_DRUM_PATTERN"; payload: Partial<DrumPattern> };

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: DAWState = {
  transport: { isPlaying: false, currentMeasure: 1, bpm: 85, totalMeasures: 64 },
  tracks: [],
  blocks: [],
  selectedBlockId: null,
  drumPattern: {
    kick:    [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
    snare:   [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
    hihat:   [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
    openHat: [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  },
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function dawReducer(state: DAWState, action: DAWAction): DAWState {
  switch (action.type) {
    case "SET_TRANSPORT":
      return {
        ...state,
        transport: { ...state.transport, ...action.payload },
      };

    case "ADD_TRACK":
      return {
        ...state,
        tracks: [...state.tracks, action.payload],
      };

    case "UPDATE_TRACK":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload } : t
        ),
      };

    case "DELETE_TRACK":
      return {
        ...state,
        tracks: state.tracks.filter((t) => t.id !== action.payload),
        blocks: state.blocks.filter((b) => b.trackId !== action.payload),
        selectedBlockId:
          state.blocks.find(
            (b) => b.trackId === action.payload && b.id === state.selectedBlockId
          )
            ? null
            : state.selectedBlockId,
      };

    case "ADD_BLOCK":
      return {
        ...state,
        blocks: [...state.blocks, action.payload],
      };

    case "UPDATE_BLOCK":
      return {
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.payload.id ? { ...b, ...action.payload } : b
        ),
      };

    case "DELETE_BLOCK":
      return {
        ...state,
        blocks: state.blocks.filter((b) => b.id !== action.payload),
        selectedBlockId:
          state.selectedBlockId === action.payload ? null : state.selectedBlockId,
      };

    case "LOAD_AUDIO":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.payload.trackId
            ? { ...t, audioBlob: action.payload.blob }
            : t
        ),
      };

    case "SET_SELECTED_BLOCK":
      return {
        ...state,
        selectedBlockId: action.payload,
      };

    case "SET_DRUM_PATTERN":
      return {
        ...state,
        drumPattern: { ...state.drumPattern!, ...action.payload },
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DAWContextValue {
  state: DAWState;
  dispatch: React.Dispatch<DAWAction>;
}

const DAWContext = createContext<DAWContextValue>({
  state: initialState,
  dispatch: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DAWProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dawReducer, initialState);

  return (
    <DAWContext.Provider value={{ state, dispatch }}>
      {children}
    </DAWContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDAWContext(): DAWContextValue {
  return useContext(DAWContext);
}
