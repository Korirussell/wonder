"use client";

import { useEffect, useState } from "react";

interface MusicLoadingStateProps {
  onComplete?: () => void;
  className?: string;
}

export function MusicLoadingState({
  onComplete,
  className = "",
}: MusicLoadingStateProps) {
  const [stage, setStage] = useState<"analyzing" | "crafting">("analyzing");
  const [currentColorIndex, setCurrentColorIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  const colors = [
    "rgba(255,165,0,0.08)",
    "rgba(255,69,0,0.08)",
    "rgba(255,20,147,0.08)",
    "rgba(138,43,226,0.08)",
    "rgba(0,191,255,0.08)",
    "rgba(0,255,127,0.08)",
    "rgba(255,255,0,0.08)",
    "rgba(255,140,0,0.08)",
  ];

  useEffect(() => {
    const analyzeTimer = setTimeout(() => {
      setStage("crafting");
    }, 3000);

    const craftTimer = setTimeout(() => {
      onComplete?.();
    }, 7000);

    return () => {
      clearTimeout(analyzeTimer);
      clearTimeout(craftTimer);
    };
  }, [onComplete]);

  // Cycle colors during crafting stage to animate wave colors
  useEffect(() => {
    if (stage !== "crafting") return;
    const id = setInterval(() => {
      setCurrentColorIndex((prev) => (prev + 1) % colors.length);
    }, 800);
    return () => clearInterval(id);
  }, [stage, colors.length]);

  // Alternate displayed messages within each stage
  useEffect(() => {
    const intervalMs = stage === "analyzing" ? 1200 : 1400;
    const id = setInterval(() => {
      setMessageIndex((prev) => prev + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [stage]);

  const analyzingMessages = [
    "Analyzing your prompt...",
    "Understanding style and mood...",
    "Inferring structure and BPM...",
  ];
  const analyzingSubtexts = [
    "Understanding your musical vision",
    "Extracting keywords and genres",
    "Preparing composition plan",
  ];

  const craftingMessages = [
    "Crafting your beat...",
    "Generating stems and arrangement...",
    "Polishing mix and timing...",
  ];
  const craftingSubtexts = [
    "Generating your unique beat",
    "Designing patterns and layers",
    "Finalizing audio",
  ];

  return (
    <div className={`flex flex-col items-center space-y-4 py-6 ${className}`}>
      <div className="relative w-20 h-20 flex items-center justify-center">
        {stage === "analyzing" ? (
          <div className="flex items-end space-x-1">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="waveform-bar rounded-t-sm"
                style={{
                  width: "4px",
                  animationDelay: `${i * 0.1}s`,
                  minHeight: "12px",
                  backgroundColor: colors[i % colors.length],
                  border: `1px solid ${colors[i % colors.length].replace(
                    "0.08",
                    "0.2"
                  )}`,
                }}
              />
            ))}

            <div className="absolute inset-0 pointer-events-none">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="musical-note absolute text-xl"
                  style={{
                    left: `${15 + i * 25}%`,
                    animationDelay: `${i * 1}s`,
                    color: colors[(i * 2) % colors.length].replace(
                      "0.08",
                      "0.3"
                    ),
                  }}
                >
                  ♪
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Vinyl Record */}
            <div
              className="vinyl-record w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: colors[currentColorIndex].replace("0.08", "0.08"),
                border: `2px solid ${colors[currentColorIndex].replace(
                  "0.08",
                  "0.18"
                )}`,
              }}
            >
              <div className="w-4 h-4 rounded-full bg-white/30"></div>
              <div
                className="absolute inset-1 rounded-full border"
                style={{
                  borderColor: colors[currentColorIndex].replace("0.08", "0.2"),
                }}
              ></div>
              <div
                className="absolute inset-3 rounded-full border"
                style={{
                  borderColor: colors[currentColorIndex].replace(
                    "0.08",
                    "0.12"
                  ),
                }}
              ></div>
            </div>

            {/* Sound Waves */}
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="sound-wave absolute inset-0 rounded-full border-2"
                style={{
                  animationDelay: `${i * 0.7}s`,
                  borderColor: colors[
                    (currentColorIndex + i) % colors.length
                  ].replace("0.08", "0.3"),
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-white/30">
          {stage === "analyzing"
            ? analyzingMessages[messageIndex % analyzingMessages.length]
            : craftingMessages[messageIndex % craftingMessages.length]}
        </p>
        <p className="text-xs text-gray-400/40 mt-1">
          {stage === "analyzing"
            ? analyzingSubtexts[messageIndex % analyzingSubtexts.length]
            : craftingSubtexts[messageIndex % craftingSubtexts.length]}
        </p>
      </div>
    </div>
  );
}
