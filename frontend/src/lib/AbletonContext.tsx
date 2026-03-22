"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { SessionState } from "@/types";

interface AbletonContextValue {
  connected: boolean;
  session: SessionState;
  refresh: () => Promise<void>;
}

const DEFAULT_SESSION: SessionState = {
  bpm: 88,
  key: "A Minor",
  tracks: [],
  isPlaying: false,
};

const AbletonContext = createContext<AbletonContextValue>({
  connected: false,
  session: DEFAULT_SESSION,
  refresh: async () => {},
});

export function AbletonProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<SessionState>(DEFAULT_SESSION);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;

    try {
      const res = await fetch("/api/ableton-state", { cache: "no-store" });
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
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    const id = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(id);
    };
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
