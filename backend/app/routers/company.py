from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.dependencies import get_current_company, get_db
from app.models import AuditLog, ArchitectProfile, Enquiry, Project, SiteVisit, User
from app.schemas import (
    ArchitectReviewItem,
    AuditLogItem,
    CompanyEnquiryItem,
    CompanySiteVisitItem,
    EnquiryStatusUpdate,
    SiteVisitStatusUpdate,
)


router = APIRouter(prefix="/company", tags=["Company"])


def build_review_item(
    profile: ArchitectProfile,
    user: User,
) -> ArchitectReviewItem:
    return ArchitectReviewItem(
        id=profile.id,
        user_id=user.id,
        email=user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        bio=profile.bio,
        approval_status=profile.approval_status,
        account_created_at=user.created_at,
    )


def get_architect_or_404(
    db: Session,
    architect_profile_id: UUID,
) -> tuple[ArchitectProfile, User]:
    profile = db.get(ArchitectProfile, architect_profile_id)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Architect application not found",
        )

    user = db.get(User, profile.user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Architect account not found",
        )

    return profile, user


@router.get(
    "/architects/pending",
    response_model=list[ArchitectReviewItem],
)
def list_pending_architects(
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    query = (
        select(ArchitectProfile, User)
        .join(User, User.id == ArchitectProfile.user_id)
        .where(ArchitectProfile.approval_status == "pending")
        .order_by(User.created_at.asc())
    )

    rows = db.execute(query).all()
    return [build_review_item(profile, user) for profile, user in rows]


@router.post(
    "/architects/{architect_profile_id}/approve",
    response_model=ArchitectReviewItem,
)
def approve_architect(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)

    if profile.approval_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending architect applications can be approved",
        )

    try:
        profile.approval_status = "approved"
        record_audit_log(
            db,
            company_user,
            action="architect.approved",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={
                "previous_status": "pending",
                "new_status": "approved",
            },
        )
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    return build_review_item(profile, user)


@router.post(
    "/architects/{architect_profile_id}/reject",
    response_model=ArchitectReviewItem,
)
def reject_architect(
    architect_profile_id: UUID,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    profile, user = get_architect_or_404(db, architect_profile_id)

    if profile.approval_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending architect applications can be rejected",
        )

    try:
        profile.approval_status = "rejected"
        record_audit_log(
            db,
            company_user,
            action="architect.rejected",
            entity_type="architect_profile",
            entity_id=profile.id,
            details={
                "previous_status": "pending",
                "new_status": "rejected",
            },
        )
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise

    return build_review_item(profile, user)


@router.get(
    "/enquiries",
    response_model=list[CompanyEnquiryItem],
)
def list_company_enquiries(
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Enquiry, Project)
        .outerjoin(Project, Enquiry.project_id == Project.id)
        .order_by(Enquiry.created_at.desc())
    ).all()

    return [
        CompanyEnquiryItem(
            id=enquiry.id,
            project_id=enquiry.project_id,
            project_title=project.title if project else None,
            customer_profile_id=enquiry.customer_profile_id,
            customer_name=enquiry.customer_name,
            customer_email=enquiry.customer_email,
            customer_phone=enquiry.customer_phone,
            subject=enquiry.subject,
            message=enquiry.message,
            status=enquiry.status,
            created_at=enquiry.created_at,
            updated_at=enquiry.updated_at,
        )
        for enquiry, project in rows
    ]


@router.patch(
    "/enquiries/{enquiry_id}",
    response_model=CompanyEnquiryItem,
)
def update_company_enquiry(
    enquiry_id: UUID,
    payload: EnquiryStatusUpdate,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    enquiry = db.get(Enquiry, enquiry_id)

    if enquiry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enquiry not found",
        )

    previous_status = enquiry.status

    try:
        enquiry.status = payload.status

        if enquiry.assigned_company_user_id is None:
            enquiry.assigned_company_user_id = company_user.id

        record_audit_log(
            db,
            company_user,
            action="enquiry.status_updated",
            entity_type="enquiry",
            entity_id=enquiry.id,
            details={
                "previous_status": previous_status,
                "new_status": enquiry.status,
            },
        )
        db.commit()
        db.refresh(enquiry)
    except Exception:
        db.rollback()
        raise

    project = (
        db.get(Project, enquiry.project_id)
        if enquiry.project_id is not None
        else None
    )

    return CompanyEnquiryItem(
        id=enquiry.id,
        project_id=enquiry.project_id,
        project_title=project.title if project else None,
        customer_profile_id=enquiry.customer_profile_id,
        customer_name=enquiry.customer_name,
        customer_email=enquiry.customer_email,
        customer_phone=enquiry.customer_phone,
        subject=enquiry.subject,
        message=enquiry.message,
        status=enquiry.status,
        created_at=enquiry.created_at,
        updated_at=enquiry.updated_at,
    )


@router.get(
    "/site-visits",
    response_model=list[CompanySiteVisitItem],
)
def list_company_site_visits(
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(SiteVisit, Project)
        .join(Project, SiteVisit.project_id == Project.id)
        .order_by(SiteVisit.requested_at.asc())
    ).all()

    return [
        CompanySiteVisitItem(
            id=visit.id,
            project_id=visit.project_id,
            project_title=project.title,
            customer_name=visit.customer_name,
            customer_email=visit.customer_email,
            customer_phone=visit.customer_phone,
            requested_at=visit.requested_at,
            status=visit.status,
            company_notes=visit.company_notes,
            created_at=visit.created_at,
        )
        for visit, project in rows
    ]


@router.patch(
    "/site-visits/{visit_id}",
    response_model=CompanySiteVisitItem,
)
def update_company_site_visit(
    visit_id: UUID,
    payload: SiteVisitStatusUpdate,
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    visit = db.get(SiteVisit, visit_id)

    if visit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site-visit request not found",
        )

    project = db.get(Project, visit.project_id)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    previous_status = visit.status

    try:
        visit.status = payload.status
        visit.company_notes = payload.company_notes
        record_audit_log(
            db,
            company_user,
            action="site_visit.status_updated",
            entity_type="site_visit",
            entity_id=visit.id,
            details={
                "previous_status": previous_status,
                "new_status": visit.status,
            },
        )
        db.commit()
        db.refresh(visit)
    except Exception:
        db.rollback()
        raise

    return CompanySiteVisitItem(
        id=visit.id,
        project_id=visit.project_id,
        project_title=project.title,
        customer_name=visit.customer_name,
        customer_email=visit.customer_email,
        customer_phone=visit.customer_phone,
        requested_at=visit.requested_at,
        status=visit.status,
        company_notes=visit.company_notes,
        created_at=visit.created_at,
    )


@router.get(
    "/audit-logs",
    response_model=list[AuditLogItem],
)
def list_company_audit_logs(
    company_user: User = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    ).all()
