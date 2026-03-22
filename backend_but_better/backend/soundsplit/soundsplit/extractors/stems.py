from __future__ import annotations

from pathlib import Path

import numpy as np

from .._audio import write_wav
from .._types import StemPaths


def separate_stems(
    audio: np.ndarray,
    sr: int,
    output_dir: Path,
    model: str = "htdemucs_6s",
    device: str = "cpu",
) -> StemPaths:
    """
    Separate audio into stems using demucs.

    audio: (channels, samples) float32, stereo preferred.
    Returns StemPaths pointing to the written WAV files under output_dir/stems/.

    Requires: pip install soundsplit[stems]  (installs demucs + torch)
    """
    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError as e:
        raise ImportError(
            "demucs is required for stem separation. "
            "Install it with: pip install soundsplit[stems]"
        ) from e

    stems_dir = output_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    # demucs needs stereo (2, T)
    if audio.ndim == 1:
        audio = np.stack([audio, audio])
    elif audio.shape[0] == 1:
        audio = np.concatenate([audio, audio], axis=0)

    # (1, 2, T) batch tensor
    mix = torch.from_numpy(audio.astype(np.float32)).unsqueeze(0)

    separator = get_model(model)
    separator.eval()

    with torch.no_grad():
        # returns (sources, channels, samples) or (batch, sources, channels, samples)
        out = apply_model(separator, mix, device=device, progress=True)

    # strip batch dim if present
    if out.dim() == 4:
        out = out[0]  # (sources, channels, samples)

    paths: dict[str, Path] = {}
    for i, source in enumerate(separator.sources):
        stem_np = out[i].cpu().numpy()  # (channels, samples)
        out_path = stems_dir / f"{source}.wav"
        write_wav(out_path, stem_np, sr)
        paths[source] = out_path

    return StemPaths(
        vocals=paths.get("vocals"),
        drums=paths.get("drums"),
        bass=paths.get("bass"),
        guitar=paths.get("guitar"),
        piano=paths.get("piano"),
        other=paths.get("other"),
    )
