# Wonder Music Production Intelligence

**Version:** 1.0  
**Purpose:** Comprehensive music theory rules, MIDI patterns, and production guidelines for reliable, high-quality music generation in Ableton Live.

---

## 🎯 Core Workflow Rules

### CRITICAL: Instrument Loading Protocol

**ALWAYS follow this exact sequence:**

1. **Create track** (`create_midi_track` or `create_audio_track`)
2. **Load instrument** (`load_browser_item` or `load_plugin_by_name`)
3. **Verify instrument loaded** (`get_track_info` to confirm device exists)
4. **Create clip** (`create_clip`)
5. **Add notes** (`add_notes_to_clip`)

**NEVER create MIDI clips without an instrument loaded first.**

### Session State Management

Maintain this JSON structure throughout the conversation:

```json
{
  "bpm": 90,
  "key": "D",
  "scale": "minor",
  "time_signature": "4/4",
  "swing": 0.15,
  "tracks": [
    {
      "index": 0,
      "name": "Drums",
      "instrument": "Drum Rack",
      "instrument_loaded": true,
      "clips": [{"index": 0, "length": 4, "pattern_type": "lofi_drums"}]
    }
  ],
  "chord_progression": ["Dm", "Am", "Bb", "F"],
  "melody_motif": [[62, 0, 0.5, 90, false], [64, 0.5, 0.5, 85, false]]
}
```

**Update this state after every tool call.**

---

## 🎼 Music Theory Fundamentals

### Scales and Modes

**Major Scale:** `[0, 2, 4, 5, 7, 9, 11]`  
**Natural Minor:** `[0, 2, 3, 5, 7, 8, 10]`  
**Harmonic Minor:** `[0, 2, 3, 5, 7, 8, 11]`  
**Melodic Minor:** `[0, 2, 3, 5, 7, 9, 11]`  
**Pentatonic Major:** `[0, 2, 4, 7, 9]`  
**Pentatonic Minor:** `[0, 3, 5, 7, 10]`  
**Blues Scale:** `[0, 3, 5, 6, 7, 10]`  
**Dorian:** `[0, 2, 3, 5, 7, 9, 10]`  
**Mixolydian:** `[0, 2, 4, 5, 7, 9, 10]`

### Scale Degree Functions

- **1 (Root):** Stable, tonic, home
- **2 (Supertonic):** Tension, leads to 1 or 3
- **3 (Mediant):** Defines major/minor quality
- **4 (Subdominant):** Pre-dominant, leads to 5
- **5 (Dominant):** Maximum tension, resolves to 1
- **6 (Submediant):** Relative minor/major pivot
- **7 (Leading Tone):** Strong pull to 1 (major), weak in minor

### Voice Leading Principles

1. **Stepwise Motion:** Prefer movements of 1-2 semitones
2. **Avoid Large Leaps:** Leaps larger than a 5th should resolve by step
3. **Chord Tone Targeting:** Land on 1, 3, 5, or 7 of the chord on strong beats
4. **Passing Tones:** Use non-chord tones on weak beats to connect chord tones
5. **Contrary Motion:** When one voice goes up, another should go down
6. **Common Tones:** Hold notes that are shared between chords

### Chord Progressions by Genre

**Lofi Hip-Hop:**
- `i - VI - III - VII` (Dm - Bb - F - C in D minor)
- `i - iv - VII - VI` (Dm - Gm - C - Bb)
- `i - VI - iv - V` (Dm - Bb - Gm - A)
- `i - III - VII - iv` (Dm - F - C - Gm)

**Trap:**
- `i - VI - III - VII` (Am - F - C - G in A minor)
- `i - iv - v - i` (Am - Dm - Em - Am)
- `i - VII - VI - VII` (Am - G - F - G)

**House:**
- `I - V - vi - IV` (C - G - Am - F in C major)
- `I - IV - V - I` (C - F - G - C)
- `vi - IV - I - V` (Am - F - C - G)

**Jazz:**
- `ii - V - I` (Dm7 - G7 - Cmaj7 in C major)
- `I - vi - ii - V` (Cmaj7 - Am7 - Dm7 - G7)
- `iii - VI - ii - V` (Em7 - A7 - Dm7 - G7)

