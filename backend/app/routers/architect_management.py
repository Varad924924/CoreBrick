from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.dependencies import get_current_company, get_db
from app.models import (
    ArchitectCompanyNote,
    ArchitectDocument,
    ArchitectProfile,
    AuditLog,
    Project,
    ProjectFloor,
    ProjectImage,
    User,
)
from app.schemas import (
    AuditLogItem,
    ArchitectCompanyNoteCreate,
    ArchitectCompanyNoteItem,
    ArchitectDocumentItem,
    ArchitectDocumentReviewUpdate,
    ArchitectManagementArchitectItem,
    ArchitectManagementListResponse,
    ArchitectManagementProfileUpdate,
    ArchitectManagementProjectItem,
    ArchitectAccountAction,
)


router = APIRouter(
    prefix="/company/architect-management",
    tags=["Company Architect Management"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "architect_documents"
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


def get_architect_or_404(
    db: Session,
    architect_profile_id: UUID,
) -> tuple[ArchitectProfile, User]:
    profile = db.get(ArchitectProfile, architect_profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Architect profile not found",
        )

    user = db.get(User, profile.user_id)
    if user is None or user.role != "architect":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Architect account not found",
        )
    return profile, user


def csv_safe_cell(value: object) -> object:
    """Neutralize spreadsheet formula prefixes in exported user-controlled text."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def account_status_for(user: User) -> str:
    if user.deleted_at is not None:
        return "archived"
    if not user.is_active:
        return "suspended"
    return "active"


def get_architect_stats(
    db: Session,
    profile_ids: list[UUID],
) -> dict[UUID, dict[str, int]]:
    if not profile_ids:
        return {}

    stats: dict[UUID, dict[str, int]] = {
        profile_id: {
            "project_count": 0,
            "approved_project_count": 0,
            "pending_project_count": 0,
            "document_count": 0,
            "note_count": 0,
        }
        for profile_id in profile_ids
    }

    project_rows = db.execute(
        select(
            Project.architect_profile_id,
            func.count(Project.id),
            func.sum(case((Project.status == "approved", 1), else_=0)),
            func.sum(case((Project.status == "pending_review", 1), else_=0)),
        )
        .where(Project.architect_profile_id.in_(profile_ids))
        .group_by(Project.architect_profile_id)
    ).all()
    for profile_id, total, approved, pending in project_rows:
        stats[profile_id]["project_count"] = int(total or 0)
        stats[profile_id]["approved_project_count"] = int(approved or 0)
        stats[profile_id]["pending_project_count"] = int(pending or 0)

    document_rows = db.execute(
        select(ArchitectDocument.architect_profile_id, func.count(ArchitectDocument.id))
        .where(ArchitectDocument.architect_profile_id.in_(profile_ids))
        .group_by(ArchitectDocument.architect_profile_id)
    ).all()
    for profile_id, total in document_rows:
        stats[profile_id]["document_count"] = int(total or 0)

    note_rows = db.execute(
        select(ArchitectCompanyNote.architect_profile_id, func.count(ArchitectCompanyNote.id))
        .where(ArchitectCompanyNote.architect_profile_id.in_(profile_ids))
        .group_by(ArchitectCompanyNote.architect_profile_id)
    ).all()
    for profile_id, total in note_rows:
        stats[profile_id]["note_count"] = int(total or 0)

    return stats


def build_architect_item(
    profile: ArchitectProfile,
    user: User,
    stats: dict[str, int] | None = None,
) -> ArchitectManagementArchitectItem:
    counts = stats or {}
    return ArchitectManagementArchitectItem(
        id=profile.id,
        user_id=user.id,
        email=user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        bio=profile.bio,
        approval_status=profile.approval_status,
        is_active=user.is_active,
        deleted_at=user.deleted_at,
        account_status=account_status_for(user),
        account_created_at=user.created_at,
        project_count=counts.get("project_count", 0),
        approved_project_count=counts.get("approved_project_count", 0),
        pending_project_count=counts.get("pending_project_count", 0),
        document_count=counts.get("document_count", 0),
        note_count=counts.get("note_count", 0),
    )


def filtered_architect_query(
    search: str | None,
    approval_status: str,
    account_status: str,
):
    query = (
        select(ArchitectProfile, User)
        .join(User, User.id == ArchitectProfile.user_id)
        .where(User.role == "architect")
    )

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                ArchitectProfile.full_name.ilike(term),
                ArchitectProfile.phone.ilike(term),
                ArchitectProfile.bio.ilike(term),
                User.email.ilike(term),
            )
        )

    if approval_status != "all":
        query = query.where(ArchitectProfile.approval_status == approval_status)

    if account_status == "active":
        query = query.where(User.is_active.is_(True), User.deleted_at.is_(None))
    elif account_status == "suspended":
        query = query.where(User.is_active.is_(False), User.deleted_at.is_(None))
    elif account_status == "archived":
        query = query.where(User.deleted_at.is_not(None))

    return query


def read_architect_rows(
    db: Session,
    search: str | None,
    approval_status: str,
    account_status: str,
) -> list[tuple[ArchitectProfile, User]]:
    return db.execute(
        filtered_architect_query(search, approval_status, account_status)
        .order_by(User.created_at.desc(), ArchitectProfile.full_name.asc())
    ).all()


@router.get(
    "/architects",
    response_model=ArchitectManagementListResponse,
)
def list_architects(
    search: str | None = Query(default=None, max_length=100),
    approval_status: Literal["all", "pending", "approved", "rejected"] = "all",
    account_status: Literal["all", "active", "suspended", "archived"] = "all",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    query = filtered_architect_query(search, approval_status, account_status)
    total = int(
        db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    )
    rows = db.execute(
        query.order_by(User.created_at.desc(), ArchitectProfile.full_name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    profile_ids = [profile.id for profile, _ in rows]
    stats = get_architect_stats(db, profile_ids)
    items = [
        build_architect_item(profile, user, stats.get(profile.id))
        for profile, user in rows
    ]
    return ArchitectManagementListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/architects/export.csv")
def export_architects(
    search: str | None = Query(default=None, max_length=100),
    approval_status: Literal["all", "pending", "approved", "rejected"] = "all",
    account_status: Literal["all", "active", "suspended", "archived"] = "all",
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    rows = read_architect_rows(db, search, approval_status, account_status)
    stats = get_architect_stats(db, [profile.id for profile, _ in rows])

    output = io.StringIO(newline="")
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(
        [
            "Architect Name",
            "Email",
            "Phone",
            "Approval Status",
            "Account Status",
            "Registered At",
            "Total Projects",
            "Approved Projects",
            "Projects Pending Review",
            "Documents",
            "Company Notes",
            "Bio",
        ]
    )
    for profile, user in rows:
        item_stats = stats.get(profile.id, {})
        writer.writerow(
            [
                csv_safe_cell(profile.full_name),
                csv_safe_cell(user.email),
                csv_safe_cell(profile.phone),
                csv_safe_cell(profile.approval_status),
                csv_safe_cell(account_status_for(user)),
                user.created_at.isoformat() if user.created_at else "",
                item_stats.get("project_count", 0),
                item_stats.get("approved_project_count", 0),
                item_stats.get("pending_project_count", 0),
                item_stats.get("document_count", 0),
                item_stats.get("note_count", 0),
                csv_safe_cell(profile.bio or ""),
            ]
        )

    filename = f"corebrick-architects-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/architects/{architect_profile_id}",
    response_model=ArchitectManagementArchitectItem,
)
def get_architect_details(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    stats = get_architect_stats(db, [profile.id]).get(profile.id)
    return build_architect_item(profile, user, stats)


@router.patch(
    "/architects/{architect_profile_id}",
    response_model=ArchitectManagementArchitectItem,
)
def update_architect_profile(
    architect_profile_id: UUID,
    payload: ArchitectManagementProfileUpdate,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one profile field to update",
        )

    previous = {}
    updated = {}
    for field, value in changes.items():
        if value is None and field != "bio":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field.replace('_', ' ').capitalize()} cannot be empty",
            )
        normalized = value.strip() if isinstance(value, str) else value
        if isinstance(normalized, str) and not normalized and field != "bio":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field.replace('_', ' ').capitalize()} cannot be empty",
            )
        previous[field] = getattr(profile, field)
        setattr(profile, field, normalized or None if field == "bio" else normalized)
        updated[field] = getattr(profile, field)

    try:
        record_audit_log(
            db,
            company_user,
            action="architect.profile_updated",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={"previous": previous, "updated": updated},
        )
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    stats = get_architect_stats(db, [profile.id]).get(profile.id)
    return build_architect_item(profile, user, stats)


def apply_account_action(
    db: Session,
    actor: User,
    profile: ArchitectProfile,
    user: User,
    action: str,
    reason: str | None,
) -> ArchitectManagementArchitectItem:
    now = datetime.now(timezone.utc)
    previous_status = account_status_for(user)

    if action == "suspend":
        if user.deleted_at is not None:
            raise HTTPException(status_code=409, detail="Archived accounts must be restored before they can be suspended")
        if not user.is_active:
            raise HTTPException(status_code=409, detail="Architect account is already suspended")
        user.is_active = False
        audit_action = "architect.account_suspended"
    elif action == "reactivate":
        if user.deleted_at is not None:
            raise HTTPException(status_code=409, detail="Archived accounts must be restored, not reactivated")
        if user.is_active:
            raise HTTPException(status_code=409, detail="Architect account is already active")
        user.is_active = True
        audit_action = "architect.account_reactivated"
    elif action == "archive":
        if user.deleted_at is not None:
            raise HTTPException(status_code=409, detail="Architect account is already archived")
        user.is_active = False
        user.deleted_at = now
        audit_action = "architect.account_archived"
    elif action == "restore":
        if user.deleted_at is None:
            raise HTTPException(status_code=409, detail="Architect account is not archived")
        user.is_active = True
        user.deleted_at = None
        audit_action = "architect.account_restored"
    else:
        raise HTTPException(status_code=400, detail="Unsupported account action")

    try:
        record_audit_log(
            db,
            actor,
            action=audit_action,
            entity_type="architect_profile",
            entity_id=profile.id,
            details={
                "previous_account_status": previous_status,
                "new_account_status": account_status_for(user),
                "reason": reason.strip() if reason and reason.strip() else None,
                "approval_status_preserved": profile.approval_status,
            },
        )
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise

    stats = get_architect_stats(db, [profile.id]).get(profile.id)
    return build_architect_item(profile, user, stats)


@router.post(
    "/architects/{architect_profile_id}/suspend",
    response_model=ArchitectManagementArchitectItem,
)
def suspend_architect(
    architect_profile_id: UUID,
    payload: ArchitectAccountAction | None = None,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    return apply_account_action(db, company_user, profile, user, "suspend", payload.reason if payload else None)


@router.post(
    "/architects/{architect_profile_id}/reactivate",
    response_model=ArchitectManagementArchitectItem,
)
def reactivate_architect(
    architect_profile_id: UUID,
    payload: ArchitectAccountAction | None = None,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    return apply_account_action(db, company_user, profile, user, "reactivate", payload.reason if payload else None)


@router.post(
    "/architects/{architect_profile_id}/archive",
    response_model=ArchitectManagementArchitectItem,
)
def archive_architect(
    architect_profile_id: UUID,
    payload: ArchitectAccountAction | None = None,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    return apply_account_action(db, company_user, profile, user, "archive", payload.reason if payload else None)


@router.post(
    "/architects/{architect_profile_id}/restore",
    response_model=ArchitectManagementArchitectItem,
)
def restore_architect(
    architect_profile_id: UUID,
    payload: ArchitectAccountAction | None = None,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)
    return apply_account_action(db, company_user, profile, user, "restore", payload.reason if payload else None)


@router.get(
    "/architects/{architect_profile_id}/projects",
    response_model=list[ArchitectManagementProjectItem],
)
def list_architect_projects(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    projects = db.scalars(
        select(Project)
        .where(Project.architect_profile_id == profile.id)
        .order_by(Project.created_at.desc())
    ).all()
    project_ids = [project.id for project in projects]

    floor_counts: dict[UUID, int] = {}
    image_counts: dict[UUID, int] = {}
    if project_ids:
        for project_id, count in db.execute(
            select(ProjectFloor.project_id, func.count(ProjectFloor.id))
            .where(ProjectFloor.project_id.in_(project_ids))
            .group_by(ProjectFloor.project_id)
        ).all():
            floor_counts[project_id] = int(count or 0)
        for project_id, count in db.execute(
            select(ProjectImage.project_id, func.count(ProjectImage.id))
            .where(ProjectImage.project_id.in_(project_ids))
            .group_by(ProjectImage.project_id)
        ).all():
            image_counts[project_id] = int(count or 0)

    return [
        ArchitectManagementProjectItem(
            id=project.id,
            title=project.title,
            property_type=project.property_type,
            city=project.city,
            state=project.state,
            area_sqft=project.area_sqft,
            status=project.status,
            floor_count=floor_counts.get(project.id, 0),
            image_count=image_counts.get(project.id, 0),
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
        for project in projects
    ]


def build_document_item(document: ArchitectDocument) -> ArchitectDocumentItem:
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
        download_url=(
            f"/company/architect-management/architects/"
            f"{document.architect_profile_id}/documents/{document.id}/file"
        ),
    )


@router.get(
    "/architects/{architect_profile_id}/documents",
    response_model=list[ArchitectDocumentItem],
)
def list_architect_documents(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    documents = db.scalars(
        select(ArchitectDocument)
        .where(ArchitectDocument.architect_profile_id == profile.id)
        .order_by(ArchitectDocument.uploaded_at.desc())
    ).all()
    return [build_document_item(document) for document in documents]


@router.post(
    "/architects/{architect_profile_id}/documents",
    response_model=ArchitectDocumentItem,
    status_code=status.HTTP_201_CREATED,
)
async def upload_architect_document(
    architect_profile_id: UUID,
    file: UploadFile = File(...),
    document_type: str = Form(default="other", max_length=80),
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    contents = await file.read(MAX_DOCUMENT_SIZE + 1)
    await file.close()

    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded document is empty")
    if len(contents) > MAX_DOCUMENT_SIZE:
        raise HTTPException(status_code=413, detail="Document size must not exceed 10 MB")

    safe_name = Path((file.filename or "document").replace("\\", "/")).name
    suffix = Path(safe_name).suffix.lower()
    if suffix not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Only PDF, JPG, JPEG and PNG documents are supported")

    if suffix == ".pdf":
        if not contents.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF document")
        detected_content_type = "application/pdf"
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
        detected_content_type = "image/jpeg" if image_format == "JPEG" else "image/png"

    safe_name = safe_name[:255] or f"architect-document{suffix}"
    stored_filename = f"{uuid4().hex}{suffix}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / stored_filename
    destination.write_bytes(contents)

    document = ArchitectDocument(
        architect_profile_id=profile.id,
        original_filename=safe_name,
        stored_filename=stored_filename,
        content_type=detected_content_type,
        file_size_bytes=len(contents),
        document_type=document_type.strip() or "other",
        verification_status="pending",
        uploaded_by_user_id=company_user.id,
    )
    try:
        db.add(document)
        db.flush()
        record_audit_log(
            db,
            company_user,
            action="architect.document_uploaded",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={
                "document_id": str(document.id),
                "filename": safe_name,
                "document_type": document.document_type,
                "file_size_bytes": len(contents),
            },
        )
        db.commit()
        db.refresh(document)
        return build_document_item(document)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise


@router.get(
    "/architects/{architect_profile_id}/documents/{document_id}/file",
    response_class=FileResponse,
)
def download_architect_document(
    architect_profile_id: UUID,
    document_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    document = db.get(ArchitectDocument, document_id)
    if document is None or document.architect_profile_id != profile.id:
        raise HTTPException(status_code=404, detail="Architect document not found")

    file_path = UPLOAD_DIR / document.stored_filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file is unavailable")
    return FileResponse(
        path=file_path,
        media_type=document.content_type,
        filename=document.original_filename,
    )


@router.patch(
    "/architects/{architect_profile_id}/documents/{document_id}",
    response_model=ArchitectDocumentItem,
)
def review_architect_document(
    architect_profile_id: UUID,
    document_id: UUID,
    payload: ArchitectDocumentReviewUpdate,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    document = db.get(ArchitectDocument, document_id)
    if document is None or document.architect_profile_id != profile.id:
        raise HTTPException(status_code=404, detail="Architect document not found")

    notes = payload.verification_notes.strip() if payload.verification_notes else None
    if payload.verification_status == "rejected" and (notes is None or len(notes) < 5):
        raise HTTPException(
            status_code=422,
            detail="Provide a reason of at least 5 characters when rejecting a document",
        )

    previous_status = document.verification_status
    document.verification_status = payload.verification_status
    document.verification_notes = notes if payload.verification_status != "pending" else None
    document.reviewed_by_user_id = company_user.id if payload.verification_status != "pending" else None
    document.reviewed_at = datetime.now(timezone.utc) if payload.verification_status != "pending" else None

    action = {
        "verified": "architect.document_verified",
        "rejected": "architect.document_rejected",
        "pending": "architect.document_review_reset",
    }[payload.verification_status]
    try:
        record_audit_log(
            db,
            company_user,
            action=action,
            entity_type="architect_profile",
            entity_id=profile.id,
            details={
                "document_id": str(document.id),
                "filename": document.original_filename,
                "previous_status": previous_status,
                "new_status": document.verification_status,
                "notes": notes,
            },
        )
        db.commit()
        db.refresh(document)
    except Exception:
        db.rollback()
        raise
    return build_document_item(document)


@router.get(
    "/architects/{architect_profile_id}/notes",
    response_model=list[ArchitectCompanyNoteItem],
)
def list_architect_company_notes(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    rows = db.execute(
        select(ArchitectCompanyNote, User.email)
        .outerjoin(User, User.id == ArchitectCompanyNote.author_user_id)
        .where(ArchitectCompanyNote.architect_profile_id == profile.id)
        .order_by(ArchitectCompanyNote.created_at.desc())
        .limit(200)
    ).all()
    return [
        ArchitectCompanyNoteItem(
            id=note.id,
            architect_profile_id=note.architect_profile_id,
            note=note.note,
            author_email=author_email,
            created_at=note.created_at,
        )
        for note, author_email in rows
    ]


@router.post(
    "/architects/{architect_profile_id}/notes",
    response_model=ArchitectCompanyNoteItem,
    status_code=status.HTTP_201_CREATED,
)
def add_architect_company_note(
    architect_profile_id: UUID,
    payload: ArchitectCompanyNoteCreate,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    note_text = payload.note.strip()
    if not note_text:
        raise HTTPException(status_code=422, detail="Company note cannot be empty")

    note = ArchitectCompanyNote(
        architect_profile_id=profile.id,
        author_user_id=company_user.id,
        note=note_text,
    )
    try:
        db.add(note)
        db.flush()
        record_audit_log(
            db,
            company_user,
            action="architect.company_note_added",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={"note_id": str(note.id)},
        )
        db.commit()
        db.refresh(note)
    except Exception:
        db.rollback()
        raise

    return ArchitectCompanyNoteItem(
        id=note.id,
        architect_profile_id=note.architect_profile_id,
        note=note.note,
        author_email=company_user.email,
        created_at=note.created_at,
    )


@router.get(
    "/architects/{architect_profile_id}/activity",
    response_model=list[AuditLogItem],
)
def list_architect_activity(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, _ = get_architect_or_404(db, architect_profile_id)
    project_ids = db.scalars(
        select(Project.id).where(Project.architect_profile_id == profile.id)
    ).all()
    conditions = [
        (AuditLog.entity_type == "architect_profile")
        & (AuditLog.entity_id == profile.id)
    ]
    if project_ids:
        project_ids_as_text = [str(project_id) for project_id in project_ids]
        conditions.append(
            or_(
                (AuditLog.entity_type == "project")
                & AuditLog.entity_id.in_(project_ids),
                AuditLog.details["project_id"].as_string().in_(project_ids_as_text),
            )
        )

    return db.scalars(
        select(AuditLog)
        .where(or_(*conditions))
        .order_by(AuditLog.created_at.desc())
        .limit(200)
    ).all()



