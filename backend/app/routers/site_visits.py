
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Project, SiteVisit
from app.schemas import SiteVisitCreate, SiteVisitCreated


router = APIRouter(prefix="/site-visits", tags=["Site Visits"])


@router.post(
    "",
    response_model=SiteVisitCreated,
    status_code=status.HTTP_201_CREATED,
)
def request_site_visit(
    payload: SiteVisitCreate,
    db: Session = Depends(get_db),
):
    project = db.get(Project, payload.project_id)

    # Visits may only be requested for publicly approved projects.
    if project is None or project.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project not found",
        )

    requested_at = payload.requested_at

    # Require a timezone-aware date and time to avoid ambiguity.
    if requested_at.tzinfo is None or requested_at.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Include a timezone in requested_at, for example +05:30",
        )

    if requested_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The requested visit must be in the future",
        )

    visit = SiteVisit(
        project_id=project.id,
        enquiry_id=None,
        customer_profile_id=None,
        customer_name=payload.customer_name.strip(),
        customer_email=str(payload.customer_email).lower(),
        customer_phone=payload.customer_phone.strip(),
        requested_at=requested_at,
        status="requested",
    )

    try:
        db.add(visit)
        db.commit()
        db.refresh(visit)

        return SiteVisitCreated(
            id=visit.id,
            project_id=visit.project_id,
            status=visit.status,
            requested_at=visit.requested_at,
            message="Your site-visit request has been sent to Core Brick.",
        )
    except Exception:
        db.rollback()
        raise