**Boom-Bap:**
- `i - VII - VI - V` (Am - G - F - E in A minor)
- `i - iv - VII - III` (Am - Dm - G - C)

### Rhythm Patterns by Genre

**Lofi Hip-Hop:**
- Swing: 15-25% (0.15-0.25)
- Kick: On 1 and 3, occasional syncopation
- Snare: On 2 and 4
- Hi-hats: Swung 16th notes, velocity 60-80
- Melody: Lazy phrasing, start slightly behind the beat

**Trap:**
- Swing: 0-5%
- Kick: Rapid 808 rolls (32nd notes)
- Snare: On 3, with ghost notes
- Hi-hats: Triplet rolls, velocity 40-100 (varied)
- Melody: Quantized, on-grid

**House:**
- Swing: 0-10%
- Kick: Four-on-the-floor (every quarter note)
- Hi-hats: 16th notes, open on offbeats
- Melody: Syncopated, emphasize upbeats

**Boom-Bap:**
- Swing: 10-20%
- Kick: On 1 and 3.5
- Snare: On 2 and 4, hard hits (velocity 110-127)
- Hi-hats: Swung 8th notes

---

## 🎹 Instrument Selection Rules

### Default Instruments by Track Type

**Drums:**
- Primary: "Drum Rack" (Ableton built-in)
- Alternative: Search for "808" kit via `search_plugins`
- Load samples onto pads: Kick=36, Snare=38, HH=42

**Bass:**
- Primary: `search_plugins("Serum")` → "Sub Bass" preset
- Alternative: "Wavetable" → "Sub Bass" preset
- Alternative: "Analog" → "Bass" category
- Set filter cutoff: 0.4-0.6 for warmth

**Melody/Lead:**
- Lofi: "Electric Piano" or "Rhodes"
- Trap: `search_plugins("Vital")` → "Lead" preset
- House: "Wavetable" → "Pluck" preset
- Jazz: "Electric Piano" → "Wurlitzer"

**Chords/Pads:**
- Lofi: "Electric Piano" → "Soft EP"
- Trap: "Analog" → "Pad" category
- House: "Wavetable" → "Pad" preset
- Jazz: "Electric Piano" → "Rhodes"

### VST Parameter Presets

**Serum 808 Bass:**
```
After loading Serum, call get_device_parameters(track_index, 0)
Then set approximately:
- Osc A Waveform: Sine (parameter ~0-10)
- Amp Env Attack: 0.0
- Amp Env Decay: 0.75-0.9
- Amp Env Sustain: 0.0
- Amp Env Release: 0.3
- Filter Cutoff: 0.5
- Filter Resonance: 0.2
```

**Lofi Keys (Electric Piano):**
```
- Low-pass filter: 800-1200Hz
- Reverb: Wet 0.3, Decay 2.5s
- Slight detuning: -5 to +5 cents
```

---

## 🎵 MIDI Pattern Library

### Lofi Hip-Hop Patterns

**Lofi Drum Pattern (90bpm, 4 bars):**
```python
# Kick (36)
[[36, 0.0, 0.25, 110, False], [36, 2.0, 0.25, 105, False],
 [36, 3.5, 0.25, 100, False], [36, 4.0, 0.25, 110, False],
 [36, 6.0, 0.25, 105, False], [36, 7.5, 0.25, 100, False],
 [36, 8.0, 0.25, 110, False], [36, 10.0, 0.25, 105, False],
 [36, 11.5, 0.25, 100, False], [36, 12.0, 0.25, 110, False],
 [36, 14.0, 0.25, 105, False], [36, 15.5, 0.25, 100, False],
 
 # Snare (38)
 [38, 1.0, 0.25, 95, False], [38, 3.0, 0.25, 90, False],
 [38, 5.0, 0.25, 95, False], [38, 7.0, 0.25, 90, False],
 [38, 9.0, 0.25, 95, False], [38, 11.0, 0.25, 90, False],
 [38, 13.0, 0.25, 95, False], [38, 15.0, 0.25, 90, False],
 
 # Closed Hi-Hat (42) - swung 16ths
 [42, 0.0, 0.125, 70, False], [42, 0.6, 0.125, 60, False],
 [42, 1.0, 0.125, 75, False], [42, 1.6, 0.125, 65, False],
 [42, 2.0, 0.125, 70, False], [42, 2.6, 0.125, 60, False],
 [42, 3.0, 0.125, 75, False], [42, 3.6, 0.125, 65, False]]
# Repeat pattern for bars 2-4
```

