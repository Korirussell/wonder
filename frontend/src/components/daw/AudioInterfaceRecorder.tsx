"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AudioInterfaceRecorderProps {
  trackId: string;
  onRecordingComplete: (trackId: string, file: File) => void;
}

type ChannelMode = "left" | "right" | "stereo";

const CHANNEL_LABELS: Record<ChannelMode, string> = {
  left:   "Ch 1 (L) — Guitar",
  right:  "Ch 2 (R) — Mic",
  stereo: "Stereo (Both)",
};

export function AudioInterfaceRecorder({
  trackId,
  onRecordingComplete,
}: AudioInterfaceRecorderProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [channelMode, setChannelMode] = useState<ChannelMode>("left");
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState(false);

  // For fixed-position popup anchored to the button
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const openPopup = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Open upward so it floats above the arrangement view
      setPopupPos({ top: rect.top, left: rect.left });
    }
    setOpen(true);
  };

  // Enumerate audio input devices when panel opens
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((all) => {
        const inputs = all.filter((d) => d.kind === "audioinput");
        setDevices(inputs);
        if (inputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(inputs[0].deviceId);
        }
      })
      .catch(() => {});
  }, [open, selectedDeviceId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          channelCount: channelMode === "stereo" ? 2 : 2, // always request stereo so we can split
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      let recordStream = stream;

      // Channel isolation via Web Audio API
      if (channelMode !== "stereo") {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(1);
        src.connect(splitter);
        splitter.connect(merger, channelMode === "left" ? 0 : 1, 0);
        const dest = ctx.createMediaStreamDestination();
        merger.connect(dest);
        recordStream = dest.stream;
      }

      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(recordStream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: mimeType });
        onRecordingComplete(trackId, file);
        stream.getTracks().forEach((t) => t.stop());
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
      };

      mr.start(100);
      setRecording(true);
      setOpen(false);
    } catch (err) {
      console.error("Recording failed:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const popup = open && !recording ? createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={() => setOpen(false)}
      />
      {/* Panel — anchored above the button */}
      <div
        className="fixed z-[9999] bg-[#FDFDFB] border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-3 w-60"
        style={{
          bottom: `calc(100vh - ${popupPos.top}px + 6px)`,
          left: popupPos.left,
        }}
      >
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-2">
          Input Device
        </p>

        {devices.length === 0 ? (
          <p className="font-mono text-[10px] text-[#1A1A1A]/40">No devices found</p>
        ) : (
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full font-mono text-[10px] border-2 border-[#1A1A1A] px-1.5 py-1 bg-[#FDFDFB] focus:outline-none mb-2"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        )}

        <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1.5">
          Channel
        </p>
        <div className="flex gap-1 mb-3">
          {(["left", "right", "stereo"] as ChannelMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setChannelMode(mode)}
              className={`flex-1 border-2 border-[#1A1A1A] font-mono text-[9px] font-bold py-1 transition-colors ${
                channelMode === mode
                  ? "bg-[#1A1A1A] text-[#FDFDFB]"
                  : "bg-[#FDFDFB] text-[#1A1A1A] hover:bg-[#F0F0EB]"
              }`}
            >
              {mode === "left" ? "CH 1" : mode === "right" ? "CH 2" : "STR"}
            </button>
          ))}
        </div>
        <p className="font-mono text-[9px] text-[#1A1A1A]/30 mb-2.5 leading-snug">
          {CHANNEL_LABELS[channelMode]}
        </p>

        <button
          onClick={startRecording}
          disabled={devices.length === 0}
          className="w-full border-2 border-[#1A1A1A] bg-red-500 text-white font-mono text-[10px] font-bold py-1.5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] disabled:opacity-40 hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
        >
          ● Start Recording
        </button>
        <button
          onClick={() => setOpen(false)}
          className="w-full mt-1.5 border border-[#1A1A1A]/20 font-mono text-[9px] py-1 text-[#1A1A1A]/50 hover:text-[#1A1A1A]/80"
        >
          Cancel
        </button>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => {
          if (recording) {
            stopRecording();
          } else {
            openPopup();
          }
        }}
        title={recording ? "Stop recording" : "Record from audio interface"}
        className={`border border-[#2D2D2D] rounded px-1 py-0.5 font-mono text-[10px] font-bold leading-none transition-colors ${
          recording
            ? "bg-red-500 text-white border-red-600 animate-pulse"
            : "bg-white opacity-50 hover:opacity-100"
        }`}
      >
        {recording ? "■" : "●"}
      </button>

      {popup}
    </div>
  );
}
