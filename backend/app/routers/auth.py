
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import ArchitectProfile, CustomerProfile, User
from app.schemas import (
    ArchitectRegister,
    AuthResponse,
    CustomerRegister,
    LoginRequest,
    UserSummary,
)
from app.security import create_access_token, hash_password, verify_password


router = APIRouter(prefix="/auth", tags=["Authentication"])


def make_user_summary(db: Session, user: User) -> UserSummary:
    approval_status = None

    if user.role == "architect":
        profile = db.scalar(
            select(ArchitectProfile).where(
                ArchitectProfile.user_id == user.id
            )
        )
        approval_status = profile.approval_status if profile else None

    return UserSummary(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        architect_approval_status=approval_status,
    )


def make_auth_response(db: Session, user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(str(user.id)),
        user=make_user_summary(db, user),
    )


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User).where(func.lower(User.email) == email.lower())
    )


def reject_duplicate_email(db: Session, email: str) -> None:
    if find_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )


@router.post(
    "/register/customer",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_customer(
    payload: CustomerRegister,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower()
    reject_duplicate_email(db, email)

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        role="customer",
        is_active=True,
    )

    try:
        db.add(user)
        db.flush()

        profile = CustomerProfile(
            user_id=user.id,
            full_name=payload.full_name.strip(),
            phone=payload.phone.strip() if payload.phone else None,
        )
        db.add(profile)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    return make_auth_response(db, user)


@router.post(
    "/register/architect",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_architect(
    payload: ArchitectRegister,
    db: Session = Depends(get_db),
):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Architect registration requires email verification. "
            "Use /auth/architect/signup/request-otp."
        ),
    )

@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower()
    user = find_user_by_email(db, email)

    if user is None or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is disabled",
        )

    return make_auth_response(db, user)


@router.get("/me", response_model=UserSummary)
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return make_user_summary(db, user)