**Lofi Melody (D minor pentatonic, 90bpm):**
```python
# D-F-G-A-C pentatonic
[[62, 0.0, 0.5, 85, False],    # D (root)
 [65, 0.5, 0.5, 80, False],    # F (minor 3rd)
 [67, 1.0, 1.0, 90, False],    # G (4th, held)
 [65, 2.0, 0.5, 75, False],    # F (return)
 [62, 2.5, 0.5, 70, False],    # D (resolve)
 [60, 3.0, 0.5, 85, False],    # C (7th)
 [62, 3.5, 0.5, 80, False],    # D (back to root)
 
 # Bar 2 - variation
 [67, 4.0, 0.5, 85, False],    # G
 [69, 4.5, 0.5, 80, False],    # A (5th)
 [67, 5.0, 1.0, 90, False],    # G (held)
 [65, 6.0, 0.5, 75, False],    # F
 [67, 6.5, 1.5, 85, False]]    # G (long note)
```

**Lofi Bassline (D minor, root-fifth movement):**
```python
# Bass notes in C2-C3 range (50-62) for proper sub-bass
[[50, 0.0, 0.75, 110, False],   # D2 (root)
 [57, 1.0, 0.5, 105, False],    # A2 (5th)
 [53, 2.0, 0.75, 110, False],   # F2 (III)
 [60, 3.0, 0.5, 105, False],    # C3 (VII)
 
 # Bar 2
 [50, 4.0, 0.75, 110, False],   # D2
 [57, 5.0, 0.5, 105, False],    # A2
 [55, 6.0, 0.75, 110, False],   # G2 (IV)
 [53, 7.0, 0.5, 105, False]]    # F2
```

**Lofi Chords (Dm-Bb-F-C progression):**
```python
# Dm chord (D-F-A)
[[62, 0.0, 2.0, 80, False],    # D
 [65, 0.0, 2.0, 75, False],    # F
 [69, 0.0, 2.0, 70, False],    # A
 
 # Bb chord (Bb-D-F)
 [58, 2.0, 2.0, 80, False],    # Bb
 [62, 2.0, 2.0, 75, False],    # D
 [65, 2.0, 2.0, 70, False],    # F
 
 # F chord (F-A-C)
 [53, 4.0, 2.0, 80, False],    # F
 [57, 4.0, 2.0, 75, False],    # A
 [60, 4.0, 2.0, 70, False],    # C
 
 # C chord (C-E-G)
 [48, 6.0, 2.0, 80, False],    # C
 [52, 6.0, 2.0, 75, False],    # E
 [55, 6.0, 2.0, 70, False]]    # G
```

### Trap Patterns

**Trap Drum Pattern (140bpm, 4 bars):**
```python
# 808 Kick with rolls
[[36, 0.0, 0.5, 127, False],
 [36, 1.0, 0.5, 120, False],
 [36, 2.0, 0.5, 127, False],
 [36, 2.75, 0.125, 100, False],  # Roll
 [36, 2.875, 0.125, 110, False], # Roll
 [36, 3.0, 0.5, 127, False],
 
 # Snare (38)
 [38, 1.0, 0.25, 110, False],
 [38, 3.0, 0.25, 110, False],
 [38, 5.0, 0.25, 110, False],
 [38, 7.0, 0.25, 110, False],
 
 # Hi-hat triplet rolls (42)
 [42, 0.0, 0.083, 80, False],
 [42, 0.333, 0.083, 60, False],
 [42, 0.667, 0.083, 70, False],
 [42, 1.0, 0.083, 90, False]]
# Continue pattern...
```

**Trap Melody (A minor scale, 140bpm):**
```python
# Fast, repetitive motif in C4-C5 range
[[69, 0.0, 0.25, 100, False],   # A4
 [72, 0.25, 0.25, 95, False],   # C5
 [74, 0.5, 0.25, 100, False],   # D5
 [72, 0.75, 0.25, 90, False],   # C5
 [69, 1.0, 0.5, 105, False],    # A4 (held)
 
 [67, 2.0, 0.25, 100, False],   # G4
 [69, 2.25, 0.25, 95, False],   # A4
 [72, 2.5, 0.5, 100, False],    # C5 (held)
 [74, 3.0, 1.0, 110, False]]    # D5 (long)
```

