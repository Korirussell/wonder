"use client";

import { useEffect, useMemo, useState } from "react";

type KidsStatusState = "idle" | "working" | "playing" | "error";

interface KidsModeStageProps {
  onPrompt: (prompt: string, title?: string) => Promise<void> | void;
}

interface KidsPad {
  title: string;
  animal: string;
  emoji: string;
  accent: string;
  subtitle: string;
  lesson: string;
  prompt: string;
}

const KIDS_PADS: KidsPad[] = [
  {
    title: "Lion Beat",
    animal: "🦁",
    emoji: "🥁",
    accent: "#60A5FA",
    subtitle: "Big drums that stomp in a loop",
    lesson: "Drums keep the beat.",
    prompt: "good beat at 90 BPM",
  },
  {
    title: "Panda Groove",
    animal: "🐼",
    emoji: "🪘",
    accent: "#FACC15",
    subtitle: "A fresh drum loop surprise",
    lesson: "A loop repeats again and again.",
    prompt: "random drum loop",
  },
  {
    title: "Kitty Keys",
    animal: "🐱",
    emoji: "🎹",
    accent: "#F472B6",
    subtitle: "Happy notes you can hum",
    lesson: "Melody is the singable part.",
    prompt: "random melody",
  },
  {
    title: "Bunny Pop",
    animal: "🐰",
    emoji: "🎤",
    accent: "#FB923C",
    subtitle: "An instant tiny pop song",
    lesson: "Songs stack beat plus melody.",
    prompt: "stack an 80 BPM melodic pop song",
  },
  {
    title: "Frog Bounce",
    animal: "🐸",
    emoji: "🎸",
    accent: "#34D399",
    subtitle: "Low bouncy music energy",
    lesson: "Bass makes the music feel big.",
    prompt: "good beat at 90 BPM with a bouncy bass feel",
  },
  {
    title: "Duck Sparkle",
    animal: "🐥",
    emoji: "✨",
    accent: "#A78BFA",
    subtitle: "Twinkly bright top notes",
    lesson: "High sounds add sparkle.",
    prompt: "random melody with sparkly top notes",
  },
  {
    title: "Fox Funny",
    animal: "🦊",
    emoji: "🎈",
    accent: "#F97316",
    subtitle: "Silly rhythm surprises",
    lesson: "Different patterns change the mood.",
    prompt: "random drum loop with playful percussion",
  },
  {
    title: "Bear Dream",
    animal: "🐻",
    emoji: "🌙",
    accent: "#7DD3FC",
    subtitle: "Soft dreamy music blocks",
    lesson: "Slow songs feel floaty.",
    prompt: "stack an 80 BPM melodic pop song dreamy and soft",
  },
];

const STEP_GRID = Array.from({ length: 16 }, (_, index) => index);

