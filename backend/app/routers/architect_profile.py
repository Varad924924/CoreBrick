from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.dependencies import get_current_user, get_db
from app.models import ArchitectProfile, User
from app.schemas import ArchitectSelfProfileOut, ArchitectSelfProfileUpdate

router = APIRouter(prefix="/architect/profile", tags=["Architect Profile"])

PROFILE_PHOTO_DIR = Path(__file__).resolve().parents[2] / "uploads" / "architect_photos"
MAX_PHOTO_SIZE = 5 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def get_my_architect_profile(db: Session, user: User) -> ArchitectProfile:
    if user.role != "architect":
        raise HTTPException(status_code=403, detail="Architect access required")
    profile = db.scalar(
        select(ArchitectProfile).where(ArchitectProfile.user_id == user.id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Architect profile not found")
    return profile


def profile_response(profile: ArchitectProfile, user: User) -> ArchitectSelfProfileOut:
    return ArchitectSelfProfileOut(
        id=profile.id,
        email=user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        bio=profile.bio,
        city=profile.city,
        specialization=profile.specialization,
        years_experience=profile.years_experience,
        professional_details=profile.professional_details,
        profile_photo_url=profile.profile_photo_url,
        approval_status=profile.approval_status,
    )


@router.get("", response_model=ArchitectSelfProfileOut)
def read_my_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_my_architect_profile(db, user)
    return profile_response(profile, user)


@router.patch("", response_model=ArchitectSelfProfileOut)
def update_my_profile(
    payload: ArchitectSelfProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_my_architect_profile(db, user)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one profile field to update",
        )

    previous: dict[str, object] = {}
    updated: dict[str, object] = {}
    required_fields = {"full_name", "phone"}
    for field, value in changes.items():
        normalized = value.strip() if isinstance(value, str) else value
        if field in required_fields and (normalized is None or not normalized):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field.replace('_', ' ').capitalize()} cannot be empty",
            )
        previous[field] = getattr(profile, field)
        setattr(profile, field, normalized or None if field in {
            "bio", "city", "specialization", "professional_details"
        } else normalized)
        updated[field] = getattr(profile, field)

    try:
        record_audit_log(
            db,
            user,
            action="architect.self_profile_updated",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={"previous": previous, "updated": updated},
        )
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    return profile_response(profile, user)


@router.post("/photo", response_model=ArchitectSelfProfileOut)
async def upload_my_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_my_architect_profile(db, user)
    extension = ALLOWED_PHOTO_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(status_code=415, detail="Choose a JPEG, PNG or WebP image")

    content = await file.read(MAX_PHOTO_SIZE + 1)
    if not content or len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=413, detail="Profile photo must not exceed 5 MB")

    try:
        from io import BytesIO
        with Image.open(BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image")

    PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    destination = PROFILE_PHOTO_DIR / filename
    destination.write_bytes(content)

    old_url = profile.profile_photo_url
    new_url = f"/uploads/architect_photos/{filename}"
    profile.profile_photo_url = new_url
    try:
        record_audit_log(
            db,
            user,
            action="architect.profile_photo_updated",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={"previous_photo_url": old_url, "new_photo_url": new_url},
        )
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise

    # Keep the previous photo until retention/cleanup is handled separately.
    return profile_response(profile, user)



