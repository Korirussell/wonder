"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2 } from "lucide-react";

interface AudioPlayerProps {
  audioFile?: File;
  audioBlob?: Blob;
  volume: number;
  muted: boolean;
  trackId: string;
}

export function AudioPlayer({ audioFile, audioBlob, volume, muted, trackId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = muted ? 0 : volume / 100;
  }, [volume, muted]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getAudioSrc = () => {
    if (audioFile) {
      return URL.createObjectURL(audioFile);
    } else if (audioBlob) {
      return URL.createObjectURL(audioBlob);
    }
    return "";
  };

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={getAudioSrc()}
        preload="metadata"
      />
      
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        className="h-6 w-6 rounded-md hover:bg-muted"
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Play className="h-3 w-3 text-muted-foreground" />
        )}
      </Button>
      
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>/</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
