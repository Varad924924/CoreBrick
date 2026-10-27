from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.dependencies import get_current_company, get_db
from app.models import ArchitectProfile, Project, ProjectFloor, ProjectImage, User
from app.schemas import (
    CompanyProjectReviewItem,
    ImageReviewRequest,
    ProjectFloorOut,
    ProjectImageOut,
    ProjectReviewRequest,
)


router = APIRouter(
    prefix="/company/projects",
    tags=["Company Projects"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "projects"


def build_review_item(
    project: Project,
    profile: ArchitectProfile,
) -> CompanyProjectReviewItem:
    """Build the Company-facing project review response."""
    return CompanyProjectReviewItem(
        id=project.id,
        title=project.title,
        description=project.description,
        property_type=project.property_type,
        city=project.city,
        state=project.state,
        area_sqft=project.area_sqft,
        building_type=project.building_type,
        architectural_style=project.architectural_style,
        bhk=project.bhk,
        facing=project.facing,
        entrance_facing=project.entrance_facing,
        plot_area_sqft=project.plot_area_sqft,
        plot_width_ft=project.plot_width_ft,
        plot_length_ft=project.plot_length_ft,
        carpet_area_sqft=project.carpet_area_sqft,
        floor_count=project.floor_count,
        bedroom_count=project.bedroom_count,
        bathroom_count=project.bathroom_count,
        kitchen_count=project.kitchen_count,
        balcony_count=project.balcony_count,
        parking_spaces=project.parking_spaces,
        estimated_cost_min=project.estimated_cost_min,
        estimated_cost_max=project.estimated_cost_max,
        amenities=project.amenities,
        status=project.status,
        created_at=project.created_at,
        updated_at=project.updated_at,
        architect_profile_id=profile.id,
        architect_name=profile.full_name,
    )


def get_project_and_profile(
    db: Session,
    project_id: UUID,
) -> tuple[Project, ArchitectProfile]:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    profile = db.get(ArchitectProfile, project.architect_profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Architect profile not found",
        )

    return project, profile


def get_pending_review_project(db: Session, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending project not found",
        )
    return project


def build_image_review_item(project: Project, image: ProjectImage) -> ProjectImageOut:
    """Return a private Company image URL plus image-review metadata."""
    return ProjectImageOut(
        id=image.id,
        project_id=image.project_id,
        image_url=f"/company/projects/{project.id}/images/{image.id}/file",
        alt_text=image.alt_text,
        sort_order=image.sort_order,
        category=image.category,
        floor_id=image.floor_id,
        is_cover=image.is_cover,
        review_status=image.review_status,
        review_notes=image.review_notes,
        reviewed_at=image.reviewed_at,
    )


@router.get(
    "/pending",
    response_model=list[CompanyProjectReviewItem],
)
def list_pending_projects(
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Project, ArchitectProfile)
        .join(
            ArchitectProfile,
            Project.architect_profile_id == ArchitectProfile.id,
        )
        .where(Project.status == "pending_review")
        .order_by(Project.created_at.asc())
    ).all()

    return [build_review_item(project, profile) for project, profile in rows]


@router.post(
    "/{project_id}/approve",
    response_model=CompanyProjectReviewItem,
)
def approve_project(
    project_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Publish a project only after all its images are individually approved."""
    project, profile = get_project_and_profile(db, project_id)

    if project.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending projects can be approved",
        )

    unreviewed_image_id = db.scalar(
        select(ProjectImage.id)
        .where(
            ProjectImage.project_id == project.id,
            ProjectImage.review_status != "approved",
        )
        .limit(1)
    )
    if unreviewed_image_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Review every project image individually before publishing. "
                "One or more images are still pending review or rejected."
            ),
        )

    previous_status = project.status
    try:
        project.status = "approved"
        project.reviewed_by_user_id = company_user.id
        project.reviewed_at = datetime.now(timezone.utc)
        project.review_notes = None

        record_audit_log(
            db,
            company_user,
            action="project.approved",
            entity_type="project",
            entity_id=project.id,
            details={
                "previous_status": previous_status,
                "new_status": "approved",
            },
        )

        db.commit()
        db.refresh(project)
        return build_review_item(project, profile)
    except Exception:
        db.rollback()
        raise


@router.post(
    "/{project_id}/reject",
    response_model=CompanyProjectReviewItem,
)
def reject_project(
    project_id: UUID,
    payload: ProjectReviewRequest,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    project, profile = get_project_and_profile(db, project_id)

    if project.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending projects can be rejected",
        )

    notes = payload.notes.strip() if payload.notes else None
    previous_status = project.status

    try:
        project.status = "rejected"
        project.reviewed_by_user_id = company_user.id
        project.reviewed_at = datetime.now(timezone.utc)
        project.review_notes = notes

        record_audit_log(
            db,
            company_user,
            action="project.rejected",
            entity_type="project",
            entity_id=project.id,
            details={
                "previous_status": previous_status,
                "new_status": "rejected",
                "notes": notes,
            },
        )

        db.commit()
        db.refresh(project)
        return build_review_item(project, profile)
    except Exception:
        db.rollback()
        raise


@router.get(
    "/{project_id}/images",
    response_model=list[ProjectImageOut],
)
def list_pending_project_images(
    project_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Expose pending-project images to authenticated Company reviewers only."""
    project = get_pending_review_project(db, project_id)
    records = db.scalars(
        select(ProjectImage)
        .where(ProjectImage.project_id == project.id)
        .order_by(
            ProjectImage.is_cover.desc(),
            ProjectImage.sort_order,
            ProjectImage.id,
        )
    ).all()
    return [build_image_review_item(project, image) for image in records]


@router.get(
    "/{project_id}/images/{image_id}/file",
    response_class=FileResponse,
)
def serve_pending_project_image(
    project_id: UUID,
    image_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Serve pending-project images privately to an authenticated Company user."""
    project = get_pending_review_project(db, project_id)
    image = db.get(ProjectImage, image_id)

    if image is None or image.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project image not found",
        )

    file_path = UPLOAD_DIR / Path(image.image_url).name
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found",
        )

    return FileResponse(path=file_path)


@router.post(
    "/{project_id}/images/{image_id}/approve",
    response_model=ProjectImageOut,
)
def approve_project_image(
    project_id: UUID,
    image_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Approve one image independently while the project remains pending."""
    project = get_pending_review_project(db, project_id)
    image = db.get(ProjectImage, image_id)
    if image is None or image.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project image not found",
        )

    previous_status = image.review_status or "pending_review"
    try:
        image.review_status = "approved"
        image.review_notes = None
        image.reviewed_at = datetime.now(timezone.utc)

        record_audit_log(
            db,
            company_user,
            action="project_image.approved",
            entity_type="project_image",
            entity_id=image.id,
            details={
                "project_id": str(project.id),
                "category": image.category,
                "previous_status": previous_status,
                "new_status": "approved",
            },
        )

        db.commit()
        db.refresh(image)
        return build_image_review_item(project, image)
    except Exception:
        db.rollback()
        raise


@router.post(
    "/{project_id}/images/{image_id}/reject",
    response_model=ProjectImageOut,
)
def reject_project_image(
    project_id: UUID,
    image_id: UUID,
    payload: ImageReviewRequest,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Reject one image and save specific feedback for its architect."""
    project = get_pending_review_project(db, project_id)
    image = db.get(ProjectImage, image_id)
    if image is None or image.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project image not found",
        )

    if payload.status != "rejected":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image review status must be rejected",
        )

    notes = (payload.review_notes or "").strip()
    if len(notes) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide specific image feedback of at least 5 characters",
        )

    previous_status = image.review_status or "pending_review"
    try:
        image.review_status = "rejected"
        image.review_notes = notes
        image.reviewed_at = datetime.now(timezone.utc)

        record_audit_log(
            db,
            company_user,
            action="project_image.rejected",
            entity_type="project_image",
            entity_id=image.id,
            details={
                "project_id": str(project.id),
                "category": image.category,
                "previous_status": previous_status,
                "new_status": "rejected",
                "notes": notes,
            },
        )

        db.commit()
        db.refresh(image)
        return build_image_review_item(project, image)
    except Exception:
        db.rollback()
        raise


@router.get(
    "/{project_id}/floors",
    response_model=list[ProjectFloorOut],
)
def list_pending_project_floors(
    project_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Return the floor breakdown during Company review only."""
    project = get_pending_review_project(db, project_id)
    return db.scalars(
        select(ProjectFloor)
        .where(ProjectFloor.project_id == project.id)
        .order_by(ProjectFloor.sort_order, ProjectFloor.floor_number)
    ).all()
