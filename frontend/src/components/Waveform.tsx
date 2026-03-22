"use client";

import { useEffect, useRef, useState } from "react";

interface WaveformProps {
  audioFile?: File;
  audioBlob?: Blob;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Waveform({
  audioFile,
  audioBlob,
  width = 200,
  height = 40,
  color = "#3b82f6",
  className = "",
}: WaveformProps) {
  const actualColor = color;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (audioFile || audioBlob) {
      generateWaveform();
    }
  }, [audioFile, audioBlob]);

  useEffect(() => {
    if (waveformData.length > 0) {
      drawWaveform();
    }
  }, [waveformData, width, height, actualColor]);

  const generateWaveform = async () => {
    if (!audioFile && !audioBlob) return;

    setIsLoading(true);

    try {
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Get audio data
      const audioData = audioFile ?
        await audioFile.arrayBuffer() :
        await audioBlob!.arrayBuffer();

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(audioData);

      // Get channel data (use first channel for mono, or mix channels for stereo)
      const channelData = audioBuffer.getChannelData(0);

      // Downsample the data for visualization - increase sample count for thinner bars
      const samples = Math.min(width * 3, 1200); // More samples for Apple Voice Memos style
      const blockSize = Math.floor(channelData.length / samples);
      const waveform: number[] = [];

      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        const end = start + blockSize;
        let sum = 0;

        // Calculate RMS (Root Mean Square) for better visualization
        for (let j = start; j < end && j < channelData.length; j++) {
          sum += channelData[j] * channelData[j];
        }

        const rms = Math.sqrt(sum / blockSize);
        waveform.push(rms);
      }

      // Normalize the waveform data
      const maxValue = Math.max(...waveform);
      const normalizedWaveform = waveform.map(value => value / maxValue);

      setWaveformData(normalizedWaveform);

      // Clean up audio context
      audioContext.close();
    } catch (error) {
      console.error("Error generating waveform:", error);
      // Create a simple placeholder waveform on error
      const placeholderWaveform = Array.from({ length: 50 }, () => Math.random() * 0.5 + 0.1);
      setWaveformData(placeholderWaveform);
    } finally {
      setIsLoading(false);
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set drawing style
    ctx.fillStyle = actualColor;
    ctx.strokeStyle = actualColor;

    // Apple Voice Memos style - fill entire width
    const barWidth = width / waveformData.length;
    const barSpacing = 0.2; // Minimal spacing to fill width better
    const centerY = height / 2;
    const actualBarWidth = Math.max(0.5, barWidth - barSpacing);

    // Draw center line first (like Apple Voice Memos)
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, centerY - 0.5, width, 1);
    ctx.globalAlpha = 1;

    // Draw waveform bars (Apple Voice Memos style)
    waveformData.forEach((amplitude, index) => {
      const barHeight = Math.max(4, amplitude * height * 1.2); // Much taller bars, minimum 4px, amplified height
      const x = index * barWidth;
      const y = centerY - barHeight / 2;

      // Draw very thin vertical bar with rounded ends
      if (actualBarWidth >= 1) {
        // For wider bars, use rounded rectangles
        ctx.beginPath();
        const radius = Math.min(actualBarWidth / 2, 1);
        ctx.roundRect(x, y, actualBarWidth, barHeight, radius);
        ctx.fill();
      } else {
        // For very thin bars, just use rectangles
        ctx.fillRect(x, y, actualBarWidth, barHeight);
      }
    });
  };

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 rounded ${className}`}
        style={{ width, height }}
      >
        <div className="text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!audioFile && !audioBlob) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 rounded ${className}`}
        style={{ width, height }}
      >
        <div className="text-xs text-muted-foreground">No audio</div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ width, height }}
    />
  );
}
