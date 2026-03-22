"use client";

import { useEffect, useRef, useState } from "react";

interface AudioInterfaceRecorderProps {
  trackId: string;
  onRecordingComplete: (trackId: string, file: File) => void;
}

export function AudioInterfaceRecorder({
  trackId,
  onRecordingComplete,
}: AudioInterfaceRecorderProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate audio input devices when panel opens
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true }) // request permission first
      .then((stream) => {
        // Stop immediately — we just needed permission to see device labels
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
      .catch(() => {
        // Permission denied or no devices
      });
  }, [open, selectedDeviceId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        onRecordingComplete(trackId, file);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mr.start(100);
      setRecording(true);
    } catch (err) {
      console.error("Recording failed:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Record button */}
      <button
        onClick={() => {
          if (recording) {
            stopRecording();
          } else {
            setOpen((v) => !v);
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

      {/* Device picker popover */}
      {open && !recording && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border-2 border-[#2D2D2D] rounded-lg p-3 w-56 shadow-[2px_2px_0px_#2D2D2D]">
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mb-2">
            Input Device
          </p>
          {devices.length === 0 ? (
            <p className="font-mono text-[10px] text-stone-400">
              No devices found
            </p>
          ) : (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full font-mono text-[10px] border border-[#2D2D2D] rounded px-1 py-1 bg-white focus:outline-none mb-2"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={startRecording}
            disabled={devices.length === 0}
            className="w-full border-2 border-[#2D2D2D] rounded px-2 py-1 font-mono text-[10px] font-bold bg-red-500 text-white disabled:opacity-40"
          >
            ● Start Recording
          </button>
          <button
            onClick={() => setOpen(false)}
            className="w-full mt-1 border border-[#2D2D2D] rounded px-2 py-1 font-mono text-[10px] bg-white opacity-60 hover:opacity-100"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
