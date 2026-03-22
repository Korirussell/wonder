from __future__ import annotations

import os
import re
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from dotenv import load_dotenv

from services.elevenlabs_service import ElevenLabsService, GeneratedSoundResult
from services.sample_database import SampleDatabaseService
from services.sample_embedding import SampleEmbeddingService
from services.sample_models import SampleRecord

_SERVICE_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _SERVICE_DIR.parent
_WORKSPACE_ROOT = _BACKEND_ROOT.parent

load_dotenv(_WORKSPACE_ROOT / ".env")
load_dotenv(_BACKEND_ROOT / ".env")


class DocumentEmbeddingService(Protocol):
    def embed_document(self, text: str) -> list[float]: ...


class SoundGenerationClient(Protocol):
    def generate_sound(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> GeneratedSoundResult: ...


@dataclass(slots=True)
class SavedGeneratedSample:
    record: SampleRecord
    saved_path: str


class SampleGenerationService:
    def __init__(
        self,
        database: SampleDatabaseService,
        generation_client: SoundGenerationClient | None = None,
        embedding_service: DocumentEmbeddingService | None = None,
        output_dir: str | None = None,
    ) -> None:
        self.database = database
        self.generation_client = generation_client or ElevenLabsService()
        self.embedding_service = embedding_service or SampleEmbeddingService(
            database.embedding_service.config
        )
        self.output_dir = self._resolve_output_dir(
            output_dir
            or os.getenv("GENERATED_SAMPLES_DIR")
            or os.getenv("ELEVENLABS_OUTPUT_DIR")
            or "./generated_samples"
        )

    def generate_and_save(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> SavedGeneratedSample:
        generated = self.generation_client.generate_sound(
            prompt,
            duration_seconds=duration_seconds,
            output_format=output_format,
        )
        return self.save_generated_sound(generated)

    def save_generated_sound(
        self, generated: GeneratedSoundResult
    ) -> SavedGeneratedSample:
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        file_extension = self._extension_for_format(generated.output_format)
        file_name = self._build_file_name(generated.prompt, file_extension)
        file_path = str((Path(self.output_dir) / file_name).resolve())
        self._write_audio_file(file_path, generated.audio_bytes, file_extension)

        record = SampleRecord(
            file_path=file_path,
            file_name=file_name,
            file_extension=file_extension,
            source="elevenlabs",
            provider=generated.provider,
            provider_asset_id=generated.model_id,
            generation_prompt=generated.prompt,
            category="generated",
            sub_category="sound effect",
            tags=self._tags_for_prompt(generated.prompt),
            description=f"Generated from prompt: {generated.prompt}",
            duration=generated.duration_seconds,
        ).normalized(self.database.vector_dim)
        record = record.model_copy(
            update={
                "vector": self.embedding_service.embed_document(
                    record.search_text or ""
                )
            }
        ).normalized(self.database.vector_dim)

        saved_record = self.database.upsert_samples([record])[0]
        return SavedGeneratedSample(record=saved_record, saved_path=file_path)

    def _write_audio_file(
        self, file_path: str, audio_bytes: bytes, extension: str
    ) -> None:
        if extension == ".wav":
            Path(file_path).write_bytes(audio_bytes)
            return
        if extension == ".mp3":
            Path(file_path).write_bytes(audio_bytes)
            return
        raise ValueError(f"Unsupported generated audio extension: {extension}")

    def _build_file_name(self, prompt: str, extension: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", prompt.lower()).strip("_")[:40] or "generated"
        existing = len(list(Path(self.output_dir).glob(f"gen_{slug}_*{extension}")))
        return f"gen_{slug}_{existing + 1}{extension}"

    def _tags_for_prompt(self, prompt: str) -> list[str]:
        tags = [
            match.group(0).lower() for match in re.finditer(r"[A-Za-z0-9]+", prompt)
        ]
        deduped: list[str] = []
        for tag in tags:
            if tag not in deduped:
                deduped.append(tag)
        return deduped[:12]

    def _extension_for_format(self, output_format: str) -> str:
        lowered = output_format.lower()
        if lowered.startswith("wav"):
            return ".wav"
        if lowered.startswith("mp3"):
            return ".mp3"
        return ".bin"

    def _resolve_output_dir(self, output_dir: str) -> str:
        path = Path(output_dir).expanduser()
        if path.is_absolute():
            return str(path)
        return str((_BACKEND_ROOT / path).resolve())