### House Patterns

**House Drum Pattern (128bpm, 4 bars):**
```python
# Four-on-the-floor kick
[[36, 0.0, 0.25, 120, False],
 [36, 1.0, 0.25, 120, False],
 [36, 2.0, 0.25, 120, False],
 [36, 3.0, 0.25, 120, False],
 [36, 4.0, 0.25, 120, False],
 [36, 5.0, 0.25, 120, False],
 [36, 6.0, 0.25, 120, False],
 [36, 7.0, 0.25, 120, False],
 
 # Clap on 2 and 4
 [39, 1.0, 0.25, 100, False],
 [39, 3.0, 0.25, 100, False],
 [39, 5.0, 0.25, 100, False],
 [39, 7.0, 0.25, 100, False],
 
 # Open hi-hat on offbeats
 [46, 0.5, 0.25, 70, False],
 [46, 1.5, 0.25, 70, False],
 [46, 2.5, 0.25, 70, False],
 [46, 3.5, 0.25, 70, False]]
```

**House Bassline (C major, 128bpm):**
```python
# Syncopated, emphasize upbeats - C2-C3 range for house bass
[[48, 0.0, 0.25, 110, False],   # C2
 [48, 0.5, 0.25, 100, False],   # C2 (upbeat)
 [55, 1.0, 0.25, 110, False],   # G2
 [48, 2.0, 0.25, 110, False],   # C2
 [53, 2.5, 0.25, 100, False],   # F2 (upbeat)
 [55, 3.0, 0.25, 110, False],   # G2
 [55, 3.5, 0.25, 100, False]]   # G2 (upbeat)
```

### Jazz Patterns

**Jazz Chord Progression (ii-V-I in C major):**
```python
# Dm7 (D-F-A-C)
[[50, 0.0, 2.0, 75, False],    # D
 [53, 0.0, 2.0, 70, False],    # F
 [57, 0.0, 2.0, 65, False],    # A
 [60, 0.0, 2.0, 60, False],    # C
 
 # G7 (G-B-D-F)
 [55, 2.0, 2.0, 75, False],    # G
 [59, 2.0, 2.0, 70, False],    # B
 [62, 2.0, 2.0, 65, False],    # D
 [65, 2.0, 2.0, 60, False],    # F
 
 # Cmaj7 (C-E-G-B)
 [48, 4.0, 4.0, 75, False],    # C
 [52, 4.0, 4.0, 70, False],    # E
 [55, 4.0, 4.0, 65, False],    # G
 [59, 4.0, 4.0, 60, False]]    # B
```

---

## 🎚️ Mixing Guidelines

### Volume Levels (0.0-1.0)
- **Kick:** 0.8-0.9
- **Bass:** 0.7-0.8
- **Snare:** 0.7-0.8
- **Hi-hats:** 0.5-0.6
- **Melody:** 0.6-0.7
- **Chords:** 0.5-0.6
- **Pads:** 0.4-0.5

### Velocity Ranges (1-127)
- **Lofi:** 60-95 (never 127 - too aggressive)
- **Trap:** 80-127 (aggressive, punchy)
- **House:** 90-120 (consistent, energetic)
- **Jazz:** 50-90 (dynamic, expressive)

### Pan Positions (-1.0 to 1.0)
- **Kick/Bass:** 0.0 (center)
- **Snare:** 0.0 (center)
- **Hi-hats:** -0.2 to 0.2 (slight stereo)
- **Melody:** -0.3 to 0.3 (wider stereo)
- **Chords:** -0.4 to 0.4 (wide stereo)

---

## 🔄 Session State Update Protocol

After EVERY tool call, update the session state JSON:

### After `create_midi_track`:
```json
{
  "tracks": [
    {
      "index": 0,
      "name": "New Track",
      "type": "midi",
      "instrument": null,
      "instrument_loaded": false,
      "clips": []
    }
  ]
}
```

### After `load_browser_item` or `load_plugin_by_name`:
```json
{
  "tracks": [
    {
      "index": 0,
      "instrument": "Electric Piano",
      "instrument_loaded": true
    }
  ]
}
```

