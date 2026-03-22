"use client";

import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, Square } from "lucide-react";

export interface BeatHeaderProps {
  bpm: number;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export default function BeatHeader({
  bpm,
  isPlaying,
  onStart,
  onStop,
  onReset,
}: BeatHeaderProps) {
  return (
    <div className="p-6 border-b border-border">
      <div className="flex items-center justify-center gap-4">
        <Button
          onClick={isPlaying ? onStop : onStart}
          size="lg"
          className="bg-white text-black hover:bg-gray-200"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </Button>
        <Button onClick={onStop} variant="outline" size="lg">
          <Square className="w-5 h-5" />
        </Button>
        <Button onClick={onReset} variant="outline" size="lg">
          <RotateCcw className="w-5 h-5" />
        </Button>
        <Button variant="outline" size="lg">
          Export
        </Button>
      </div>
    </div>
  );
}
