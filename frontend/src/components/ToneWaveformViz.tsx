"use client";

import { useRef, useEffect, useCallback } from "react";
import toneEngine from "@/lib/toneEngine";

interface ToneWaveformVizProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** "waveform" shows oscilloscope-style, "fft" shows frequency bars */
  mode?: "waveform" | "fft";
  /** Stroke/fill color */
  color?: string;
  /** Background color (transparent by default) */
  bgColor?: string;
  /** Line width for waveform mode */
  lineWidth?: number;
  /** Extra CSS classes */
  className?: string;
}

export default function ToneWaveformViz({
  width = 400,
  height = 80,
  mode = "waveform",
  color = "#2D2D2D",
  bgColor = "transparent",
  lineWidth = 1.5,
  className = "",
}: ToneWaveformVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = bgColor;
    if (bgColor === "transparent") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (mode === "waveform") {
      const values = toneEngine.getWaveformValues();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      const sliceWidth = canvas.width / values.length;
      let x = 0;

      for (let i = 0; i < values.length; i++) {
        const v = (values[i] + 1) / 2; // normalize -1..1 → 0..1
        const y = v * canvas.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    } else {
      // FFT bars
      const values = toneEngine.getFFTValues();
      const barCount = values.length;
      const barWidth = canvas.width / barCount;

      for (let i = 0; i < barCount; i++) {
        // FFT values are in dB, typically -100 to 0
        const db = values[i];
        const normalized = Math.max(0, (db + 100) / 100); // 0..1
        const barHeight = normalized * canvas.height;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4 + normalized * 0.6;
        ctx.fillRect(
          i * barWidth,
          canvas.height - barHeight,
          Math.max(barWidth - 1, 1),
          barHeight
        );
      }
      ctx.globalAlpha = 1;
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [mode, color, bgColor, lineWidth]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`block ${className}`}
      style={{ width, height }}
    />
  );
}
