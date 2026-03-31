"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SessionState } from "@/types";

interface AbletonContextValue {
  connected: boolean;
  session: SessionState;
  refresh: () => void;
}

const DEFAULT_SESSION: SessionState = {
  bpm: 120,
  key: "F Minor",
  tracks: [],
  isPlaying: false,
};

const AbletonContext = createContext<AbletonContextValue>({
  connected: false,
  session: DEFAULT_SESSION,
  refresh: () => {},
});

export function AbletonProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<SessionState>(DEFAULT_SESSION);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ableton-state");
      const data = await res.json();
      setConnected(data.connected ?? false);
      if (data.connected) {
        setSession((prev) => ({
          ...prev,
          bpm: data.bpm ?? prev.bpm,
          key: data.key ?? prev.key,
          isPlaying: data.isPlaying ?? prev.isPlaying,
          ...(data.tracks?.length > 0 ? { tracks: data.tracks } : {}),
        }));
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <AbletonContext.Provider value={{ connected, session, refresh }}>
      {children}
    </AbletonContext.Provider>
  );
}

export function useAbleton() {
  return useContext(AbletonContext);
}
