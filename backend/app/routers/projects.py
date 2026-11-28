
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_current_user
from app.models import ArchitectProfile, Project, User
from app.schemas import ProjectCreate, ProjectDraftSave, ProjectOut


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




@router.post("/drafts", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project_draft(
    payload: ProjectDraftSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an incomplete, private project draft for its owning architect."""
    profile = get_approved_architect_profile(db, user)
    values = payload.model_dump(exclude_unset=True)
    project = Project(
        architect_profile_id=profile.id,
        title=(values.get("title") or "").strip() or "Untitled project",
        description=values.get("description"),
        property_type=(values.get("property_type") or "").strip() or "Residential",
        city=(values.get("city") or "").strip() or "Not specified",
        state=(values.get("state") or "").strip() or "Not specified",
        status="draft",
    )
    editable_fields = {
        "area_sqft", "building_type", "architectural_style", "bhk",
        "facing", "entrance_facing", "plot_area_sqft", "plot_width_ft",
        "plot_length_ft", "carpet_area_sqft", "floor_count",
        "bedroom_count", "bathroom_count", "kitchen_count", "balcony_count",
        "parking_spaces", "estimated_cost_min", "estimated_cost_max", "amenities",
    }
    for field in editable_fields:
        if field in values:
            setattr(project, field, values[field])
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}/draft", response_model=ProjectOut)
def save_project_draft(
    project_id: UUID,
    payload: ProjectDraftSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save partial edits without sending the project to Company review."""
    profile = get_approved_architect_profile(db, user)
    project = db.get(Project, project_id)
    if project is None or project.status == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    if project.architect_profile_id != profile.id:
        raise HTTPException(status_code=403, detail="You can edit only your own projects")

    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        if field in {"title", "property_type", "city", "state"}:
            value = (value or "").strip()
        if field == "description":
            value = value.strip() if value else None
        if field in {"title", "property_type", "city", "state"} and not value:
            value = {
                "title": "Untitled project",
                "property_type": "Residential",
                "city": "Not specified",
                "state": "Not specified",
            }[field]
        setattr(project, field, value)

    project.status = "draft"
    project.reviewed_by_user_id = None
    project.reviewed_at = None
    project.review_notes = None
    db.commit()
    db.refresh(project)
    return project

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
    search: str | None = Query(default=None, max_length=120),

    min_plot_area_sqft: int | None = Query(default=None, ge=1),
    max_plot_area_sqft: int | None = Query(default=None, ge=1),

    min_budget_inr: Decimal | None = Query(default=None, ge=0),
    max_budget_inr: Decimal | None = Query(default=None, ge=0),

    bhk: int | None = Query(default=None, ge=1, le=20),
    floor_count: int | None = Query(default=None, ge=1, le=100),

    facing: str | None = Query(default=None, max_length=20),
    architectural_style: str | None = Query(default=None, max_length=80),
    property_type: str | None = Query(default=None, max_length=50),

    city: str | None = Query(default=None, max_length=100),
    state: str | None = Query(default=None, max_length=100),
    sort_by: str = Query(default="newest", max_length=30),

    # Advanced plot dimensions
    min_plot_width_ft: Decimal | None = Query(default=None, ge=0),
    max_plot_width_ft: Decimal | None = Query(default=None, ge=0),
    min_plot_length_ft: Decimal | None = Query(default=None, ge=0),
    max_plot_length_ft: Decimal | None = Query(default=None, ge=0),

    # Advanced area filters
    min_area_sqft: int | None = Query(default=None, ge=1),
    max_area_sqft: int | None = Query(default=None, ge=1),
    min_carpet_area_sqft: int | None = Query(default=None, ge=1),
    max_carpet_area_sqft: int | None = Query(default=None, ge=1),

    # Room and parking requirements
    bedroom_count: int | None = Query(default=None, ge=0, le=100),
    bathroom_count: int | None = Query(default=None, ge=0, le=100),
    parking_spaces: int | None = Query(default=None, ge=0, le=100),

    # Entrance direction
    entrance_facing: str | None = Query(default=None, max_length=20),

    db: Session = Depends(get_db),
):
    """
    Public design discovery.

    Only approved projects are returned.
    All filters are optional, so the existing public listing
    continues to work without query parameters.
    """

    if (
        min_plot_area_sqft is not None
        and max_plot_area_sqft is not None
        and min_plot_area_sqft > max_plot_area_sqft
    ):
        raise HTTPException(
            status_code=422,
            detail="Minimum plot area cannot exceed maximum plot area.",
        )

    if (
        min_budget_inr is not None
        and max_budget_inr is not None
        and min_budget_inr > max_budget_inr
    ):
        raise HTTPException(
            status_code=422,
            detail="Minimum budget cannot exceed maximum budget.",
        )

    range_filters = (
        ("plot width", min_plot_width_ft, max_plot_width_ft),
        ("plot length", min_plot_length_ft, max_plot_length_ft),
        ("built-up area", min_area_sqft, max_area_sqft),
        ("carpet area", min_carpet_area_sqft, max_carpet_area_sqft),
    )

    for label, minimum, maximum in range_filters:
        if (
            minimum is not None
            and maximum is not None
            and minimum > maximum
        ):
            raise HTTPException(
                status_code=422,
                detail=f"Minimum {label} cannot exceed maximum {label}.",
            )

    stmt = select(Project).where(
        Project.status == "approved"
    )

    # General search across project information.
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Project.title.ilike(pattern),
                Project.description.ilike(pattern),
                Project.city.ilike(pattern),
                Project.state.ilike(pattern),
                Project.property_type.ilike(pattern),
                Project.architectural_style.ilike(pattern),
            )
        )

    # Plot area filters.
    if min_plot_area_sqft is not None:
        stmt = stmt.where(
            Project.plot_area_sqft >= min_plot_area_sqft
        )

    if max_plot_area_sqft is not None:
        stmt = stmt.where(
            Project.plot_area_sqft <= max_plot_area_sqft
        )

        # Plot width filters.
    if min_plot_width_ft is not None:
        stmt = stmt.where(
            Project.plot_width_ft >= min_plot_width_ft
        )

    if max_plot_width_ft is not None:
        stmt = stmt.where(
            Project.plot_width_ft <= max_plot_width_ft
        )

    # Plot length filters.
    if min_plot_length_ft is not None:
        stmt = stmt.where(
            Project.plot_length_ft >= min_plot_length_ft
        )

    if max_plot_length_ft is not None:
        stmt = stmt.where(
            Project.plot_length_ft <= max_plot_length_ft
        )

    # Built-up area filters.
    if min_area_sqft is not None:
        stmt = stmt.where(
            Project.area_sqft >= min_area_sqft
        )

    if max_area_sqft is not None:
        stmt = stmt.where(
            Project.area_sqft <= max_area_sqft
        )

    # Carpet area filters.
    if min_carpet_area_sqft is not None:
        stmt = stmt.where(
            Project.carpet_area_sqft >= min_carpet_area_sqft
        )

    if max_carpet_area_sqft is not None:
        stmt = stmt.where(
            Project.carpet_area_sqft <= max_carpet_area_sqft
        )

    # Room and parking filters.
    if bedroom_count is not None:
        stmt = stmt.where(
            Project.bedroom_count == bedroom_count
        )

    if bathroom_count is not None:
        stmt = stmt.where(
            Project.bathroom_count == bathroom_count
        )

    if parking_spaces is not None:
        stmt = stmt.where(
            Project.parking_spaces == parking_spaces
        )

    # Entrance direction filter.
    if entrance_facing and entrance_facing.strip():
        stmt = stmt.where(
            Project.entrance_facing.ilike(
                f"%{entrance_facing.strip()}%"
            )
        )

    # Construction budget filters in INR.
    # The estimated project cost ranges must overlap
    # the customer's selected budget range.
    if min_budget_inr is not None:
        stmt = stmt.where(
            Project.estimated_cost_max >= min_budget_inr
        )

    if max_budget_inr is not None:
        stmt = stmt.where(
            Project.estimated_cost_min <= max_budget_inr
        )

    # Building requirements.
    if bhk is not None:
        stmt = stmt.where(Project.bhk == bhk)

    if floor_count is not None:
        stmt = stmt.where(Project.floor_count == floor_count)

    # Architectural preferences.
    if facing and facing.strip():
        stmt = stmt.where(
            Project.facing.ilike(f"%{facing.strip()}%")
        )

    if architectural_style and architectural_style.strip():
        stmt = stmt.where(
            Project.architectural_style.ilike(
                f"%{architectural_style.strip()}%"
            )
        )

    if property_type and property_type.strip():
        stmt = stmt.where(
            Project.property_type.ilike(
                f"%{property_type.strip()}%"
            )
        )

    # Location filters.
    if city and city.strip():
        stmt = stmt.where(
            Project.city.ilike(f"%{city.strip()}%")
        )

    if state and state.strip():
        stmt = stmt.where(
            Project.state.ilike(f"%{state.strip()}%")
        )

    sort_options = {
        "newest": Project.created_at.desc(),
        "budget_low": Project.estimated_cost_min.asc().nulls_last(),
        "budget_high": Project.estimated_cost_max.desc().nulls_last(),
        "plot_small": Project.plot_area_sqft.asc().nulls_last(),
        "plot_large": Project.plot_area_sqft.desc().nulls_last(),
    }

    if sort_by not in sort_options:
        raise HTTPException(
            status_code=422,
            detail="Invalid sort option.",
        )

    return db.scalars(
        stmt.order_by(
            sort_options[sort_by],
            Project.created_at.desc(),
        )
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
