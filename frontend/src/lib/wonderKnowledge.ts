/**
 * Wonder Knowledge Base Loader
 * Loads wonder.md and provides it to Gemini's system prompt
 */

import { readFileSync } from "fs";
import path from "path";

let cachedWonderKnowledge: string | null = null;

/**
 * Load wonder.md from the project root
 */
export function loadWonderKnowledge(): string {
  if (cachedWonderKnowledge) {
    return cachedWonderKnowledge;
  }

  try {
    const wonderPath = path.join(process.cwd(), "..", "wonder.md");
    cachedWonderKnowledge = readFileSync(wonderPath, "utf-8");
    return cachedWonderKnowledge;
  } catch (error) {
    console.error("Failed to load wonder.md:", error);
    return ""; // Return empty string if file not found
  }
}

/**
 * Build the complete system prompt with wonder.md knowledge
 */
export function buildSystemPromptWithKnowledge(basePrompt: string): string {
  const wonderKnowledge = loadWonderKnowledge();
  
  if (!wonderKnowledge) {
    console.warn("[Wonder] Failed to load wonder.md - using base prompt only");
    return basePrompt;
  }

  return `${basePrompt}

---

# WONDER MUSIC PRODUCTION KNOWLEDGE BASE

${wonderKnowledge}

---

## CRITICAL REMINDERS

1. **ALWAYS load an instrument before creating MIDI clips**
2. **ALWAYS update session state JSON after every tool call**
3. **ALWAYS validate notes are in the session's key/scale**
4. **ALWAYS follow voice leading principles**
5. **ALWAYS maintain chord progression coherence**

Your session state JSON is tracked throughout this conversation. Reference it before making musical decisions.
`;
}

/**
 * Extract MIDI examples from wonder.md for a specific genre
 */
export function getMIDIExamplesForGenre(genre: string): string {
  const knowledge = loadWonderKnowledge();
  
  // Simple extraction - in production, you'd parse more carefully
  const genreSection = knowledge.split(`### ${genre}`)[1];
  if (!genreSection) {
    return "";
  }

  return genreSection.split("###")[0]; // Get content until next section
}

/**
 * Get instrument recommendations for a track type and genre
 */
export function getInstrumentRecommendation(
  trackType: "drums" | "bass" | "melody" | "chords",
  genre: string
): string {
  const recommendations: Record<string, Record<string, string>> = {
    drums: {
      lofi: "Drum Rack",
      trap: "808 kit via search_plugins",
      house: "Drum Rack",
      jazz: "Drum Rack",
    },
    bass: {
      lofi: "Electric Piano or Analog",
      trap: "Serum → Sub Bass preset",
      house: "Wavetable → Sub Bass",
      jazz: "Electric Piano",
    },
    melody: {
      lofi: "Electric Piano or Rhodes",
      trap: "Vital → Lead preset",
      house: "Wavetable → Pluck preset",
      jazz: "Electric Piano → Wurlitzer",
    },
    chords: {
      lofi: "Electric Piano → Soft EP",
      trap: "Analog → Pad category",
      house: "Wavetable → Pad preset",
      jazz: "Electric Piano → Rhodes",
    },
  };

  return recommendations[trackType]?.[genre.toLowerCase()] || "Electric Piano";
}

/**
 * Get BPM range for a genre
 */
export function getBPMRange(genre: string): { min: number; max: number } {
  const ranges: Record<string, { min: number; max: number }> = {
    lofi: { min: 80, max: 95 },
    trap: { min: 130, max: 150 },
    house: { min: 120, max: 130 },
    jazz: { min: 90, max: 140 },
    "boom-bap": { min: 85, max: 95 },
  };

  return ranges[genre.toLowerCase()] || { min: 90, max: 120 };
}

/**
 * Get swing amount for a genre
 */
export function getSwingAmount(genre: string): number {
  const swingAmounts: Record<string, number> = {
    lofi: 0.2,
    trap: 0.0,
    house: 0.05,
    jazz: 0.15,
    "boom-bap": 0.15,
  };

  return swingAmounts[genre.toLowerCase()] || 0.0;
}

/**
 * Get common chord progressions for a genre
 */
export function getChordProgressions(genre: string, key: string, scale: string): string[] {
  // This is a simplified version - wonder.md has the full details
  const progressions: Record<string, string[]> = {
    lofi: ["i", "VI", "III", "VII"],
    trap: ["i", "VI", "III", "VII"],
    house: ["I", "V", "vi", "IV"],
    jazz: ["ii", "V", "I"],
    "boom-bap": ["i", "VII", "VI", "V"],
  };

  return progressions[genre.toLowerCase()] || ["I", "V", "vi", "IV"];
}
