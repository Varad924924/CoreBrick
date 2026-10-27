
from uuid import UUID
from typing import Literal
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime



class CustomerRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    phone: str | None = Field(default=None, min_length=7, max_length=30)


class ArchitectRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    phone: str = Field(min_length=7, max_length=30)
    bio: str | None = Field(default=None, max_length=5000)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserSummary(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    is_active: bool
    architect_approval_status: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSummary


class ArchitectReviewItem(BaseModel):
    id: UUID
    user_id: UUID
    email: EmailStr
    full_name: str
    phone: str
    bio: str | None = None
    approval_status: str
    account_created_at: datetime



class ProjectCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)

    # Existing fields
    property_type: str = Field(min_length=2, max_length=50)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    area_sqft: int | None = Field(default=None, gt=0)

    # Building classification
    building_type: str | None = Field(default=None, max_length=50)
    architectural_style: str | None = Field(default=None, max_length=80)
    bhk: int | None = Field(default=None, ge=1, le=20)
    facing: str | None = Field(default=None, max_length=20)
    entrance_facing: str | None = Field(default=None, max_length=20)

    # Plot and area measurements
    plot_area_sqft: int | None = Field(default=None, gt=0)
    plot_width_ft: Decimal | None = Field(default=None, gt=0)
    plot_length_ft: Decimal | None = Field(default=None, gt=0)
    carpet_area_sqft: int | None = Field(default=None, gt=0)

    # Rooms and floors
    floor_count: int | None = Field(default=None, ge=1, le=100)
    bedroom_count: int | None = Field(default=None, ge=0, le=100)
    bathroom_count: int | None = Field(default=None, ge=0, le=100)
    kitchen_count: int | None = Field(default=None, ge=0, le=20)
    balcony_count: int | None = Field(default=None, ge=0, le=100)
    parking_spaces: int | None = Field(default=None, ge=0, le=100)

    # Estimated budget in INR
    estimated_cost_min: Decimal | None = Field(default=None, gt=0)
    estimated_cost_max: Decimal | None = Field(default=None, gt=0)

    # Example: ["parking", "garden", "terrace"]
    amenities: list[str] | None = Field(default=None, max_length=50)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    property_type: str
    city: str
    state: str
    area_sqft: int | None

    building_type: str | None = None
    architectural_style: str | None = None
    bhk: int | None = None
    facing: str | None = None
    entrance_facing: str | None = None

    plot_area_sqft: int | None = None
    plot_width_ft: Decimal | None = None
    plot_length_ft: Decimal | None = None
    carpet_area_sqft: int | None = None

    floor_count: int | None = None
    bedroom_count: int | None = None
    bathroom_count: int | None = None
    kitchen_count: int | None = None
    balcony_count: int | None = None
    parking_spaces: int | None = None

    estimated_cost_min: Decimal | None = None
    estimated_cost_max: Decimal | None = None
    amenities: list[str] | None = None

    status: str
    created_at: datetime
    updated_at: datetime



class CompanyProjectReviewItem(ProjectOut):
    architect_profile_id: UUID
    architect_name: str


class ProjectReviewRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


class EnquiryCreate(BaseModel):
    project_id: UUID
    customer_name: str = Field(min_length=2, max_length=150)
    customer_email: EmailStr
    customer_phone: str = Field(min_length=7, max_length=30)
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=10, max_length=5000)


class EnquiryCreated(BaseModel):
    id: UUID
    status: str
    message: str


class CompanyEnquiryItem(BaseModel):
    id: UUID
    project_id: UUID | None
    project_title: str | None
    customer_profile_id: UUID | None
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    subject: str | None
    message: str
    status: str
    created_at: datetime
    updated_at: datetime


class EnquiryStatusUpdate(BaseModel):
    status: Literal[
        "new",
        "in_progress",
        "contacted",
        "resolved",
        "closed",
    ]


class ProjectImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    image_url: str
    alt_text: str | None = None
    sort_order: int = 0
    category: str = "other"
    floor_id: UUID | None = None
    is_cover: bool = False
    review_status: str = "pending_review"
    review_notes: str | None = None
    reviewed_at: datetime | None = None

class ImageReviewRequest(BaseModel):
    status: Literal["approved", "rejected"]
    review_notes: str | None = Field(default=None, max_length=2000)

class ProjectFloorCreate(BaseModel):
    floor_name: str = Field(min_length=1, max_length=100)
    floor_number: int = Field(ge=-10, le=200)
    description: str | None = Field(default=None, max_length=2000)
    area_sqft: int | None = Field(default=None, gt=0)
    sort_order: int = Field(default=0, ge=0)


class ProjectFloorUpdate(BaseModel):
    floor_name: str | None = Field(
        default=None, min_length=1, max_length=100
    )
    floor_number: int | None = Field(
        default=None, ge=-10, le=200
    )
    description: str | None = Field(default=None, max_length=2000)
    area_sqft: int | None = Field(default=None, gt=0)
    sort_order: int | None = Field(default=None, ge=0)


class ProjectFloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    floor_name: str
    floor_number: int
    description: str | None = None
    area_sqft: int | None = None
    sort_order: int = 0
    created_at: datetime


class SiteVisitCreate(BaseModel):
    project_id: UUID
    customer_name: str = Field(min_length=2, max_length=150)
    customer_email: EmailStr
    customer_phone: str = Field(min_length=7, max_length=30)
    requested_at: datetime


class SiteVisitCreated(BaseModel):
    id: UUID
    project_id: UUID
    status: str
    requested_at: datetime
    message: str


class CompanySiteVisitItem(BaseModel):
    id: UUID
    project_id: UUID
    project_title: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    requested_at: datetime
    status: str
    company_notes: str | None = None
    created_at: datetime


class SiteVisitStatusUpdate(BaseModel):
    status: Literal[
        "requested",
        "confirmed",
        "rescheduled",
        "completed",
        "cancelled",
    ]
    company_notes: str | None = Field(default=None, max_length=2000)


class AuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_user_id: UUID | None
    actor_email: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: UUID | None
    details: dict | None = None
    created_at: datetime
