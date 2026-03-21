"use client";

import { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, Send, StopCircle } from "lucide-react";
import { ChatMessage, MidiContext } from "@/types";

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hey! I'm Wonder — your AI music copilot. Tell me what you want to make, or hum a melody and I'll build the session in Ableton. What are we making today?",
    timestamp: new Date(),
    isGreeting: true, // Mark as greeting so it's not sent to Gemini
  },
];

// Recording state type
type RecordingState = "idle" | "recording" | "processing";

export default function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  // Store MIDI context (lightweight reference) instead of full notes array
  const [pendingMidi, setPendingMidi] = useState<MidiContext | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const sendMessage = async (customContent?: string, midiContextToInclude?: MidiContext) => {
    const messageContent = customContent || input.trim();
    if (!messageContent || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customContent) setInput("");
    setIsLoading(true);

    // Use passed MIDI context or pending MIDI context
    const midiCtx = midiContextToInclude || pendingMidi;
    
    // Clear pending MIDI context after use
    if (midiCtx) {
      setPendingMidi(null);
    }

    try {
      // Filter out greeting messages (they're just for display)
      const chatHistory = [...messages, userMsg]
        .filter((m) => !m.isGreeting)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          // Pass MIDI context (lightweight reference) instead of full notes array
          midiContext: midiCtx || undefined,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Connection error — make sure the Wonder backend is running.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Convert audio blob to WAV format in the browser (avoids ffmpeg dependency on server)
  const convertToWav = async (audioBlob: Blob): Promise<Blob> => {
    // Create an audio context
    const audioContext = new AudioContext({ sampleRate: 22050 });
    
    // Decode the audio data
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Get the audio data (mono, first channel)
    const channelData = audioBuffer.getChannelData(0);
    
    // Create WAV file
    const wavBuffer = encodeWav(channelData, audioBuffer.sampleRate);
    
    await audioContext.close();
    
    return new Blob([wavBuffer], { type: "audio/wav" });
  };

  // Encode PCM data to WAV format
  const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, "WAVE");
    
    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    
    // Write audio samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      // Clamp and convert to 16-bit integer
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return buffer;
  };

  // Helper to write string to DataView
  const writeString = (view: DataView, offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Process recorded audio and send for transcription
  const processRecordedAudio = async (audioBlob: Blob) => {
    setRecordingState("processing");
    
    try {
      // Convert WebM/MP4 to WAV in the browser (avoids ffmpeg dependency on server)
      console.log("[Recording] Converting audio to WAV format...");
      const wavBlob = await convertToWav(audioBlob);
      console.log(`[Recording] WAV size: ${wavBlob.size} bytes`);
      
      // Convert WAV blob to base64
      const audioBase64 = await blobToBase64(wavBlob);
      
      // Send to transcription API (now as WAV format)
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_data: audioBase64,
          input_format: "wav",
        }),
      });

      const data = await res.json();

      if (data.success && data.note_count > 0) {
        // Build MidiContext from API response (lightweight reference)
        const midiContext: MidiContext = {
          midi_id: data.midi_id,
          midi_path: data.midi_path,
          note_count: data.note_count,
          notes_summary: data.notes_summary,
          suggested_clip_length: data.suggested_clip_length,
          tempo_bpm: data.tempo_bpm,
        };
        
        // Format notes for display using the summary
        const firstNotes = midiContext.notes_summary.first_notes?.join(", ") || "";
        const moreNotes = midiContext.note_count > 5 ? ` and ${midiContext.note_count - 5} more` : "";
        
        // Simple, clean user message
        const userMessage = `I just hummed a melody (${midiContext.note_count} notes detected: ${firstNotes}${moreNotes}). Add these notes to a new MIDI clip.`;

        // Send message with MIDI context (lightweight reference, not full notes)
        await sendMessage(userMessage, midiContext);
      } else {
        // Transcription failed or no notes detected
        const errorMsg = data.error || "No notes were detected. Try humming or whistling louder and clearer.";
        
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `I couldn't transcribe that audio: ${errorMsg}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Error processing audio. Make sure the Wonder backend is running.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setRecordingState("idle");
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });

      // Try to use WebM format (most widely supported)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4"; // Fallback for Safari

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop());
        
        // Clear the timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        // Combine chunks into a single blob
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Process the recorded audio
        await processRecordedAudio(audioBlob);
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setRecordingState("recording");
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

    } catch (error) {
      console.error("Error starting recording:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Couldn't access your microphone. Please allow microphone access and try again.",
          timestamp: new Date(),
        },
      ]);
      setRecordingState("idle");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // Toggle recording
  const toggleRecording = () => {
    if (recordingState === "recording") {
      stopRecording();
    } else if (recordingState === "idle") {
      startRecording();
    }
    // If processing, do nothing
  };

  // Format recording duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isRecording = recordingState === "recording";
  const isProcessing = recordingState === "processing";

  return (
    <section className="w-[40%] flex flex-col border-r-2 border-[#2D2D2D] bg-white/70 backdrop-blur-sm">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 max-w-[90%] ${
              msg.role === "user" ? "items-end ml-auto" : "items-start"
            }`}
          >
            {/* Label */}
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              {msg.role === "user" ? "You" : "Wonder Copilot"}
            </span>

            {/* Bubble */}
            <div
              className={`border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow text-sm leading-relaxed font-body whitespace-pre-wrap ${
                msg.role === "assistant"
                  ? "bg-[#E9D5FF]"
                  : "bg-white"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {(isLoading || isProcessing) && (
          <div className="flex flex-col gap-2 max-w-[90%] items-start">
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              Wonder Copilot
            </span>
            <div className="bg-[#E9D5FF] border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-[#68587c] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-[#68587c] opacity-70">
                {isProcessing ? "transcribing audio..." : "thinking..."}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="px-6 py-2 bg-[#fa7150]/10 border-t-2 border-[#fa7150]/30 flex items-center justify-center gap-3">
          <div className="w-2 h-2 bg-[#fa7150] rounded-full animate-pulse" />
          <span className="text-sm font-mono text-[#fa7150] font-bold">
            Recording... {formatDuration(recordingDuration)}
          </span>
          <span className="text-xs text-[#fa7150]/70">
            (click stop when done)
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="px-6 py-5 flex-shrink-0">
        <div className="bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow flex items-end p-3 gap-3 focus-within:ring-2 focus-within:ring-[#C1E1C1] transition-all">
          <button className="p-2 text-[#2D2D2D]/40 hover:text-[#2D2D2D] transition-colors self-end">
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Wonder... (or hum a melody)"
            rows={1}
            disabled={isRecording || isProcessing}
            className="flex-1 border-none focus:ring-0 bg-transparent resize-none py-2 text-sm font-body leading-relaxed outline-none min-h-[40px] max-h-40 disabled:opacity-50"
          />

          {/* Mic button */}
          <button
            onClick={toggleRecording}
            disabled={isLoading || isProcessing}
            className={`w-11 h-11 border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end transition-all ${
              isRecording
                ? "bg-[#fa7150] recording-pulse"
                : isProcessing
                ? "bg-gray-300 opacity-50 cursor-not-allowed"
                : "bg-[#C1E1C1] hard-shadow-sm interactive-push"
            }`}
          >
            {isRecording ? (
              <StopCircle size={18} strokeWidth={2.5} />
            ) : (
              <Mic size={18} strokeWidth={2.5} />
            )}
          </button>

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading || isRecording || isProcessing}
            className="w-11 h-11 bg-[#2D2D2D] text-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end hard-shadow-sm interactive-push disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-[9px] font-mono font-bold uppercase text-center mt-3 opacity-25 tracking-widest">
          Enter to send · Shift+Enter for new line · Gemini-powered
        </p>
      </div>
    </section>
  );
}
