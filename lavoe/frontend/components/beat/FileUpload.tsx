"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileAudio, X } from "lucide-react";
import { Track } from "./types";

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  onCancel: () => void;
}

export function FileUpload({ onFileUpload, onCancel }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (isValidAudioFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (isValidAudioFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const isValidAudioFile = (file: File): boolean => {
    const validTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'audio/ogg',
      'audio/m4a',
      'audio/aac',
      'audio/flac'
    ];
    return validTypes.includes(file.type) || file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileUpload(selectedFile);
      setSelectedFile(null);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    onCancel();
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-[250px] bg-background border-t border-border">
      <div className="h-14 flex items-center px-4">
        <span className="text-sm font-medium text-foreground">
          Upload Track
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md ml-auto hover:bg-muted"
          onClick={handleCancel}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      <div className="p-4">
        {!selectedFile ? (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <FileAudio className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag & drop audio file here
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              or
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={openFileDialog}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileInput}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground mt-3">
              Supports MP3, WAV, OGG, M4A, AAC, FLAC
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <FileAudio className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                className="flex-1"
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Track
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                size="sm"
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
