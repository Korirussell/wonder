/**
 * Music Validation Middleware for Wonder
 * Ensures MIDI generation follows music theory rules
 */

import { SessionState, isInstrumentLoaded } from "./sessionState";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Scale definitions (semitone intervals from root)
 */
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  "pentatonic major": [0, 2, 4, 7, 9],
  "pentatonic minor": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/**
 * Note name to MIDI number mapping
 */
const NOTE_MAP: Record<string, number> = {
  C: 0, "C#": 1, Db: 1,
  D: 2, "D#": 3, Eb: 3,
  E: 4,
  F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8,
  A: 9, "A#": 10, Bb: 10,
  B: 11,
};

/**
 * Validate that notes are in the session's key and scale
 */
export function validateNotes(
  notes: number[][],
  key: string,
  scale: string
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const rootNote = NOTE_MAP[key];
  if (rootNote === undefined) {
    result.valid = false;
    result.errors.push(`Invalid key: ${key}`);
    return result;
  }

  const scaleIntervals = SCALES[scale.toLowerCase()];
  if (!scaleIntervals) {
    result.valid = false;
    result.errors.push(`Invalid scale: ${scale}`);
    return result;
  }

  // Build valid MIDI notes for this key/scale (across all octaves)
  const validNotes = new Set<number>();
  for (let octave = 0; octave < 11; octave++) {
    for (const interval of scaleIntervals) {
      const midiNote = octave * 12 + rootNote + interval;
      if (midiNote >= 0 && midiNote <= 127) {
        validNotes.add(midiNote);
      }
    }
  }

  // Check each note
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const pitch = note[0];
    const velocity = note[3];

    // Validate pitch is in scale
    if (!validNotes.has(pitch)) {
      result.warnings.push(
        `Note ${i}: Pitch ${pitch} is not in ${key} ${scale} scale`
      );
    }

    // Validate velocity range
    if (velocity < 1 || velocity > 127) {
      result.errors.push(
        `Note ${i}: Velocity ${velocity} out of range (1-127)`
      );
      result.valid = false;
    }

    // Validate MIDI pitch range
    if (pitch < 0 || pitch > 127) {
      result.errors.push(
        `Note ${i}: Pitch ${pitch} out of MIDI range (0-127)`
      );
      result.valid = false;
    }
  }

  return result;
}

/**
 * Validate voice leading between consecutive notes
 */
export function validateVoiceLeading(notes: number[][]): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  for (let i = 1; i < notes.length; i++) {
    const prevPitch = notes[i - 1][0];
    const currPitch = notes[i][0];
    const interval = Math.abs(currPitch - prevPitch);

    // Warn on large leaps (> 7 semitones / perfect 5th)
    if (interval > 7) {
      result.warnings.push(
        `Large leap of ${interval} semitones between notes ${i - 1} and ${i}. Consider stepwise motion.`
      );
    }

    // Warn on extreme leaps (> 12 semitones / octave)
    if (interval > 12) {
      result.warnings.push(
        `Extreme leap of ${interval} semitones. This may sound unnatural.`
      );
    }
  }

  return result;
}

/**
 * Validate chord progression follows music theory
 */
export function validateChordProgression(
  chords: string[],
  key: string,
  scale: string
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (chords.length === 0) {
    result.warnings.push("No chord progression defined");
    return result;
  }

  // Common progressions by scale type
  const commonProgressions: Record<string, string[][]> = {
    major: [
      ["I", "V", "vi", "IV"],
      ["I", "IV", "V", "I"],
      ["ii", "V", "I"],
    ],
    minor: [
      ["i", "VI", "III", "VII"],
      ["i", "iv", "VII", "VI"],
      ["i", "iv", "v", "i"],
    ],
  };

  // This is a simplified check - in production, you'd parse chord symbols
  // and validate they're diatonic to the key
  const scaleType = scale.toLowerCase().includes("minor") ? "minor" : "major";
  const common = commonProgressions[scaleType];

  if (common && chords.length >= 4) {
    // Check if progression matches any common pattern
    const matchesCommon = common.some((pattern) =>
      pattern.every((chord, i) => chords[i]?.includes(chord))
    );

    if (!matchesCommon) {
      result.warnings.push(
        "Chord progression doesn't match common patterns. This may be intentional for creative purposes."
      );
    }
  }

  return result;
}