function RainbowKidsWordmark() {
  return (
    <div
      className="inline-flex items-center gap-1 text-[clamp(54px,10vw,118px)] font-black uppercase leading-none"
      style={{ fontFamily: "'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif" }}
    >
      {[
        ["K", "#60A5FA"],
        ["I", "#FACC15"],
        ["D", "#F43F5E"],
        ["S", "#FB923C"],
      ].map(([letter, color]) => (
        <span
          key={letter}
          style={{
            color,
            textShadow: "6px 6px 0 rgba(26,26,26,0.16)",
          }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

export function KidsModeStage({ onPrompt }: KidsModeStageProps) {
  const [selectedPadTitle, setSelectedPadTitle] = useState(KIDS_PADS[0]?.title ?? "Lion Beat");
  const [selectedAccent, setSelectedAccent] = useState(KIDS_PADS[0]?.accent ?? "#60A5FA");
  const [statusState, setStatusState] = useState<KidsStatusState>("idle");
  const [statusTitle, setStatusTitle] = useState("Tap a music friend");
  const [statusMessage, setStatusMessage] = useState("Wonder will build a loop and play it right away.");

  const selectedPad = useMemo(
    () => KIDS_PADS.find((pad) => pad.title === selectedPadTitle) ?? KIDS_PADS[0],
    [selectedPadTitle],
  );

  useEffect(() => {
    const handleKidsStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{
        state?: KidsStatusState;
        title?: string;
        message?: string;
        accent?: string;
      }>;

      if (customEvent.detail?.state) {
        setStatusState(customEvent.detail.state);
      }
      if (customEvent.detail?.title) {
        setStatusTitle(customEvent.detail.title);
        setSelectedPadTitle(customEvent.detail.title);
      }
      if (customEvent.detail?.message) {
        setStatusMessage(customEvent.detail.message);
      }
      if (customEvent.detail?.accent) {
        setSelectedAccent(customEvent.detail.accent);
      }
    };

    window.addEventListener("wonder-kids-status", handleKidsStatus as EventListener);
    return () => window.removeEventListener("wonder-kids-status", handleKidsStatus as EventListener);
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.20),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(250,204,21,0.22),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.18),_transparent_28%),#FFFBEB] px-5 py-5 md:px-10 md:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 rounded-[42px] border-2 border-[#1A1A1A] bg-white p-5 shadow-[14px_14px_0px_0px_rgba(26,26,26,0.14)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border-2 border-[#1A1A1A] bg-[#FFF8D7] px-5 py-2 shadow-[5px_5px_0px_0px_rgba(26,26,26,0.12)]">
              <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#1A1A1A]">
                Wonder Kids Music Pad
              </span>
            </div>
            <div className="mt-5">
              <RainbowKidsWordmark />
            </div>
            <p className="mt-4 max-w-2xl text-[18px] font-semibold text-[#1A1A1A]/74">
              Tap an animal block. Wonder makes a loop, teaches what it does, and starts playing without extra buttons.
            </p>
          </div>

          <div
            className="w-full max-w-[360px] rounded-[30px] border-2 border-[#1A1A1A] bg-[#FFFDF7] p-5 shadow-[8px_8px_0px_0px_rgba(26,26,26,0.12)]"
            style={{ boxShadow: `8px 8px 0 0 rgba(26,26,26,0.12), inset 0 0 0 6px ${selectedAccent}22` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`rounded-full border-2 border-[#1A1A1A] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  statusState === "playing"
                    ? "bg-[#C1E1C1]"
                    : statusState === "working"
                      ? "bg-[#FEF08A]"
                      : statusState === "error"
                        ? "bg-[#FCA5A5]"
                        : "bg-white"
                }`}
              >
                {statusState === "working" ? "Building" : statusState === "playing" ? "Playing" : statusState === "error" ? "Try Again" : "Ready"}
              </span>
              <span className="text-[26px]">{selectedPad?.animal ?? "🦁"}</span>
            </div>
            <p
              className="mt-4 text-[28px] font-black uppercase leading-none text-[#1A1A1A]"
              style={{ fontFamily: "'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif" }}
            >
              {statusTitle}
            </p>
            <p className="mt-3 text-[15px] font-semibold text-[#1A1A1A]/68">
              {statusMessage}
            </p>
            <div className="mt-5 grid grid-cols-8 gap-1.5">
              {STEP_GRID.map((step) => (
                <span
                  key={`status-step-${step}`}
                  className={`h-6 rounded-full border-2 border-[#1A1A1A] ${statusState === "working" || statusState === "playing" ? "wonder-kids-light" : ""}`}
                  style={{
                    backgroundColor: step % 2 === 0 ? selectedAccent : "#FFFFFF",
                    animationDelay: `${step * 70}ms`,
                    opacity: step % 2 === 0 ? 1 : 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[34px] border-2 border-[#1A1A1A] bg-[#FFFCF1] p-4 shadow-[8px_8px_0px_0px_rgba(26,26,26,0.10)] md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#1A1A1A]/50">
                Little Loop Pad
              </p>
              <p className="mt-2 text-[15px] font-semibold text-[#1A1A1A]/70">
                Every block makes a looping music part. Tap one, listen, then tap another friend to stack the song.
              </p>
            </div>
            <div className="rounded-full border-2 border-[#1A1A1A] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#1A1A1A]">
              {selectedPad?.lesson ?? "Music is made from repeating patterns."}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {KIDS_PADS.map((pad, index) => (
              <button
                key={pad.title}
                onClick={() => {
                  setSelectedPadTitle(pad.title);
                  setSelectedAccent(pad.accent);
                  setStatusState("working");
                  setStatusTitle(pad.title);
                  setStatusMessage(`Making ${pad.title}. ${pad.lesson}`);
                  void onPrompt(pad.prompt, pad.title);
                }}
                className="group relative flex min-h-[220px] flex-col justify-between rounded-[32px] border-2 border-[#1A1A1A] px-5 pb-5 pt-6 text-left shadow-[8px_8px_0px_0px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[12px_12px_0px_0px_rgba(26,26,26,0.16)]"
                style={{ backgroundColor: pad.accent }}
              >
                <div className="absolute left-5 right-5 top-[-14px] flex justify-center gap-4">
                  <span className="h-7 w-7 rounded-full border-2 border-[#1A1A1A] bg-white" />
                  <span className="h-7 w-7 rounded-full border-2 border-[#1A1A1A] bg-white" />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#1A1A1A] bg-white text-[34px] shadow-[4px_4px_0px_0px_rgba(26,26,26,0.08)]">
                    {pad.animal}
                  </div>
                  <span className="rounded-full border-2 border-[#1A1A1A] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1A1A1A]">
                    {pad.emoji}
                  </span>
                </div>

                <div>
                  <p
                    className="text-[24px] font-black uppercase leading-none text-[#1A1A1A]"
                    style={{ fontFamily: "'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif" }}
                  >
                    {pad.title}
                  </p>
                  <p className="mt-3 text-[14px] font-semibold text-[#1A1A1A]/78">
                    {pad.subtitle}
                  </p>
                </div>

                <div className="rounded-[22px] border-2 border-[#1A1A1A] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1A1A1A]/50">
                    Learn
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-[#1A1A1A]/76">
                    {pad.lesson}
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {STEP_GRID.slice(0, 8).map((step) => (
                      <span
                        key={`${pad.title}-${step}`}
                        className="h-3 rounded-full border border-[#1A1A1A]"
                        style={{
                          backgroundColor: step % 2 === index % 2 ? pad.accent : "#F8F7EF",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Beat",
              copy: "The beat is the steady pulse your body can clap to.",
              color: "#60A5FA",
            },
            {
              title: "Melody",
              copy: "The melody is the part you can sing or whistle back.",
              color: "#F472B6",
            },
            {
              title: "Loop",
              copy: "A loop is a sound that repeats so you can keep building.",
              color: "#FACC15",
            },
          ].map((fact) => (
            <div
              key={fact.title}
              className="rounded-[28px] border-2 border-[#1A1A1A] bg-[#FFFDF7] px-5 py-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,0.10)]"
            >
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full border-2 border-[#1A1A1A]" style={{ backgroundColor: fact.color }} />
                <p
                  className="text-[18px] font-black uppercase leading-none text-[#1A1A1A]"
                  style={{ fontFamily: "'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif" }}
                >
                  {fact.title}
                </p>
              </div>
              <p className="mt-3 text-[14px] font-semibold text-[#1A1A1A]/72">
                {fact.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
