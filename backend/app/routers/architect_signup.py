from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import settings
from app.dependencies import get_db
from app.email_service import send_otp_email
from app.models import ArchitectProfile, ArchitectSignupChallenge, User
from app.routers.auth import find_user_by_email, make_auth_response
from app.schemas_architect_signup import (
    ArchitectSignupComplete,
    ArchitectSignupOtpRequest,
    ArchitectSignupOtpVerify,
)
from app.security import hash_password


router = APIRouter(
    prefix="/auth/architect/signup",
    tags=["Architect Signup"],
)

OTP_LIFETIME_MINUTES = 10
SIGNUP_TOKEN_LIFETIME_MINUTES = 15
OTP_MAX_ATTEMPTS = 5
OTP_MAX_RESENDS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60


def secret_digest(email: str, purpose: str, value: str) -> str:
    """Hash an OTP or signup token using a server-side secret."""
    message = f"{purpose}:{email}:{value}".encode("utf-8")
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def get_challenge(
    db: Session,
    email: str,
) -> ArchitectSignupChallenge | None:
    return db.scalar(
        select(ArchitectSignupChallenge)
        .where(ArchitectSignupChallenge.email == email)
        .with_for_update()
    )


@router.post("/request-otp", status_code=status.HTTP_202_ACCEPTED)
def request_architect_signup_otp(
    payload: ArchitectSignupOtpRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()

    if find_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, email)

    active_challenge = (
        challenge is not None and challenge.expires_at > now
    )

    if active_challenge:
        assert challenge is not None

        if challenge.last_sent_at > now - timedelta(
            seconds=OTP_RESEND_COOLDOWN_SECONDS
        ):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another OTP.",
            )

        if challenge.resend_count >= OTP_MAX_RESENDS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="OTP resend limit reached. Try again after expiry.",
            )

        resend_count = challenge.resend_count + 1
    else:
        resend_count = 0

    otp = f"{secrets.randbelow(1_000_000):06d}"
    password_hash = hash_password(payload.password)
    otp_hash = secret_digest(email, "architect-otp", otp)
    expires_at = now + timedelta(minutes=OTP_LIFETIME_MINUTES)

    if challenge is None:
        challenge = ArchitectSignupChallenge(
            email=email,
            password_hash=password_hash,
            otp_hash=otp_hash,
            expires_at=expires_at,
            attempt_count=0,
            resend_count=resend_count,
            last_sent_at=now,
            verified_at=None,
            signup_token_hash=None,
            signup_token_expires_at=None,
        )
        db.add(challenge)
    else:
        challenge.password_hash = password_hash
        challenge.otp_hash = otp_hash
        challenge.expires_at = expires_at
        challenge.attempt_count = 0
        challenge.resend_count = resend_count
        challenge.last_sent_at = now
        challenge.verified_at = None
        challenge.signup_token_hash = None
        challenge.signup_token_expires_at = None

    # Send before committing so a definite delivery failure rolls back
    # the corresponding challenge update.
    try:
        send_otp_email(
            to_email=email,
            otp=otp,
            expires_minutes=OTP_LIFETIME_MINUTES,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email could not be sent. Please try again.",
        ) from exc

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sign-up request for this email is already being processed.",
        ) from exc

    return {
        "message": "Verification code sent. Check your email.",
        "expires_in_seconds": OTP_LIFETIME_MINUTES * 60,
        "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }


@router.post("/verify-otp")
def verify_architect_signup_otp(
    payload: ArchitectSignupOtpVerify,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, email)

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        )

    if challenge.expires_at <= now:
        db.delete(challenge)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired. Request a new code.",
        )

    if challenge.attempt_count >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Request a new code.",
        )

    if challenge.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already verified. Continue sign-up or request a new code.",
        )

    challenge.attempt_count += 1
    expected_hash = secret_digest(email, "architect-otp", payload.otp)

    if not hmac.compare_digest(challenge.otp_hash, expected_hash):
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code.",
        )

    signup_token = secrets.token_urlsafe(32)
    challenge.verified_at = now
    challenge.signup_token_hash = secret_digest(
        email,
        "architect-signup-token",
        signup_token,
    )
    challenge.signup_token_expires_at = now + timedelta(
        minutes=SIGNUP_TOKEN_LIFETIME_MINUTES
    )

    db.commit()

    return {
        "message": "Email verified successfully.",
        "signup_token": signup_token,
        "expires_in_seconds": SIGNUP_TOKEN_LIFETIME_MINUTES * 60,
    }


@router.post(
    "/complete",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def complete_architect_signup():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Architect account creation is disabled until signup fee "
            "verification is implemented."
        ),
    )
