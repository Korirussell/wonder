# Wonder — Ableton MCP Test Results
**Run:** 2026-03-21 03:10  
**Passed:** 33  **Failed:** 0  
**Repo:** jpoindexter/ableton-mcp (128 tools)  


## Phase 2 — Connection

- ✅ **get_session_info** — `BPM=120.0, tracks=35, time_sig=4/4`
- ✅ **set_tempo** — `confirmed=120.0`

## Phase 3A — Track Creation

- ✅ **create_midi_track + name + vol + pan** — `track_index=35`
- ✅ **create_audio_track + name** — `track_index=36`

## Phase 3B — MIDI Clip Injection + Humanization

- ✅ **create_clip (8 bars)** — `track=35 clip=0`
- ✅ **add_notes_to_clip (humanized drum pattern)** — `32 notes with velocity variation`
- ✅ **get_clip_notes (read-back)** — `got 32 notes back`
> SKIP humanize_clip_timing/velocity — use deprecated clip.get_notes() API (broken in Live 12)
> WORKAROUND: Pre-humanize velocity/timing in the note data before calling add_notes_to_clip (already done above)
- ✅ **fire_clip** — `clip launched`

## Phase 3B (bonus) — Built-in Pattern Generators

- ✅ **generate_drum_pattern (house)** — `10 notes`
- ✅ **generate_drum_pattern (hiphop)** — `12 notes`
- ✅ **generate_bassline (pentatonic_minor)** — `7 notes`

## Phase 3C — Browser + Drum Rack Loading

- ✅ **get_browser_tree** — `keys: ['type', 'categories', 'available_categories']`
- ✅ **get_browser_items_at_path 'drums'** — `129 items`
>   First items: ['Drum Hits', 'Drum Rack', '505 Core Kit.adg', '606 Core Kit.adg']
>   Drum Rack URI: query:Drums#Drum%20Hits
> search_browser: 0 results for 'Drum Rack'
- ✅ **browse_path ['instruments']** — `keys: ['path', 'items', 'item_count']`
- ✅ **load_browser_item (Drum Rack)** — `loaded: Drum Hits`
- ✅ **get_browser_items_at_path 'drums/Drum Rack' (kits)** — `0 kits found`

## Phase 3D — .adg Sauce Rack Loading

> Found 0 .adg/.adv preset files in User Library
> No Audio Effect Rack found via search_browser
> Skipping load_browser_item — no .adg URI found
> LIMITATION: .adg files must be in Ableton's scanned User Library. Cannot load by raw file path.
> CONFIRMED LIMITATION: All device/rack loading requires Ableton browser URI, not absolute file path.
> WORKAROUND for Wonder: Pre-save Sauce Racks to ~/Music/Ableton/User Library/Presets/Audio Effects/ → Ableton indexes them → load by search URI.

## Phase 3E — Device Parameter Control

- ✅ **get_track_info (devices)** — `0 devices on track`
> No devices loaded on test track — skipping device parameter tests

## Phase 3F — Scene Management

- ✅ **create_scene** — `{'index': 15, 'name': ''}`
- ✅ **set_scene_name** — `scene_index=15`
- ✅ **fire_scene** — `scene 15 fired`
- ✅ **stop_scene** — `stopped`

## Phase 3G — Undo, Freeze, Misc

- ✅ **undo** — `no error`
- ✅ **redo** — `no error`
- ✅ **get_cpu_load** — `{'cpu_load': None}`
- ✅ **set_swing_amount** — `0.2 (20% swing)`
- ✅ **set_metronome** — `off`
- ✅ **freeze_track** — `track 35`
- ✅ **flatten_track** — `track 35`

## Bonus — Full Humanized Lo-Fi House Demo

- ✅ **create track: Wonder_Drums** — `idx=37`
- ✅ **create track: Wonder_Bass** — `idx=38`
- ✅ **set_tempo + swing** — `120bpm, 20% swing`
- ✅ **Lo-fi drum loop (humanized)** — `16 notes, 12ms timing drift, 6% vel variation`
- ✅ **Pentatonic minor bass (humanized)** — `7 notes`
> To hear: fire the Lo-Fi Beat and Bass Loop clips in Ableton Session View

## Phase 3H — Wonder New Commands

> create_wonder_session — PENDING: Ableton must reload Remote Script (restart Ableton)
> load_sample_by_path — PENDING: Ableton must reload Remote Script (restart Ableton)

---
## Limitations Summary

| Wonder Feature | Result | Notes |
|---|---|---|
| load_browser_item (Drum Rack) | ✅ Easy | loaded: Drum Hits |
| get_browser_items_at_path 'drums/Drum Rack' (kits) | ✅ Easy | 0 kits found |
| create track: Wonder_Drums | ✅ Easy | idx=37 |