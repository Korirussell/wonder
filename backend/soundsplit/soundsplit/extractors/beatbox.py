from __future__ import annotations

from pathlib import Path

import numpy as np

# General MIDI drum notes (channel 9, 0-indexed)
_GM = {"kick": 36, "snare": 38, "hihat": 42}


def _classify_onset(audio_mono: np.ndarray, sr: int, onset_sample: int) -> str:
    """
    Classify a single onset as "kick", "snare", or "hihat" using a 30 ms attack window.

    Decision rules (tuned for typical beatbox spectra):
      - centroid < 800 Hz  AND  sub-300 Hz energy fraction > 0.45  →  kick
      - centroid > 3000 Hz AND  sub-300 Hz energy fraction < 0.25  →  hihat
      - otherwise                                                   →  snare
    """
    import librosa

    window_samples = int(0.030 * sr)
    start = max(0, onset_sample)
    end = min(len(audio_mono), onset_sample + window_samples)
    window = audio_mono[start:end]

    if len(window) < 32:
        return "snare"

    S = np.abs(librosa.stft(window, n_fft=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=512)

    centroid = float(librosa.feature.spectral_centroid(S=S, sr=sr).mean())
    total_energy = S.sum() + 1e-9
    low_energy = S[freqs < 300].sum() / total_energy

    if centroid < 800 and low_energy > 0.45:
        return "kick"
    if centroid > 3000 and low_energy < 0.25:
        return "hihat"
    return "snare"


def transcribe_beatbox(
    audio_mono: np.ndarray,
    sr: int,
    output_path: Path,
    *,
    onset_delta: float = 0.07,
    bpm: float = 120.0,
) -> tuple[Path, list[float], list[str]]:
    """
    Detect and classify beatbox onsets, then write a GM drum MIDI file.

    Each onset is classified as kick / snare / hihat based on spectral centroid
    and low-frequency energy. Output is a type-0 MIDI file on channel 9
    (General MIDI percussion channel).

    Returns
    -------
    (midi_path, onset_times_seconds, onset_labels)
    """
    import librosa
    import mido

    # --- Onset detection ---
    onset_frames = librosa.onset.onset_detect(
        y=audio_mono,
        sr=sr,
        units="frames",
        backtrack=True,
        delta=onset_delta,
        pre_max=3,
        post_max=3,
        pre_avg=3,
        post_avg=5,
        wait=4,  # minimum ~46 ms gap between onsets
    )
    onset_samples = librosa.frames_to_samples(onset_frames)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()

    # Onset strength for velocity scaling
    env = librosa.onset.onset_strength(y=audio_mono, sr=sr)
    env_at_onsets = env[np.minimum(onset_frames, len(env) - 1)]
    env_min, env_max = env_at_onsets.min(), env_at_onsets.max()
    env_range = env_max - env_min + 1e-9

    # --- Classify each onset ---
    labels: list[str] = []
    for sample in onset_samples:
        labels.append(_classify_onset(audio_mono, sr, int(sample)))

    # --- Write GM drum MIDI ---
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ticks_per_beat = 480
    mid = mido.MidiFile(type=0, ticks_per_beat=ticks_per_beat)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    tempo = mido.bpm2tempo(bpm)
    track.append(mido.MetaMessage("set_tempo", tempo=tempo, time=0))

    hit_duration_ticks = int(mido.second2tick(0.03, ticks_per_beat, tempo))  # 30 ms note

    events: list[tuple[int, str, int, int]] = []
    for t, label, strength in zip(onset_times, labels, env_at_onsets):
        note = _GM[label]
        vel = int(np.clip(50 + 60 * (strength - env_min) / env_range, 50, 110))
        tick = int(mido.second2tick(t, ticks_per_beat, tempo))
        events.append((tick, "on", note, vel))
        events.append((tick + hit_duration_ticks, "off", note, 0))

    events.sort(key=lambda e: e[0])

    prev_tick = 0
    for tick, kind, note, vel in events:
        delta = max(0, tick - prev_tick)
        ch = 9  # GM percussion channel
        if kind == "on":
            track.append(mido.Message("note_on", channel=ch, note=note, velocity=vel, time=delta))
        else:
            track.append(mido.Message("note_off", channel=ch, note=note, velocity=0, time=delta))
        prev_tick = tick

    mid.save(str(output_path))
    return output_path, onset_times, labels
