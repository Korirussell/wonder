from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from services.sample_database import SampleDatabaseService
from services.sample_models import SampleRecord, SampleSearchRequest, SampleSearchResult
from services.sample_search import SampleSearchService


router = APIRouter(prefix="/samples", tags=["samples"])


def get_sample_database() -> SampleDatabaseService:
    return SampleDatabaseService()


def get_sample_search_service(
    database: SampleDatabaseService = Depends(get_sample_database),
) -> SampleSearchService:
    return SampleSearchService(database)


@router.post("/search", response_model=list[SampleSearchResult])
def search_samples(
    request: SampleSearchRequest,
    search_service: SampleSearchService = Depends(get_sample_search_service),
) -> list[SampleSearchResult]:
    return search_service.search(request)


@router.get("/{sample_id}", response_model=SampleRecord)
def get_sample(
    sample_id: str,
    database: SampleDatabaseService = Depends(get_sample_database),
) -> SampleRecord:
    record = database.get_sample(sample_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    return record


@router.get("/{sample_id}/audio")
def get_sample_audio(
    sample_id: str,
    database: SampleDatabaseService = Depends(get_sample_database),
) -> FileResponse:
    record = database.get_sample(sample_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    if not record.file_path or not os.path.isfile(record.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(
        path=record.file_path, filename=record.file_name, media_type="audio/wav"
    )
