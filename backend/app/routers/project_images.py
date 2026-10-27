import io
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import ArchitectProfile, Project, ProjectImage, User
from app.schemas import ProjectImageOut


router = APIRouter(prefix="/projects", tags=["Project Images"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "projects"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000

SUPPORTED_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}

ALLOWED_CATEGORIES = {
    "floor_plan",
    "design_2d",
    "elevation_3d",
    "interior",
    "exterior",
    "other",
}


def get_owned_project(
    project_id: UUID,
    user: User,
    db: Session,
) -> Project:
    if user.role != "architect":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Architect access required",
        )

    profile = db.scalar(
        select(ArchitectProfile).where(ArchitectProfile.user_id == user.id)
    )
    if profile is None or profile.approval_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An approved architect account is required",
        )

    project = db.get(Project, project_id)
    if project is None or project.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.architect_profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can manage images only for your own projects",
        )

    return project



def image_response(image: ProjectImage, *, private: bool) -> ProjectImageOut:
    if private:
        url = f"/projects/mine/{image.project_id}/images/{image.id}/file"
    else:
        url = f"/projects/{image.project_id}/images/{image.id}/file"

    return ProjectImageOut(
        id=image.id,
        project_id=image.project_id,
        image_url=url,
        alt_text=image.alt_text,
        sort_order=image.sort_order,
        category=image.category,
        floor_id=image.floor_id,
        is_cover=image.is_cover,
        review_status=image.review_status or "pending_review",
        review_notes=image.review_notes,
        reviewed_at=image.reviewed_at,
    )

@router.post(
    "/{project_id}/images",
    response_model=ProjectImageOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_project_image(
    project_id: UUID,
    file: UploadFile = File(...),
    alt_text: str | None = Form(default=None, max_length=255),
    category: str = Form(default="other", max_length=30),
    floor_id: UUID | None = Form(default=None),
    is_cover: bool = Form(default=False),
    sort_order: int = Form(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)

    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Invalid category. Allowed categories: "
                + ", ".join(sorted(ALLOWED_CATEGORIES))
            ),
        )

    if floor_id is not None:
        from app.models import ProjectFloor

        floor = db.get(ProjectFloor, floor_id)
        if floor is None or floor.project_id != project.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Floor not found for this project",
            )

    contents = await file.read(MAX_IMAGE_SIZE + 1)
    await file.close()

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty",
        )
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image size must not exceed 5 MB",
        )

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image_format = image.format
            width, height = image.size

            if image_format not in SUPPORTED_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="Only JPEG, PNG, and WebP images are supported",
                )
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Image dimensions are too large",
                )
            image.verify()
    except HTTPException:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        Image.DecompressionBombError,
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file is not a valid supported image",
        )

    filename = f"{uuid4().hex}{SUPPORTED_FORMATS[image_format]}"
    destination = UPLOAD_DIR / filename
    destination.write_bytes(contents)

    image_record = ProjectImage(
        project_id=project.id,
        image_url=f"/uploads/projects/{filename}",
        alt_text=alt_text.strip() if alt_text else None,
        sort_order=sort_order,
        category=category,
        floor_id=floor_id,
        is_cover=is_cover,
        review_status="pending_review",
        review_notes=None,
        reviewed_at=None,
    )

    try:
        if is_cover:
            existing_covers = db.scalars(
                select(ProjectImage).where(
                    ProjectImage.project_id == project.id,
                    ProjectImage.is_cover.is_(True),
                )
            ).all()
            for existing_image in existing_covers:
                existing_image.is_cover = False

        # Any image change requires the Company to review the project again.
        project.status = "pending_review"
        project.reviewed_by_user_id = None
        project.reviewed_at = None
        project.review_notes = None

        db.add(image_record)
        db.commit()
        db.refresh(image_record)
        # Keep the upload response URL on the public route for compatibility.
        # The public file route continues to return 404 until project approval.
        return image_response(image_record, private=False)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise


# Private image metadata is available only to the approved architect who owns
# the project. Pending and rejected project images are never exposed publicly.
@router.get(
    "/mine/{project_id}/images",
    response_model=list[ProjectImageOut],
)
def list_my_project_images(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)
    records = db.scalars(
        select(ProjectImage)
        .where(ProjectImage.project_id == project.id)
        .order_by(
            ProjectImage.is_cover.desc(),
            ProjectImage.sort_order,
            ProjectImage.id,
        )
    ).all()
    return [image_response(image, private=True) for image in records]


