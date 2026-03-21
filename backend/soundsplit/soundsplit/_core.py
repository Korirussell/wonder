from __future__ import annotations

from pathlib import Path
from typing import Literal

from ._audio import load_audio, to_mono
from ._preprocess import preprocess
from ._types import BeatboxResult, HumResult, InputType, SplitResult
from ._writer import write_beat_grid, write_f0_contour, write_metadata


def split(
    audio_path: str | Path,
    output_dir: str | Path | None = None,
    *,
    # Input type — "auto" detects from the signal
    input_type: InputType | Literal["auto"] = "auto",
    # Feature flags (all default True for music; auto-adjusted for human sounds)
    stems: bool = True,
    midi: bool = True,
    per_stem_midi: bool = False,
    beat_grid: bool = True,
    key: bool = True,
    # Human-sound outputs
    hum_midi: bool = True,
    beatbox_midi: bool = True,
    # Preprocessing
    preprocess_audio: bool = True,
    denoise: bool = True,
    normalize: bool = True,
    trim_silence: bool = True,
    denoise_strength: float = 0.75,
    target_rms_db: float = -20.0,
    # Stem separation options
    stem_model: str = "htdemucs_6s",
    device: str = "cpu",
    # Polyphonic MIDI options (basic-pitch)
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
    stems_to_transcribe: list[str] | None = None,
) -> SplitResult:
    """
    Split an audio file into DAW-ready components.

    Handles both full music tracks and human-generated sounds (hums, whistles,
    beatboxing). Pass ``input_type="auto"`` (default) to let soundsplit detect
    the signal type, or set it explicitly to one of:
    "music" | "hum" | "whistle" | "vocal_melody" | "beatbox".

    For music:
        - Stem separation (demucs htdemucs_6s)
        - Polyphonic MIDI transcription (basic-pitch)
        - Tempo, beat grid, key

    For hum / whistle / vocal melody:
        - Monophonic pitch tracking (pyin) → quantized MIDI
        - Tempo, key

    For beatbox:
        - Onset detection + kick/snare/hihat classification → GM drum MIDI
        - Tempo

    Parameters
    ----------
    audio_path:
        Path to the source audio file (WAV, FLAC, AIFF, MP3, AAC, OGG).
    output_dir:
        Directory to write all output files. Defaults to ``./<stem>/``.
    input_type:
        Signal type. "auto" runs the classifier first.
    stems:
        Separate into stems (music only).
    midi:
        Polyphonic MIDI transcription (music / vocal_melody only).
    per_stem_midi:
        Also transcribe each melodic stem to MIDI (requires stems=True).
    beat_grid:
        Detect BPM, time signature, and beat timestamps (all types).
    key:
        Detect musical key (all types except beatbox).
    hum_midi:
        Write monophonic MIDI for hum/whistle/vocal_melody inputs.
    beatbox_midi:
        Write GM drum MIDI for beatbox inputs.
    stem_model:
        Demucs model name (default: "htdemucs_6s").
    device:
        Compute device for demucs: "cpu" or "cuda".
    onset_threshold:
        basic-pitch onset sensitivity 0–1.
    frame_threshold:
        basic-pitch frame sensitivity 0–1.
    stems_to_transcribe:
        Stems to MIDI-transcribe when per_stem_midi=True.

    Returns
    -------
    SplitResult
    """
    audio_path = Path(audio_path)
    if output_dir is None:
        output_dir = Path.cwd() / audio_path.stem
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result = SplitResult(output_dir=output_dir, source_file=audio_path)

    print(f"[soundsplit] Loading {audio_path.name} ...")
    audio_stereo, sr = load_audio(audio_path, mono=False)
    audio_mono_raw = to_mono(audio_stereo)
    result.duration_s = audio_mono_raw.shape[0] / sr

    # --- Preprocessing: denoise, normalize, trim ---
    # Runs on the mono signal used by all analysis extractors.
    # Stem separation keeps the original stereo so demucs preserves panning.
    if preprocess_audio:
        pre = preprocess(
            audio_mono_raw,
            sr,
            trim_silence=trim_silence,
            denoise=denoise,
            normalize=normalize,
            denoise_strength=denoise_strength,
            target_rms_db=target_rms_db,
        )
        audio_mono = pre.audio
        flags = []
        if pre.was_trimmed:
            flags.append("trimmed")
        if pre.was_denoised:
            flags.append("denoised")
        if pre.was_amplified:
            gain = pre.processed_rms_db - pre.original_rms_db
            flags.append(f"amplified {gain:+.1f}dB")
        if flags:
            print(f"[soundsplit] Preprocessed: {', '.join(flags)}"
                  f"  (RMS {pre.original_rms_db:.1f}→{pre.processed_rms_db:.1f} dBFS)")
    else:
        audio_mono = audio_mono_raw

    # --- Detect / set input type ---
    if input_type == "auto":
        print("[soundsplit] Detecting input type ...")
        from .extractors.detect_input import detect_input_type
        result.input_type = detect_input_type(audio_mono, sr)
        print(f"[soundsplit]   Detected: {result.input_type}")
    else:
        result.input_type = input_type
        print(f"[soundsplit] Input type: {result.input_type}")

    is_human = result.input_type in ("hum", "whistle", "beatbox", "vocal_melody")

    # --- Tempo / beat grid (all types) ---
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

    # --- Key (not useful for pure beatbox) ---
    if key and result.input_type != "beatbox":
        print("[soundsplit] Detecting key ...")
        from .extractors.key import detect_key

        result.key = detect_key(audio_mono, sr)
        print(f"[soundsplit]   Key={result.key}")

    # --- Music: stem separation ---
    if stems and not is_human:
        print(f"[soundsplit] Separating stems with {stem_model} (device={device}) ...")
        print("[soundsplit]   This may take a while on CPU.")
        from .extractors.stems import separate_stems

        result.stems = separate_stems(
            audio_stereo, sr, output_dir, model=stem_model, device=device
        )
        print(f"[soundsplit]   Stems: {list(result.stems.as_dict().keys())}")

    # --- Music / vocal_melody: polyphonic MIDI ---
    if midi and result.input_type not in ("hum", "whistle", "beatbox"):
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
        print(f"[soundsplit]   MIDI: {result.midi_path}")

    # --- Music: per-stem MIDI ---
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
        print(f"[soundsplit]   Stem MIDI: {list(result.stem_midi.keys())}")

    # --- Hum / whistle / vocal_melody: monophonic pitch → MIDI ---
    if hum_midi and result.input_type in ("hum", "whistle", "vocal_melody"):
        print("[soundsplit] Tracking pitch and transcribing melody MIDI ...")
        from .extractors.monophonic import transcribe_hum

        midi_path, f0_times, f0_hz, f0_conf = transcribe_hum(
            audio_mono,
            sr,
            output_dir / "midi" / "melody.mid",
            bpm=result.bpm or 120.0,
        )
        result.hum = HumResult(
            midi_path=midi_path,
            f0_times=f0_times,
            f0_hz=f0_hz,
            f0_confidence=f0_conf,
        )
        print(f"[soundsplit]   Melody MIDI: {midi_path}")

    # --- Beatbox: onset detection + drum MIDI ---
    if beatbox_midi and result.input_type == "beatbox":
        print("[soundsplit] Detecting onsets and transcribing drum MIDI ...")
        from .extractors.beatbox import transcribe_beatbox

        midi_path, onset_times, onset_labels = transcribe_beatbox(
            audio_mono,
            sr,
            output_dir / "midi" / "drums.mid",
            bpm=result.bpm or 120.0,
        )
        result.beatbox = BeatboxResult(
            midi_path=midi_path,
            onset_times=onset_times,
            onset_labels=onset_labels,
        )
        label_counts = {k: onset_labels.count(k) for k in ("kick", "snare", "hihat")}
        print(f"[soundsplit]   Drum MIDI: {midi_path}  counts={label_counts}")

    # --- Write summary files ---
    write_metadata(result)
    if beat_grid:
        write_beat_grid(result)
    if result.hum:
        write_f0_contour(result)

    print(f"[soundsplit] Done. Output in: {output_dir}")
    return result
