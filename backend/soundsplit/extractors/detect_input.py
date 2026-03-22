from __future__ import annotations

import numpy as np

from .._types import InputType


def detect_input_type(
    audio_mono: np.ndarray,
    sr: int,
    *,
    hp_ratio_thresh: float = 0.35,
    flatness_thresh: float = 0.12,
    voiced_min_frac: float = 0.05,   # any voiced content at all
    pitch_std_hum: float = 3.5,      # semitones; below this = monophonic/hum
    pitch_std_melody: float = 8.0,   # semitones; below this = single melodic voice
) -> InputType:
    """
    Classify audio as one of: "music", "hum", "whistle", "beatbox", "vocal_melody".

    Algorithm
    ---------
    1. HPSS energy ratio (hp_ratio):
       Very low (< 0.35) with high flatness → "beatbox".

    2. pyin pitch analysis:
       - Run on any signal with hp_ratio ≥ 0.35 (i.e. not beatbox).
       - Gather all frames where pyin returns a valid F0 (voiced_prob > 0).
       - If too few voiced frames (< 5% of total) → fall through to "music".
       - Otherwise use pitch_std across voiced frames:
           pitch_std < 3.5 semitones  → "hum" or "whistle" (single held/gliding pitch)
           pitch_std < 8.0 semitones  → "vocal_melody" (single voice, melodic range)
           otherwise                  → "music"

    Using pitch_std rather than voiced_frac as the primary discriminator makes
    the classifier robust to recordings that contain silence or breath breaks
    between phrases — pyin may mark those frames as unvoiced, suppressing
    voiced_frac even when the underlying content is clearly a hum.
    """
    import librosa

    # --- 1. HPSS energy ratio ---
    S = np.abs(librosa.stft(audio_mono))
    H, P = librosa.decompose.hpss(S)
    h_energy = float(np.mean(H ** 2))
    p_energy = float(np.mean(P ** 2))
    hp_ratio = h_energy / (h_energy + p_energy + 1e-9)

    # --- 2. Spectral flatness ---
    flatness = float(librosa.feature.spectral_flatness(y=audio_mono).mean())

    # Early exit: strongly percussive + noisy → beatbox
    if hp_ratio < hp_ratio_thresh and flatness > flatness_thresh:
        return "beatbox"

    # --- 3. Monophonic pitch analysis via pyin ---
    f0, _voiced_flag, voiced_prob = librosa.pyin(
        audio_mono,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
        fill_na=0.0,
    )

    # Use a low threshold to gather any plausibly voiced frames
    voiced_mask = (voiced_prob > 0.0) & (f0 > 0)
    voiced_frac = float(voiced_mask.sum()) / max(len(f0), 1)

    if voiced_frac < voiced_min_frac:
        # Barely any voiced content detected — classify on HPSS alone
        return "beatbox" if hp_ratio < hp_ratio_thresh else "music"

    # Pitch spread across voiced frames (in semitones)
    voiced_f0 = f0[voiced_mask]
    midi_pitches = 12 * np.log2(np.maximum(voiced_f0, 1e-6) / 440) + 69
    pitch_std = float(np.std(midi_pitches))
    median_f0 = float(np.median(voiced_f0))

    if pitch_std < pitch_std_hum:
        # Near-constant or gently gliding single pitch
        return "whistle" if median_f0 > 900 else "hum"

    if pitch_std < pitch_std_melody:
        # Single melodic voice with wider range
        return "vocal_melody"

    return "music"