### After `create_clip`:
```json
{
  "tracks": [
    {
      "clips": [
        {
          "index": 0,
          "length": 4,
          "notes": []
        }
      ]
    }
  ]
}
```

### After `add_notes_to_clip`:
```json
{
  "tracks": [
    {
      "clips": [
        {
          "notes": [[60, 0, 1, 100, false], ...],
          "notes_count": 16
        }
      ]
    }
  ]
}
```

---

## ✅ Validation Checklist

Before calling `add_notes_to_clip`, verify:

- [ ] Track exists (check session state)
- [ ] Instrument is loaded on track (`instrument_loaded: true`)
- [ ] Clip exists on track
- [ ] Notes are in the session's key/scale
- [ ] Notes follow voice leading rules
- [ ] Velocities are appropriate for genre
- [ ] Note durations are musically sensible

Before calling `create_clip`, verify:

- [ ] Track exists
- [ ] Instrument is loaded

Before creating a melody, verify:

- [ ] Chord progression is defined in session state
- [ ] Notes will target chord tones on strong beats
- [ ] Melody motif is consistent with previous phrases

---

## 🎯 Genre-Specific Quick Reference

### Lofi Hip-Hop
- **BPM:** 80-95
- **Swing:** 15-25%
- **Key:** Minor (Dm, Am, Em common)
- **Chords:** i-VI-III-VII, i-iv-VII-VI
- **Melody:** Pentatonic minor, lazy phrasing
- **Drums:** Swung 16ths, soft velocities
- **Instruments:** Rhodes, Electric Piano, Drum Rack

### Trap
- **BPM:** 130-150
- **Swing:** 0-5%
- **Key:** Minor (Am, Em, F#m common)
- **Chords:** i-VI-III-VII, i-iv-v-i
- **Melody:** Fast, repetitive motifs
- **Drums:** 808 rolls, triplet hi-hats
- **Instruments:** Serum, Vital, 808 kit

### House
- **BPM:** 120-130
- **Swing:** 0-10%
- **Key:** Major (C, F, G common)
- **Chords:** I-V-vi-IV, I-IV-V-I
- **Melody:** Syncopated, upbeat emphasis
- **Drums:** Four-on-the-floor, consistent
- **Instruments:** Wavetable, Analog, Drum Rack

### Boom-Bap
- **BPM:** 85-95
- **Swing:** 10-20%
- **Key:** Minor (Am, Dm common)
- **Chords:** i-VII-VI-V, i-iv-VII-III
- **Melody:** Soulful, sample-based feel
- **Drums:** Hard snare hits, swung 8ths
- **Instruments:** Electric Piano, Drum Rack

---

## 🚨 Common Mistakes to Avoid

1. **Creating MIDI without instrument** → Always load instrument first
2. **Ignoring key/scale** → All notes must be in the session's key
3. **Forgetting chord progression** → Melodies must align with chords
4. **Inconsistent velocities** → Match genre conventions
5. **No voice leading** → Avoid random note jumps
6. **Wrong rhythm for genre** → Lofi needs swing, trap doesn't
7. **Not updating session state** → Track what's been created
8. **Overwriting melody motifs** → Reuse and vary existing themes

---

## 📚 Additional Resources

### MIDI Note Numbers
- **C0:** 12, **C1:** 24, **C2:** 36, **C3:** 48, **C4:** 60 (Middle C), **C5:** 72, **C6:** 84

### General MIDI Drum Map
- **Kick:** 36
- **Snare:** 38
- **Clap:** 39
- **Closed Hi-Hat:** 42
- **Open Hi-Hat:** 46
- **Crash:** 49
- **Ride:** 51

### Chord Construction
- **Major Triad:** Root + 4 semitones + 3 semitones (C-E-G)
- **Minor Triad:** Root + 3 semitones + 4 semitones (C-Eb-G)
- **Dominant 7th:** Major triad + minor 7th (C-E-G-Bb)
- **Major 7th:** Major triad + major 7th (C-E-G-B)
- **Minor 7th:** Minor triad + minor 7th (C-Eb-G-Bb)

---

**Remember: Music is about emotion and flow. Use these rules as guidelines, not restrictions. When in doubt, trust your musical instincts and the session state.**
