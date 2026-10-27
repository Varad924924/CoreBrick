
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Enquiry, Project
from app.schemas import EnquiryCreate, EnquiryCreated


router = APIRouter(prefix="/enquiries", tags=["Enquiries"])


@router.post(
    "",
    response_model=EnquiryCreated,
    status_code=status.HTTP_201_CREATED,
)
def create_enquiry(
    payload: EnquiryCreate,
    db: Session = Depends(get_db),
):
    project = db.get(Project, payload.project_id)

    # Customers may enquire only about approved projects.
    if project is None or project.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved project not found",
        )

    enquiry = Enquiry(
        project_id=project.id,
        customer_profile_id=None,
        customer_name=payload.customer_name.strip(),
        customer_email=str(payload.customer_email).lower(),
        customer_phone=payload.customer_phone.strip(),
        subject=payload.subject.strip() if payload.subject else None,
        message=payload.message.strip(),
        status="new",
    )

    try:
        db.add(enquiry)
        db.commit()
        db.refresh(enquiry)

        return EnquiryCreated(
            id=enquiry.id,
            status=enquiry.status,
            message="Your enquiry has been submitted to Core Brick.",
        )
    except Exception:
        db.rollback()
        raise
