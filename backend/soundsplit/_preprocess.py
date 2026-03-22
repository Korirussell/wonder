from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class PreprocessResult:
    audio: np.ndarray   # cleaned mono float32 (samples,)
    sr: int
    was_trimmed: bool
    was_denoised: bool
    was_amplified: bool
    original_rms_db: float
    processed_rms_db: float


def preprocess(
    audio_mono: np.ndarray,
    sr: int,
    *,
    trim_silence: bool = True,
    denoise: bool = True,
    normalize: bool = True,
    target_rms_db: float = -20.0,   # target RMS level for analysis
    denoise_strength: float = 0.75,  # 0–1; conservative to avoid artefacts
    trim_top_db: float = 35.0,       # silence threshold in dB below peak
) -> PreprocessResult:
    """
    Clean audio before analysis: trim silence, reduce noise, amplify.

    This runs on the mono downmix used for all analysis extractors
    (type detection, key, tempo, MIDI transcription). Stem separation
    always uses the original stereo so demucs can preserve panning.

    Parameters
    ----------
    audio_mono:
        Mono float32 signal.
    sr:
        Sample rate.
    trim_silence:
        Strip leading / trailing silence using librosa's top-db gate.
    denoise:
        Apply stationary noise reduction (noisereduce spectral gating).
        Uses the quietest 10% of frames as a noise profile so it works
        without a separate noise reference.
    normalize:
        RMS-normalize to target_rms_db so that quiet recordings (e.g. a
        soft hum recorded on a phone) reach a consistent level.
    target_rms_db:
        Target RMS in dBFS for the normalized output. -20 dBFS is a safe
        working level — loud enough for confident pitch detection without
        clipping.
    denoise_strength:
        Proportion of noise to remove (0 = none, 1 = full). 0.75 is
        conservative; raise toward 1.0 for very noisy recordings.
    trim_top_db:
        Frames more than this many dB below the peak are considered silence.

    Returns
    -------
    PreprocessResult with the cleaned audio and diagnostic flags.
    """
    import librosa

    audio = audio_mono.copy().astype(np.float32)
    original_rms_db = _rms_db(audio)
    was_trimmed = was_denoised = was_amplified = False

    # --- 1. Trim leading / trailing silence ---
    if trim_silence:
        trimmed, _ = librosa.effects.trim(audio, top_db=trim_top_db)
        if len(trimmed) > int(0.1 * sr):  # keep trim only if >100ms remains
            audio = trimmed
            was_trimmed = True

    # --- 2. Stationary noise reduction ---
    if denoise:
        audio = _denoise(audio, sr, strength=denoise_strength)
        was_denoised = True

    # --- 3. RMS normalization ---
    if normalize:
        rms = _rms_db(audio)
        gain_db = target_rms_db - rms
        if abs(gain_db) > 1.0:  # skip if already within 1 dB
            gain_linear = 10 ** (gain_db / 20)
            amplified = audio * gain_linear
            # Hard-limit to ±1 to prevent clipping on peaks
            audio = np.clip(amplified, -1.0, 1.0)
            was_amplified = True

    processed_rms_db = _rms_db(audio)

    return PreprocessResult(
        audio=audio,
        sr=sr,
        was_trimmed=was_trimmed,
        was_denoised=was_denoised,
        was_amplified=was_amplified,
        original_rms_db=original_rms_db,
        processed_rms_db=processed_rms_db,
    )


def _rms_db(audio: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < 1e-10:
        return -100.0
    return 20 * np.log10(rms)


def _denoise(audio: np.ndarray, sr: int, strength: float) -> np.ndarray:
    """
    Spectral-gating noise reduction (pure numpy/scipy, no extra deps).

    Estimates a noise profile from the quietest 15% of STFT frames, then
    applies a soft Wiener-style gain mask to suppress bins below the noise
    floor. Works well for stationary noise: room hiss, mic self-noise,
    phone recording artefacts.

    strength (0–1) scales how aggressively sub-noise bins are attenuated.
    At 0.75 the residual noise floor sits ~12 dB below the signal.
    """
    from scipy.signal import stft, istft

    n_fft = 1024
    hop = n_fft // 4
    win = "hann"

    _freqs, times, Z = stft(audio, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop)
    mag = np.abs(Z)
    phase = np.angle(Z)

    # Noise profile: median magnitude of the quietest 15% of frames
    frame_energy = mag.sum(axis=0)
    n_noise = max(1, int(0.15 * len(times)))
    noise_frames = np.argsort(frame_energy)[:n_noise]
    noise_profile = np.median(mag[:, noise_frames], axis=1, keepdims=True)  # (F, 1)

    # Soft spectral gate: gain = max(0, 1 - strength * noise / (signal + eps))
    gain = np.maximum(0.0, 1.0 - strength * noise_profile / (mag + 1e-10))
    Z_clean = gain * mag * np.exp(1j * phase)

    _, audio_clean = istft(Z_clean, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop)

    # Match length to input (STFT/ISTFT may add a few samples)
    audio_clean = audio_clean[: len(audio)].astype(np.float32)
    if len(audio_clean) < len(audio):
        audio_clean = np.pad(audio_clean, (0, len(audio) - len(audio_clean)))

    return audio_clean
