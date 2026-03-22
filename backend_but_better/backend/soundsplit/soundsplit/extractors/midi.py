from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np


def transcribe_midi(
    audio_mono: np.ndarray,
    sr: int,
    output_path: Path,
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
    minimum_note_length: float = 0.058,
) -> Path:
    """
    Transcribe a mono audio signal to a MIDI file using Spotify's basic-pitch.

    Parameters
    ----------
    audio_mono:
        Mono float32 audio array.
    sr:
        Sample rate of audio_mono.
    output_path:
        Destination .mid file path.
    onset_threshold:
        Sensitivity for note onset detection (0–1). Lower = more notes detected.
    frame_threshold:
        Sensitivity for note frame activation (0–1). Lower = longer notes.
    minimum_note_length:
        Shortest note to emit, in seconds.

    Returns
    -------
    Path to the written MIDI file.

    Requires: pip install soundsplit[midi]  (installs basic-pitch)
    """
    try:
        from basic_pitch.inference import predict
    except ImportError as e:
        raise ImportError(
            "basic-pitch is required for MIDI transcription. "
            "Install it with: pip install soundsplit[midi]"
        ) from e

    # basic-pitch expects a file path, so we write a temp WAV when passed an array
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        import soundfile as sf

        sf.write(str(tmp_path), audio_mono, sr, subtype="PCM_16")

        _model_output, midi_data, _note_events = predict(
            audio_path=tmp_path,
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
            minimum_note_length=minimum_note_length,
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    midi_data.write(str(output_path))
    return output_path


def transcribe_stems_midi(
    stem_paths: dict[str, Path],
    output_dir: Path,
    stems_to_transcribe: list[str] | None = None,
    **kwargs,
) -> dict[str, Path]:
    """
    Transcribe a subset of stems to individual MIDI files.

    Parameters
    ----------
    stem_paths:
        Dict of stem name → WAV path (as returned by separate_stems).
    output_dir:
        Directory to write MIDI files into.
    stems_to_transcribe:
        Which stems to transcribe. Defaults to all melodic stems
        (vocals, guitar, piano, bass). Drums are skipped by default
        because basic-pitch produces poor drum transcriptions —
        use onset detection for drums instead.

    Returns
    -------
    Dict of stem name → MIDI file path.
    """
    from .._audio import load_audio, to_mono

    if stems_to_transcribe is None:
        stems_to_transcribe = ["vocals", "guitar", "piano", "bass"]

    midi_dir = output_dir / "midi"
    results: dict[str, Path] = {}

    for stem_name in stems_to_transcribe:
        if stem_name not in stem_paths:
            continue
        audio, sr = load_audio(stem_paths[stem_name], mono=False)
        audio_mono = to_mono(audio)
        out_path = midi_dir / f"{stem_name}.mid"
        transcribe_midi(audio_mono, sr, out_path, **kwargs)
        results[stem_name] = out_path

    return results
