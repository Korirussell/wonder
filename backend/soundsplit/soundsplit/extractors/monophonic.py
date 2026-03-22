from __future__ import annotations

from pathlib import Path

import numpy as np


def transcribe_hum(
    audio_mono: np.ndarray,
    sr: int,
    output_path: Path,
    *,
    fmin: float = 65.4,        # C2 — covers low baritone hums
    fmax: float = 2093.0,      # C7 — covers whistles
    min_note_s: float = 0.06,  # discard note segments shorter than this
    bpm: float = 120.0,
) -> tuple[Path, list[float], list[float], list[float]]:
    """
    Transcribe a monophonic hum, whistle, or vocal melody to MIDI.

    Strategy
    --------
    Rather than relying on pyin's voiced_prob threshold (which collapses to
    near-zero on noisy or very quiet recordings), we use a two-stage approach:

    1. **Energy segmentation** — split the signal into "active" (humming) and
       "silent" (breath / pause) regions using RMS energy with a relative
       threshold.  This is robust to low signal levels.

    2. **Median pyin F0 per segment** — within each active segment, run pyin
       and take the *median* of all frames that returned *any* F0 estimate
       (voiced_prob > 0).  The median filters out stray octave errors and
       noise.  We don't require high voiced_prob — if pyin found a pitch at
       all, we trust the median of those estimates.

    Returns
    -------
    (midi_path, f0_times, f0_hz, f0_confidence)
        f0_hz values are 0.0 for silent frames.
    """
    import librosa
    import mido
    from scipy.signal import medfilt

    hop = 512

    # ------------------------------------------------------------------
    # 1. Full-signal pyin — get the raw pitch contour
    # ------------------------------------------------------------------
    f0, _vf, voiced_prob = librosa.pyin(
        audio_mono,
        fmin=fmin,
        fmax=fmax,
        sr=sr,
        hop_length=hop,
        fill_na=0.0,
    )
    frame_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop)

    # Smooth F0 with a median filter to remove frame-level jitter
    f0_smooth = medfilt(f0, kernel_size=5).astype(np.float32)

    # ------------------------------------------------------------------
    # 2. Energy-based activity detection
    #    Use RMS in short frames; a segment is "active" when its RMS
    #    exceeds a relative threshold (20 dB below the peak RMS frame).
    # ------------------------------------------------------------------
    rms = librosa.feature.rms(y=audio_mono, frame_length=hop * 2, hop_length=hop)[0]
    # Align RMS length to f0 length
    rms = rms[: len(f0)]
    if len(rms) < len(f0):
        rms = np.pad(rms, (0, len(f0) - len(rms)))

    rms_db = 20 * np.log10(np.maximum(rms, 1e-10))
    peak_rms_db = rms_db.max()
    active_mask = rms_db > (peak_rms_db - 20.0)  # within 20 dB of peak

    # ------------------------------------------------------------------
    # 3. Segment active regions into discrete note events
    # ------------------------------------------------------------------
    notes: list[tuple[float, float, int, int]] = []  # (onset_s, offset_s, midi, vel)
    min_frames = max(1, int(min_note_s * sr / hop))

    i = 0
    n = len(active_mask)
    while i < n:
        if not active_mask[i]:
            i += 1
            continue
        # Find end of this active run
        j = i + 1
        while j < n and active_mask[j]:
            j += 1

        if (j - i) < min_frames:
            i = j
            continue

        # Collect pyin F0 values within this segment
        seg_f0 = f0_smooth[i:j]
        seg_vp = voiced_prob[i:j]
        seg_rms = rms[i:j]

        # Take F0 estimates where pyin found anything (voiced_prob > 0)
        any_voiced = seg_f0 > 0
        if not any_voiced.any():
            i = j
            continue

        # Weighted median: weight by voiced_prob * rms so that
        # louder, more confident frames dominate the pitch estimate
        candidate_f0 = seg_f0[any_voiced]
        weights = (seg_vp[any_voiced] + 0.01) * seg_rms[any_voiced]
        median_f0 = float(_weighted_median(candidate_f0, weights))

        if median_f0 <= 0:
            i = j
            continue

        midi_note = int(np.round(12 * np.log2(median_f0 / 440) + 69))
        midi_note = int(np.clip(midi_note, 21, 108))
        onset_s = float(frame_times[i])
        offset_s = float(frame_times[min(j, n - 1)])
        # Velocity: scale peak voiced_prob in segment to 50-110
        vel = int(np.clip(50 + 60 * seg_vp.max(), 50, 110))
        notes.append((onset_s, offset_s, midi_note, vel))

        i = j

    # ------------------------------------------------------------------
    # 4. Write MIDI
    # ------------------------------------------------------------------
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ticks_per_beat = 480
    mid = mido.MidiFile(type=0, ticks_per_beat=ticks_per_beat)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    tempo = mido.bpm2tempo(bpm)
    track.append(mido.MetaMessage("set_tempo", tempo=tempo, time=0))

    events: list[tuple[int, str, int, int]] = []
    for onset_s, offset_s, midi_note, vel in notes:
        on_tick = int(mido.second2tick(onset_s, ticks_per_beat, tempo))
        off_tick = int(mido.second2tick(offset_s, ticks_per_beat, tempo))
        events.append((on_tick, "on", midi_note, vel))
        events.append((off_tick, "off", midi_note, 0))
    events.sort(key=lambda e: e[0])

    prev_tick = 0
    for tick, kind, note, vel in events:
        delta = max(0, tick - prev_tick)
        if kind == "on":
            track.append(mido.Message("note_on", note=note, velocity=vel, time=delta))
        else:
            track.append(mido.Message("note_off", note=note, velocity=0, time=delta))
        prev_tick = tick

    mid.save(str(output_path))

    return (
        output_path,
        frame_times.tolist(),
        f0.tolist(),
        voiced_prob.tolist(),
    )


def _weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    """Compute the weighted median of values."""
    idx = np.argsort(values)
    sorted_vals = values[idx]
    sorted_weights = weights[idx]
    cumulative = np.cumsum(sorted_weights)
    midpoint = cumulative[-1] / 2.0
    return float(sorted_vals[cumulative >= midpoint][0])
