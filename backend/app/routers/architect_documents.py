from __future__ import annotations

import io
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.dependencies import get_current_user, get_db
from app.models import ArchitectDocument, ArchitectProfile, User
from app.schemas import ArchitectDocumentItem

router = APIRouter(prefix="/architect", tags=["Architect Documents"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "architect_documents"
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


def document_response(document: ArchitectDocument) -> ArchitectDocumentItem:
    return ArchitectDocumentItem(
        id=document.id,
        architect_profile_id=document.architect_profile_id,
        original_filename=document.original_filename,
        document_type=document.document_type,
        content_type=document.content_type,
        file_size_bytes=document.file_size_bytes,
        verification_status=document.verification_status,
        verification_notes=document.verification_notes,
        uploaded_at=document.uploaded_at,
        reviewed_at=document.reviewed_at,
        download_url=f"/architect/documents/{document.id}/file",
    )


@router.get("/documents", response_model=list[ArchitectDocumentItem])
def list_my_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "architect":
        raise HTTPException(status_code=403, detail="Architect access required")
    profile = db.scalar(select(ArchitectProfile).where(ArchitectProfile.user_id == current_user.id))
    if profile is None:
        raise HTTPException(status_code=404, detail="Architect profile not found")
    documents = db.scalars(
        select(ArchitectDocument)
        .where(ArchitectDocument.architect_profile_id == profile.id)
        .order_by(ArchitectDocument.uploaded_at.desc())
    ).all()
    return [document_response(document) for document in documents]


@router.post("/documents", response_model=ArchitectDocumentItem, status_code=status.HTTP_201_CREATED)
async def upload_my_document(
    file: UploadFile = File(...),
    document_type: str = "other",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "architect":
        raise HTTPException(status_code=403, detail="Architect access required")
    profile = db.scalar(select(ArchitectProfile).where(ArchitectProfile.user_id == current_user.id))
    if profile is None:
        raise HTTPException(status_code=404, detail="Architect profile not found")

    contents = await file.read(MAX_DOCUMENT_SIZE + 1)
    await file.close()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded document is empty")
    if len(contents) > MAX_DOCUMENT_SIZE:
        raise HTTPException(status_code=413, detail="Document size must not exceed 10 MB")

    safe_name = Path((file.filename or "document").replace("\\", "/")).name
    suffix = Path(safe_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Only PDF, JPG, JPEG and PNG documents are supported")
    if suffix == ".pdf":
        if not contents.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF document")
        content_type = "application/pdf"
    else:
        try:
            with Image.open(io.BytesIO(contents)) as image:
                image_format = image.format
                image.verify()
            expected_format = "JPEG" if suffix in {".jpg", ".jpeg"} else "PNG"
            if image_format != expected_format:
                raise HTTPException(status_code=415, detail="The image content does not match its file extension")
        except HTTPException:
            raise
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid supported image")
        content_type = "image/jpeg" if image_format == "JPEG" else "image/png"

    stored_filename = f"{uuid4().hex}{suffix}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / stored_filename
    destination.write_bytes(contents)
    document = ArchitectDocument(
        architect_profile_id=profile.id,
        original_filename=safe_name[:255] or f"architect-document{suffix}",
        stored_filename=stored_filename,
        content_type=content_type,
        file_size_bytes=len(contents),
        document_type=(document_type or "other").strip()[:80] or "other",
        verification_status="pending",
        uploaded_by_user_id=current_user.id,
    )
    try:
        db.add(document)
        db.flush()
        record_audit_log(
            db, current_user, action="architect.document_uploaded",
            entity_type="architect_profile", entity_id=profile.id,
            details={"document_id": str(document.id), "filename": document.original_filename,
                     "document_type": document.document_type, "file_size_bytes": len(contents)},
        )
        db.commit()
        db.refresh(document)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    return document_response(document)


@router.get("/documents/{document_id}/file", response_class=FileResponse)
def download_my_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "architect":
        raise HTTPException(status_code=403, detail="Architect access required")
    profile = db.scalar(select(ArchitectProfile).where(ArchitectProfile.user_id == current_user.id))
    if profile is None:
        raise HTTPException(status_code=404, detail="Architect profile not found")
    try:
        from uuid import UUID
        parsed_id = UUID(document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Architect document not found") from exc
    document = db.get(ArchitectDocument, parsed_id)
    if document is None or document.architect_profile_id != profile.id:
        raise HTTPException(status_code=404, detail="Architect document not found")
    file_path = UPLOAD_DIR / document.stored_filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file is unavailable")
    return FileResponse(file_path, media_type=document.content_type, filename=document.original_filename)



