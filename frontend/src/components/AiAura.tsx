"use client";

import { useEffect, useState } from "react";

type WonderAiAuraEvent = CustomEvent<{ active?: boolean }>;

export default function AiAura() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const syncFromDocument = () => {
      setActive(document.documentElement.dataset.wonderAiAura === "true");
    };

    const handleAuraChange = (event: Event) => {
      const auraEvent = event as WonderAiAuraEvent;
      if (typeof auraEvent.detail?.active === "boolean") {
        setActive(auraEvent.detail.active);
        return;
      }
      syncFromDocument();
    };

    syncFromDocument();
    window.addEventListener("wonder-ai-aura", handleAuraChange as EventListener);
    return () => {
      window.removeEventListener("wonder-ai-aura", handleAuraChange as EventListener);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[9999] transition-opacity duration-500 ease-out ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="wonder-ai-aura absolute inset-0 shadow-[inset_0_0_100px_rgba(193,225,193,0.5)]" />
    </div>
  );
}
