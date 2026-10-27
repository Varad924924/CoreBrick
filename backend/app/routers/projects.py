
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_current_user
from app.models import ArchitectProfile, Project, User
from app.schemas import ProjectCreate, ProjectOut


router = APIRouter(prefix="/projects", tags=["Projects"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_approved_architect_profile(
    db: Session,
    user: User,
) -> ArchitectProfile:
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

    return profile


@router.post(
    "",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_approved_architect_profile(db, user)

    project = Project(
        architect_profile_id=profile.id,
        title=payload.title.strip(),
        description=payload.description,
        property_type=payload.property_type.strip(),
        city=payload.city.strip(),
        state=payload.state.strip(),
        area_sqft=payload.area_sqft,

        # Architectural details
        building_type=payload.building_type,
        architectural_style=payload.architectural_style,
        bhk=payload.bhk,
        facing=payload.facing,
        entrance_facing=payload.entrance_facing,

        # Plot and area measurements
        plot_area_sqft=payload.plot_area_sqft,
        plot_width_ft=payload.plot_width_ft,
        plot_length_ft=payload.plot_length_ft,
        carpet_area_sqft=payload.carpet_area_sqft,

        # Rooms and floors
        floor_count=payload.floor_count,
        bedroom_count=payload.bedroom_count,
        bathroom_count=payload.bathroom_count,
        kitchen_count=payload.kitchen_count,
        balcony_count=payload.balcony_count,
        parking_spaces=payload.parking_spaces,

        # Estimated construction budget and amenities
        estimated_cost_min=payload.estimated_cost_min,
        estimated_cost_max=payload.estimated_cost_max,
        amenities=payload.amenities,

        status="pending_review",
    )

    try:
        db.add(project)
        db.commit()
        db.refresh(project)
        return project
    except Exception:
        db.rollback()
        raise


@router.get("/mine", response_model=list[ProjectOut])
def list_my_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Architect profile not found",
        )

    return db.scalars(
        select(Project)
        .where(
            Project.architect_profile_id == profile.id,
            Project.status != "deleted",
        )
        .order_by(Project.created_at.desc())
    ).all()


@router.get("/public", response_model=list[ProjectOut])
def list_public_projects(
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Project)
        .where(Project.status == "approved")
        .order_by(Project.created_at.desc())
    ).all()


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hide an architect-owned project from both dashboards without breaking historical records.

    This is a soft delete: public listings only include approved projects, and the
    architect's project list excludes rows whose status is "deleted". Existing
    enquiries/site visits are retained for Company history.
    """
    profile = get_approved_architect_profile(db, user)
    project = db.get(Project, project_id)

    if project is None or project.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.architect_profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can delete only your own projects",
        )

    try:
        project.status = "deleted"
        project.reviewed_by_user_id = None
        project.reviewed_at = None
        project.review_notes = None
        db.commit()
        return {
            "message": "Project removed from Architect and public listings.",
            "project_id": str(project.id),
            "status": "deleted",
        }
    except Exception:
        db.rollback()
        raise


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_approved_architect_profile(db, user)

    project = db.get(Project, project_id)

    if project is None or project.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.architect_profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can edit only your own projects",
        )

    # Update only fields included in the request.
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        if field in {"title", "property_type", "city", "state"}:
            value = value.strip()
        elif field == "description":
            value = value.strip() if value else None

        setattr(project, field, value)

    # Every edit must go through Company review again.
    project.status = "pending_review"
    project.reviewed_by_user_id = None
    project.reviewed_at = None
    project.review_notes = None

    try:
        db.commit()
        db.refresh(project)
        return project
    except Exception:
        db.rollback()
        raise