/**
 * Validate that an instrument is loaded before creating MIDI
 */
export function validateInstrumentLoaded(
  trackIndex: number,
  sessionState: SessionState
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!isInstrumentLoaded(sessionState, trackIndex)) {
    result.valid = false;
    result.errors.push(
      `Track ${trackIndex} has no instrument loaded. Load an instrument before creating MIDI clips.`
    );
  }

  return result;
}

/**
 * Validate velocity range for genre
 */
export function validateVelocityForGenre(
  notes: number[][],
  genre: string
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const genreRanges: Record<string, { min: number; max: number }> = {
    lofi: { min: 60, max: 95 },
    trap: { min: 80, max: 127 },
    house: { min: 90, max: 120 },
    jazz: { min: 50, max: 90 },
    "boom-bap": { min: 70, max: 110 },
  };

  const range = genreRanges[genre.toLowerCase()];
  if (!range) {
    return result; // Unknown genre, skip validation
  }

  for (let i = 0; i < notes.length; i++) {
    const velocity = notes[i][3];
    if (velocity < range.min || velocity > range.max) {
      result.warnings.push(
        `Note ${i}: Velocity ${velocity} outside typical ${genre} range (${range.min}-${range.max})`
      );
    }
  }

  return result;
}

/**
 * Validate note durations are musically sensible
 */
export function validateNoteDurations(notes: number[][]): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const commonDurations = [
    0.0625, // 64th note
    0.125, // 32nd note
    0.25, // 16th note
    0.5, // 8th note
    0.75, // dotted 8th
    1.0, // quarter note
    1.5, // dotted quarter
    2.0, // half note
    3.0, // dotted half
    4.0, // whole note
  ];

  for (let i = 0; i < notes.length; i++) {
    const duration = notes[i][2];

    if (duration <= 0) {
      result.errors.push(`Note ${i}: Duration ${duration} must be positive`);
      result.valid = false;
    }

    // Warn if duration doesn't match common note values
    const isCommon = commonDurations.some(
      (d) => Math.abs(d - duration) < 0.01
    );
    if (!isCommon && duration < 4) {
      result.warnings.push(
        `Note ${i}: Duration ${duration} is unusual. Common values: 0.25, 0.5, 1.0, 2.0, 4.0`
      );
    }
  }

  return result;
}

/**
 * Comprehensive validation before sending to Ableton
 */
export function validateBeforeExecution(
  toolName: string,
  params: Record<string, unknown>,
  sessionState: SessionState
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  switch (toolName) {
    case "add_notes_to_clip": {
      const trackIndex = params.track_index as number;
      const notes = params.notes as number[][];

      // Check instrument loaded
      const instrumentCheck = validateInstrumentLoaded(trackIndex, sessionState);
      result.errors.push(...instrumentCheck.errors);
      result.warnings.push(...instrumentCheck.warnings);
      if (!instrumentCheck.valid) result.valid = false;

      // Check notes are in key/scale
      if (notes && notes.length > 0) {
        const notesCheck = validateNotes(notes, sessionState.key, sessionState.scale);
        result.warnings.push(...notesCheck.warnings);
        if (!notesCheck.valid) {
          result.errors.push(...notesCheck.errors);
          result.valid = false;
        }

        // Check voice leading
        const voiceLeadingCheck = validateVoiceLeading(notes);
        result.warnings.push(...voiceLeadingCheck.warnings);

        // Check durations
        const durationCheck = validateNoteDurations(notes);
        result.errors.push(...durationCheck.errors);
        result.warnings.push(...durationCheck.warnings);
        if (!durationCheck.valid) result.valid = false;
      }
      break;
    }

    case "create_clip": {
      const trackIndex = params.track_index as number;
      const track = sessionState.tracks.find((t) => t.index === trackIndex);
      if (!track) {
        result.valid = false;
        result.errors.push(`Track ${trackIndex} does not exist`);
      }
      break;
    }

    case "create_midi_track":
    case "create_audio_track": {
      const index = params.index as number;
      if (index < 0) {
        result.valid = false;
        result.errors.push("Track index must be non-negative");
      }
      break;
    }
  }

  return result;
}

/**
 * Merge multiple validation results
 */
export function mergeValidationResults(
  ...results: ValidationResult[]
): ValidationResult {
  return {
    valid: results.every((r) => r.valid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}
