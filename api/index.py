from __future__ import annotations

import io

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from api.core.processor import (
    DocumentProcessingError,
    StoredDocument,
    ensure_documents_dir,
    parse_and_normalize_file,
    persist_upload,
)
from api.core.rag import rag_engine

app = FastAPI(title="LexVibe API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str = Field(min_length=3, max_length=3000)


class UploadResponse(BaseModel):
    status: str
    filename: str
    chunks_added: int


class BatchUploadResponse(BaseModel):
    status: str
    uploaded: list[UploadResponse]
    failed: list[dict]


class ReindexResponse(BaseModel):
    status: str
    chunks_indexed: int
    files_processed: int


class ChatResponse(BaseModel):
    answer: str
    citations: list[dict]


def _assert_admin_authorized(request: Request) -> None:
    admin_cookie = request.cookies.get("lexvibe_admin")
    if admin_cookie != "ok":
        raise HTTPException(status_code=401, detail="Administratorska autentikacija je obavezna.")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "lexvibe-api"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    try:
        result = rag_engine.answer(payload.query)
        return ChatResponse(**result)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Greška pri obradi upita: {exc}",
        ) from exc


@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    _assert_admin_authorized(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nedostaje naziv fajla.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Otpremljeni dokument je prazan.")

    ensure_documents_dir()
    destination = persist_upload(file.filename, raw_bytes)

    try:
        parsed = parse_and_normalize_file(file.filename, io.BytesIO(raw_bytes))
        chunks_added = rag_engine.add_documents([parsed])
    except DocumentProcessingError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Neuspešna obrada dokumenta: {exc}") from exc

    return UploadResponse(status="ok", filename=file.filename, chunks_added=chunks_added)


@app.post("/api/upload-multiple", response_model=BatchUploadResponse)
async def upload_multiple_documents(
    request: Request, files: list[UploadFile] = File(...)
) -> BatchUploadResponse:
    _assert_admin_authorized(request)
    if not files:
        raise HTTPException(status_code=400, detail="Nijedan fajl nije prosleđen.")

    uploaded: list[UploadResponse] = []
    failed: list[dict] = []

    ensure_documents_dir()

    for file in files:
        if not file.filename:
            failed.append({"filename": "", "detail": "Nedostaje naziv fajla."})
            continue

        raw_bytes = await file.read()
        if not raw_bytes:
            failed.append({"filename": file.filename, "detail": "Otpremljeni dokument je prazan."})
            continue

        destination = persist_upload(file.filename, raw_bytes)
        try:
            parsed = parse_and_normalize_file(file.filename, io.BytesIO(raw_bytes))
            chunks_added = rag_engine.add_documents([parsed])
            uploaded.append(
                UploadResponse(status="ok", filename=file.filename, chunks_added=chunks_added)
            )
        except DocumentProcessingError as exc:
            destination.unlink(missing_ok=True)
            failed.append({"filename": file.filename, "detail": str(exc)})
        except Exception as exc:
            destination.unlink(missing_ok=True)
            failed.append({"filename": file.filename, "detail": f"Neuspešna obrada dokumenta: {exc}"})

    return BatchUploadResponse(status="ok", uploaded=uploaded, failed=failed)


@app.post("/api/reindex", response_model=ReindexResponse)
async def reindex_documents(request: Request) -> ReindexResponse:
    _assert_admin_authorized(request)
    try:
        documents_dir = ensure_documents_dir()
        stored_documents: list[StoredDocument] = []
        for path in documents_dir.iterdir():
            if path.is_file():
                with path.open("rb") as handle:
                    stored_documents.append(parse_and_normalize_file(path.name, handle))

        chunks_indexed = rag_engine.rebuild_index(stored_documents)
        return ReindexResponse(
            status="ok",
            chunks_indexed=chunks_indexed,
            files_processed=len(stored_documents),
        )
    except DocumentProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reindeksiranje nije uspelo: {exc}") from exc
