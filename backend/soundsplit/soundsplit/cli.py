from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="soundsplit",
        description="Split audio into DAW-ready stems, MIDI, and analysis.",
    )
    parser.add_argument("audio", type=Path, help="Input audio file")
    parser.add_argument(
        "-o", "--output", type=Path, default=None,
        help="Output directory (default: ./<audio_stem>/)",
    )
    parser.add_argument(
        "--no-stems", action="store_true",
        help="Skip stem separation (skips demucs)",
    )
    parser.add_argument(
        "--no-midi", action="store_true",
        help="Skip full-mix MIDI transcription (skips basic-pitch)",
    )
    parser.add_argument(
        "--per-stem-midi", action="store_true",
        help="Also transcribe each melodic stem to MIDI (slow)",
    )
    parser.add_argument(
        "--no-beats", action="store_true",
        help="Skip tempo / beat-grid detection",
    )
    parser.add_argument(
        "--no-key", action="store_true",
        help="Skip key detection",
    )
    parser.add_argument(
        "--model", default="htdemucs_6s",
        help="Demucs model for stem separation (default: htdemucs_6s)",
    )
    parser.add_argument(
        "--device", default="cpu", choices=["cpu", "cuda"],
        help="Compute device for demucs (default: cpu)",
    )
    parser.add_argument(
        "--onset-threshold", type=float, default=0.5,
        help="basic-pitch onset sensitivity 0–1 (default: 0.5)",
    )
    parser.add_argument(
        "--frame-threshold", type=float, default=0.3,
        help="basic-pitch frame sensitivity 0–1 (default: 0.3)",
    )

    args = parser.parse_args()

    if not args.audio.exists():
        print(f"Error: file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    from . import split

    result = split(
        audio_path=args.audio,
        output_dir=args.output,
        stems=not args.no_stems,
        midi=not args.no_midi,
        per_stem_midi=args.per_stem_midi,
        beat_grid=not args.no_beats,
        key=not args.no_key,
        stem_model=args.model,
        device=args.device,
        onset_threshold=args.onset_threshold,
        frame_threshold=args.frame_threshold,
    )

    print("\n--- Result ---")
    if result.bpm:
        print(f"  BPM:           {result.bpm:.1f}")
    if result.time_signature:
        print(f"  Time sig:      {result.time_signature}")
    if result.key:
        print(f"  Key:           {result.key}")
    if result.duration_s:
        print(f"  Duration:      {result.duration_s:.1f}s")
    if result.stems:
        print(f"  Stems:         {list(result.stems.as_dict().keys())}")
    if result.midi_path:
        print(f"  MIDI:          {result.midi_path}")
    if result.stem_midi:
        print(f"  Stem MIDI:     {list(result.stem_midi.keys())}")
    print(f"  Output dir:    {result.output_dir}")


if __name__ == "__main__":
    main()
