"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Pause, Play } from "lucide-react";
import { useRecording } from "./useRecording";

interface RecordingComponentProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export function RecordingComponent({ onRecordingComplete, onCancel }: RecordingComponentProps) {
  const {
    isRecording,
    isPaused,
    recordingTime,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    audioBlob,
    error,
  } = useRecording();

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const handleSaveRecording = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  };

  const handleCancel = () => {
    stopRecording();
    onCancel();
  };

  return (
    <div className="w-[250px] bg-background border-t border-border">
      <div className="h-14 flex items-center px-4">
        <span className="text-sm font-medium text-foreground">
          Record Audio
        </span>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!isRecording && !audioBlob && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted/30 rounded-full flex items-center justify-center">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Click to start recording
            </p>
            <Button
              onClick={startRecording}
              className="w-full"
              size="lg"
            >
              <Mic className="mr-2 h-4 w-4" />
              Start Recording
            </Button>
          </div>
        )}

        {isRecording && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
              <div className="w-8 h-8 bg-red-500 rounded-full"></div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-mono text-foreground">
                {formatTime(recordingTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPaused ? "Recording paused" : "Recording..."}
              </p>
            </div>
            <div className="flex gap-2">
              {isPaused ? (
                <Button
                  onClick={resumeRecording}
                  className="flex-1"
                  variant="outline"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button
                  onClick={pauseRecording}
                  className="flex-1"
                  variant="outline"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button
                onClick={handleStopRecording}
                className="flex-1"
                variant="destructive"
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <Mic className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Recording complete!
              </p>
              <p className="text-xs text-muted-foreground">
                Duration: {formatTime(recordingTime)}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleSaveRecording}
                className="flex-1"
              >
                Save as Track
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
