from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="soundgen",
        description="Generate sounds via the ElevenLabs API.",
    )

    # Positional: plain NL description (optional if structured flags given)
    parser.add_argument(
        "text",
        nargs="?",
        help="Natural language description of the sound to generate.",
    )

    # Structured params
    parser.add_argument("--category", help="Sound category (nature, percussion, ambient, …)")
    parser.add_argument("--pitch", help="Pitch descriptor: low, mid, high, or note (e.g. C4)")
    parser.add_argument("--pitch-hz", type=float, metavar="HZ", help="Fundamental frequency in Hz")
    parser.add_argument(
        "--timbre", nargs="+", metavar="TIMBRE",
        help="One or more timbre descriptors: dark, bright, hollow, metallic, …",
    )
    parser.add_argument("--texture", help="Texture: grainy, clean, layered, …")
    parser.add_argument(
        "--intensity-label",
        choices=["quiet", "soft", "medium", "loud", "very loud"],
        dest="intensity_label",
        help="Perceived loudness.",
    )
    parser.add_argument(
        "--attack",
        choices=["sharp", "soft", "punchy", "smooth", "click", "pluck"],
        help="Attack envelope.",
    )
    parser.add_argument("--decay", help="Decay descriptor: 'fast fade', 'abrupt', 'long reverb tail', …")
    parser.add_argument(
        "--reverb",
        choices=["none", "small room", "hall", "cave", "plate", "spring"],
        help="Reverb environment.",
    )
    parser.add_argument(
        "--stereo-width",
        choices=["mono", "narrow", "wide"],
        dest="stereo_width",
        help="Stereo width.",
    )
    parser.add_argument(
        "--duration", type=float, metavar="SECONDS",
        help="Duration in seconds (0.5–22.0).",
    )
    parser.add_argument(
        "--influence", type=float, default=0.5, metavar="FLOAT",
        help="Prompt influence 0–1 (default: 0.5).",
    )
    parser.add_argument(
        "--ref-audio", metavar="PATH", dest="ref_audio",
        help="Reference audio file path — features are extracted and merged into the prompt.",
    )

    # Output
    parser.add_argument("-o", "--output", metavar="PATH", help="Output file path (e.g. out.mp3).")
    parser.add_argument("--api-key", metavar="KEY", help="ElevenLabs API key (overrides env var).")

    args = parser.parse_args()

    # Build SoundParams
    from soundgen import SoundParams, generate

    params = SoundParams(
        description=args.text,
        category=args.category,
        pitch=args.pitch,
        pitch_hz=args.pitch_hz,
        timbre=args.timbre or [],
        texture=args.texture,
        intensity_label=args.intensity_label,
        attack=args.attack,
        decay=args.decay,
        reverb=args.reverb,
        stereo_width=args.stereo_width,
        duration_seconds=args.duration,
        prompt_influence=args.influence,
        reference_audio_path=Path(args.ref_audio) if args.ref_audio else None,
    )

    # Validate: need at least some content
    structured = any([
        params.category, params.pitch, params.pitch_hz, params.timbre,
        params.texture, params.intensity_label, params.attack, params.decay,
        params.reverb, params.description, params.reference_audio_path,
    ])
    if not structured:
        parser.error("Provide a description or at least one structured parameter.")

    try:
        result = generate(
            params,
            api_key=args.api_key,
            save_to=args.output,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Prompt used: {result.prompt_used}")
    if result.output_path:
        print(f"Saved to:    {result.output_path}")
    else:
        print(f"Audio bytes: {len(result.audio_bytes)} bytes (use -o to save)")


if __name__ == "__main__":
    main()
