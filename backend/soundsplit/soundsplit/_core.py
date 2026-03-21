from __future__ import annotations

from pathlib import Path

from ._audio import load_audio, to_mono
from ._types import SplitResult
from ._writer import write_beat_grid, write_metadata


def split(
    audio_path: str | Path,
    output_dir: str | Path | None = None,
    *,
    # Feature flags
    stems: bool = True,
    midi: bool = True,
    per_stem_midi: bool = False,
    beat_grid: bool = True,
    key: bool = True,
    # Stem separation options
    stem_model: str = "htdemucs_6s",
    device: str = "cpu",
    # MIDI transcription options
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
    # Per-stem MIDI: which stems to transcribe (None = melodic stems only)
    stems_to_transcribe: list[str] | None = None,
) -> SplitResult:
    """
    Split an audio file into DAW-ready components.

    Parameters
    ----------
    audio_path:
        Path to the source audio file (WAV, FLAC, AIFF, MP3, AAC, OGG).
    output_dir:
        Directory to write all output files into. Defaults to a folder named
        after the source file in the current working directory.
    stems:
        Separate audio into individual stems (vocals, drums, bass, guitar,
        piano, other) using demucs htdemucs_6s.
    midi:
        Transcribe the full mix to a MIDI file using basic-pitch.
    per_stem_midi:
        Also transcribe each melodic stem to its own MIDI file. Requires
        stems=True. Significantly slower.
    beat_grid:
        Detect tempo (BPM), time signature, and beat/downbeat timestamps.
    key:
        Detect the musical key of the track.
    stem_model:
        Demucs model to use for stem separation. Default: "htdemucs_6s".
    device:
        Compute device for demucs. "cpu" or "cuda".
    onset_threshold:
        basic-pitch onset sensitivity (0–1). Lower = more notes detected.
    frame_threshold:
        basic-pitch frame sensitivity (0–1). Lower = longer notes.
    stems_to_transcribe:
        Subset of stems to run MIDI transcription on when per_stem_midi=True.
        Defaults to ["vocals", "guitar", "piano", "bass"].

    Returns
    -------
    SplitResult with all extracted data and paths to output files.
    """
    audio_path = Path(audio_path)
    if output_dir is None:
        output_dir = Path.cwd() / audio_path.stem
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result = SplitResult(output_dir=output_dir, source_file=audio_path)

    print(f"[soundsplit] Loading {audio_path.name} ...")
    audio_stereo, sr = load_audio(audio_path, mono=False)
    audio_mono = to_mono(audio_stereo)
    result.duration_s = audio_mono.shape[0] / sr

    # --- Tempo / rhythm ---
    if beat_grid:
        print("[soundsplit] Detecting tempo and beat grid ...")
        from .extractors.tempo import detect_tempo, detect_time_signature

        result.bpm, result.beat_times, result.downbeat_times = detect_tempo(
            audio_mono, sr
        )
        result.time_signature = detect_time_signature(
            audio_mono, sr, result.beat_times
        )
        print(f"[soundsplit]   BPM={result.bpm:.1f}  time_sig={result.time_signature}")

    # --- Key ---
    if key:
        print("[soundsplit] Detecting key ...")
        from .extractors.key import detect_key

        result.key = detect_key(audio_mono, sr)
        print(f"[soundsplit]   Key={result.key}")

    # --- Stem separation ---
    if stems:
        print(f"[soundsplit] Separating stems with {stem_model} (device={device}) ...")
        print("[soundsplit]   This may take a while on CPU.")
        from .extractors.stems import separate_stems

        result.stems = separate_stems(
            audio_stereo, sr, output_dir, model=stem_model, device=device
        )
        written = list(result.stems.as_dict().keys())
        print(f"[soundsplit]   Stems written: {written}")

    # --- Full-mix MIDI transcription ---
    if midi:
        print("[soundsplit] Transcribing full mix to MIDI ...")
        from .extractors.midi import transcribe_midi

        midi_dir = output_dir / "midi"
        result.midi_path = transcribe_midi(
            audio_mono,
            sr,
            midi_dir / "full_song.mid",
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
        )
        print(f"[soundsplit]   MIDI written: {result.midi_path}")

    # --- Per-stem MIDI transcription ---
    if per_stem_midi and result.stems is not None:
        print("[soundsplit] Transcribing stems to MIDI ...")
        from .extractors.midi import transcribe_stems_midi

        result.stem_midi = transcribe_stems_midi(
            result.stems.as_dict(),
            output_dir,
            stems_to_transcribe=stems_to_transcribe,
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
        )
        print(f"[soundsplit]   Stem MIDI written: {list(result.stem_midi.keys())}")

    # --- Write summary files ---
    write_metadata(result)
    if beat_grid:
        write_beat_grid(result)

    print(f"[soundsplit] Done. Output in: {output_dir}")
    return result