@router.get(
    "/mine/{project_id}/images/{image_id}/file",
    response_class=FileResponse,
)
def serve_my_project_image_file(
    project_id: UUID,
    image_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)
    image_record = db.get(ProjectImage, image_id)
    if image_record is None or image_record.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project image not found",
        )

    file_path = UPLOAD_DIR / Path(image_record.image_url).name
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found",
        )
    return FileResponse(path=file_path)


@router.post(
    "/mine/{project_id}/images/{image_id}/replace",
    response_model=ProjectImageOut,
)
async def replace_rejected_project_image(
    project_id: UUID,
    image_id: UUID,
    file: UploadFile = File(...),
    alt_text: str | None = Form(default=None, max_length=255),
    category: str | None = Form(default=None, max_length=30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace a rejected image in-place so its Company feedback history is addressed."""
    project = get_owned_project(project_id, user, db)
    image_record = db.get(ProjectImage, image_id)
    if image_record is None or image_record.project_id != project.id:
        raise HTTPException(status_code=404, detail="Project image not found")
    if category is not None and category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid image category",
        )

    contents = await file.read(MAX_IMAGE_SIZE + 1)
    await file.close()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image size must not exceed 5 MB")

    try:
        with Image.open(io.BytesIO(contents)) as opened_image:
            image_format = opened_image.format
            width, height = opened_image.size
            if image_format not in SUPPORTED_FORMATS:
                raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported")
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
            opened_image.verify()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid supported image")

    filename = f"{uuid4().hex}{SUPPORTED_FORMATS[image_format]}"
    destination = UPLOAD_DIR / filename
    destination.write_bytes(contents)
    old_path = UPLOAD_DIR / Path(image_record.image_url).name

    try:
        image_record.image_url = f"/uploads/projects/{filename}"
        if alt_text is not None:
            image_record.alt_text = alt_text.strip() or None
        if category is not None:
            image_record.category = category
        image_record.review_status = "pending_review"
        image_record.review_notes = None
        image_record.reviewed_at = None
        project.status = "pending_review"
        project.reviewed_by_user_id = None
        project.reviewed_at = None
        project.review_notes = None
        db.commit()
        db.refresh(image_record)
        old_path.unlink(missing_ok=True)
        return image_response(image_record, private=True)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise


@router.delete("/mine/{project_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_project_image(
    project_id: UUID,
    image_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete one image from the authenticated architect's own project."""
    project = get_owned_project(project_id, user, db)
    image_record = db.get(ProjectImage, image_id)
    if image_record is None or image_record.project_id != project.id:
        raise HTTPException(status_code=404, detail="Project image not found")

    image_path = UPLOAD_DIR / Path(image_record.image_url).name
    try:
        if image_record.is_cover:
            # Promote the next image as cover if available.
            replacement_cover = db.scalars(
                select(ProjectImage)
                .where(ProjectImage.project_id == project.id, ProjectImage.id != image_record.id)
                .order_by(ProjectImage.sort_order, ProjectImage.id)
            ).first()
            if replacement_cover is not None:
                replacement_cover.is_cover = True
        db.delete(image_record)
        project.status = "pending_review"
        project.reviewed_by_user_id = None
        project.reviewed_at = None
        project.review_notes = None
        db.commit()
        image_path.unlink(missing_ok=True)
    except Exception:
        db.rollback()
        raise
    return None


@router.get(
    "/{project_id}/images",
    response_model=list[ProjectImageOut],
)
def list_public_project_images(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if project is None or project.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project not found",
        )

    records = db.scalars(
        select(ProjectImage)
        .where(
            ProjectImage.project_id == project_id,
            ProjectImage.review_status == "approved",
        )
        .order_by(
            ProjectImage.is_cover.desc(),
            ProjectImage.sort_order,
            ProjectImage.id,
        )
    ).all()
    return [image_response(image, private=False) for image in records]


@router.get(
    "/{project_id}/images/{image_id}/file",
    response_class=FileResponse,
)
def serve_public_project_image(
    project_id: UUID,
    image_id: UUID,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if project is None or project.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project image not found",
        )

    image_record = db.get(ProjectImage, image_id)
    if (
        image_record is None
        or image_record.project_id != project.id
        or image_record.review_status != "approved"
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project image not found",
        )

    file_path = UPLOAD_DIR / Path(image_record.image_url).name
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found",
        )
    return FileResponse(path=file_path)
