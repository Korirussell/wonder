"use client";

import { useEffect, useRef, useState } from "react";

interface AgenticBlurOverlayProps {
  // Optional legacy trigger: when incremented, overlay shows for durationMs
  trigger?: number;
  // When active is provided, it fully controls visibility with no timeout
  active?: boolean;
  durationMs?: number;
}

export default function AgenticBlurOverlay({
  trigger,
  active,
  durationMs = 10000,
}: AgenticBlurOverlayProps) {
  const [showShadow, setShowShadow] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = [
    "rgba(255,165,0,0.3)", // Orange
    "rgba(255,69,0,0.3)", // Red-Orange
    "rgba(255,20,147,0.3)", // Deep Pink
    "rgba(138,43,226,0.3)", // Blue Violet
    "rgba(0,191,255,0.3)", // Deep Sky Blue
    "rgba(0,255,127,0.3)", // Spring Green
    "rgba(255,255,0,0.3)", // Yellow
    "rgba(255,140,0,0.3)", // Dark Orange
  ];

  // Active-controlled mode: show while active is true, no timeout
  useEffect(() => {
    if (active === undefined) return;

    // Clear previous timers
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (active) {
      console.log("[AgenticBlurOverlay] Active ON");
      setShowShadow(true);
      setColorIndex(0);
      intervalRef.current = setInterval(() => {
        setColorIndex((prev) => (prev + 1) % colors.length);
      }, 1250);
    } else {
      console.log("[AgenticBlurOverlay] Active OFF");
      setShowShadow(false);
      setColorIndex(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [active]);

  // Legacy trigger-based mode: show for durationMs when trigger increments
  useEffect(() => {
    if (active !== undefined) return; // skip when using active mode
    if (!trigger || trigger <= 0) return;

    console.log("[AgenticBlurOverlay] Triggered", { trigger, durationMs });

    // Clear any previous timers
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setShowShadow(true);
    setColorIndex(0);

    intervalRef.current = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % colors.length);
    }, 1250);

    timeoutRef.current = setTimeout(() => {
      setShowShadow(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setColorIndex(0);
      console.log("[AgenticBlurOverlay] Completed", { trigger });
    }, durationMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.log("[AgenticBlurOverlay] Cleaned up timers");
    };
  }, [trigger, active, durationMs]);

  return (
    <div
      className={
        "pointer-events-none absolute inset-0 z-[999] transition-all duration-1000"
      }
      style={{
        boxShadow: showShadow
          ? `inset 0 0 100px 20px ${colors[colorIndex]}`
          : "none",
        // Add visible blur + tint so the overlay is unmistakable
        backdropFilter: showShadow ? "blur(6px)" : "none",
        WebkitBackdropFilter: showShadow ? "blur(6px)" : "none",
        background: showShadow
          ? `radial-gradient(80% 60% at 50% 40%, ${colors[colorIndex]} 0%, transparent 70%)`
          : "transparent",
      }}
    />
  );
}
