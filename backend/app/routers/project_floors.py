from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import ArchitectProfile, Project, ProjectFloor, ProjectImage, User
from app.schemas import (
    ProjectFloorCreate,
    ProjectFloorOut,
    ProjectFloorUpdate,
)


router = APIRouter(prefix="/projects", tags=["Project Floors"])


def get_owned_project(
    project_id: UUID,
    user: User,
    db: Session,
) -> Project:
    """Return a project only when the approved architect owns it."""

    if user.role != "architect":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Architect access required",
        )

    profile = db.scalar(
        select(ArchitectProfile).where(
            ArchitectProfile.user_id == user.id
        )
    )

    if profile is None or profile.approval_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An approved architect account is required",
        )

    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.architect_profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can manage floors only for your own projects",
        )

    return project


def mark_project_pending_review(project: Project) -> None:
    """Ensure modified architectural information is reviewed again."""

    project.status = "pending_review"
    project.reviewed_by_user_id = None
    project.reviewed_at = None
    project.review_notes = None


def validate_unique_floor_number(
    db: Session,
    project_id: UUID,
    floor_number: int,
    exclude_floor_id: UUID | None = None,
) -> None:
    """Prevent duplicate floor numbers within a project."""

    query = select(ProjectFloor.id).where(
        ProjectFloor.project_id == project_id,
        ProjectFloor.floor_number == floor_number,
    )

    if exclude_floor_id is not None:
        query = query.where(ProjectFloor.id != exclude_floor_id)

    if db.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This floor number already exists in the project",
        )


# Public visitors can see floor information only after project approval.
@router.get(
    "/{project_id}/floors",
    response_model=list[ProjectFloorOut],
)
def list_public_project_floors(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)

    if project is None or project.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project not found",
        )

    return db.scalars(
        select(ProjectFloor)
        .where(ProjectFloor.project_id == project_id)
        .order_by(
            ProjectFloor.sort_order,
            ProjectFloor.floor_number,
        )
    ).all()


# Architects can see their floors even when a project is pending review.
@router.get(
    "/mine/{project_id}/floors",
    response_model=list[ProjectFloorOut],
)
def list_my_project_floors(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)

    return db.scalars(
        select(ProjectFloor)
        .where(ProjectFloor.project_id == project.id)
        .order_by(
            ProjectFloor.sort_order,
            ProjectFloor.floor_number,
        )
    ).all()


@router.post(
    "/{project_id}/floors",
    response_model=ProjectFloorOut,
    status_code=status.HTTP_201_CREATED,
)
def create_project_floor(
    project_id: UUID,
    payload: ProjectFloorCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)

    validate_unique_floor_number(
        db,
        project.id,
        payload.floor_number,
    )

    floor = ProjectFloor(
        project_id=project.id,
        floor_name=payload.floor_name.strip(),
        floor_number=payload.floor_number,
        description=payload.description,
        area_sqft=payload.area_sqft,
        sort_order=payload.sort_order,
    )

    try:
        db.add(floor)
        mark_project_pending_review(project)
        db.commit()
        db.refresh(floor)
        return floor
    except Exception:
        db.rollback()
        raise


@router.put(
    "/{project_id}/floors/{floor_id}",
    response_model=ProjectFloorOut,
)
def update_project_floor(
    project_id: UUID,
    floor_id: UUID,
    payload: ProjectFloorUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)

    floor = db.get(ProjectFloor, floor_id)

    if floor is None or floor.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Floor not found in this project",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one floor field to update",
        )

    # These database fields cannot be null.
    for required_field in ("floor_name", "floor_number"):
        if required_field in changes and changes[required_field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{required_field} cannot be null",
            )

    if "floor_number" in changes:
        validate_unique_floor_number(
            db,
            project.id,
            changes["floor_number"],
            exclude_floor_id=floor.id,
        )

    if "floor_name" in changes:
        changes["floor_name"] = changes["floor_name"].strip()

    try:
        for field, value in changes.items():
            setattr(floor, field, value)

        mark_project_pending_review(project)
        db.commit()
        db.refresh(floor)
        return floor
    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{project_id}/floors/{floor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project_floor(
    project_id: UUID,
    floor_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user, db)

    floor = db.get(ProjectFloor, floor_id)

    if floor is None or floor.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Floor not found in this project",
        )

    try:
        # Retain uploaded images but remove their association with this floor.
        linked_images = db.scalars(
            select(ProjectImage).where(
                ProjectImage.project_id == project.id,
                ProjectImage.floor_id == floor.id,
            )
        ).all()

        for image in linked_images:
            image.floor_id = None

        db.delete(floor)
        mark_project_pending_review(project)
        db.commit()
    except Exception:
        db.rollback()
        raise