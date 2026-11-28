from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import settings
from app.dependencies import get_db
from app.email_service import send_password_reset_otp_email
from app.models import ArchitectPasswordResetChallenge, User
from app.routers.auth import find_user_by_email
from app.schemas_password_reset import (
    ArchitectPasswordResetComplete,
    ArchitectPasswordResetRequest,
    ArchitectPasswordResetVerify,
)
from app.security import hash_password


router = APIRouter(
    prefix="/auth/architect/password-reset",
    tags=["Architect Password Reset"],
)

OTP_LIFETIME_MINUTES = 10
RESET_TOKEN_LIFETIME_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_MAX_RESENDS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60


def secret_digest(user_id: str, purpose: str, value: str) -> str:
    message = f"{purpose}:{user_id}:{value}".encode("utf-8")
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def get_challenge(db: Session, user_id):
    return db.scalar(
        select(ArchitectPasswordResetChallenge)
        .where(ArchitectPasswordResetChallenge.user_id == user_id)
        .with_for_update()
    )


def invalid_code():
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired verification code.",
    )


@router.post("/request-otp", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset_otp(
    payload: ArchitectPasswordResetRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    user = find_user_by_email(db, email)

    # Deliberately return the same response for unknown/non-architect accounts
    # to avoid disclosing whether an email is registered.
    generic_response = {
        "message": "If an active architect account exists for this email, a verification code has been sent.",
        "expires_in_seconds": OTP_LIFETIME_MINUTES * 60,
        "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }
    if user is None or user.role != "architect" or not user.is_active:
        return generic_response

    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, user.id)

    if challenge is not None and challenge.expires_at > now:
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
    otp_hash = secret_digest(str(user.id), "architect-password-reset-otp", otp)
    expires_at = now + timedelta(minutes=OTP_LIFETIME_MINUTES)

    if challenge is None:
        challenge = ArchitectPasswordResetChallenge(
            user_id=user.id,
            otp_hash=otp_hash,
            expires_at=expires_at,
            attempt_count=0,
            resend_count=resend_count,
            last_sent_at=now,
        )
        db.add(challenge)
    else:
        challenge.otp_hash = otp_hash
        challenge.expires_at = expires_at
        challenge.attempt_count = 0
        challenge.resend_count = resend_count
        challenge.last_sent_at = now
        challenge.verified_at = None
        challenge.reset_token_hash = None
        challenge.reset_token_expires_at = None

    try:
        send_password_reset_otp_email(
            to_email=email,
            otp=otp,
            expires_minutes=OTP_LIFETIME_MINUTES,
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password-reset email could not be sent. Please try again.",
        ) from exc

    return generic_response


@router.post("/verify-otp")
def verify_password_reset_otp(
    payload: ArchitectPasswordResetVerify,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    user = find_user_by_email(db, email)
    if user is None or user.role != "architect" or not user.is_active:
        raise invalid_code()

    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, user.id)
    if challenge is None or challenge.expires_at <= now:
        raise invalid_code()

    if challenge.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This code has already been verified. Request a new code.",
        )
    if challenge.attempt_count >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Request a new code.",
        )

    challenge.attempt_count += 1
    expected = secret_digest(
        str(user.id), "architect-password-reset-otp", payload.otp
    )
    if not hmac.compare_digest(challenge.otp_hash, expected):
        db.commit()
        raise invalid_code()

    reset_token = secrets.token_urlsafe(32)
    challenge.verified_at = now
    challenge.reset_token_hash = secret_digest(
        str(user.id), "architect-password-reset-token", reset_token
    )
    challenge.reset_token_expires_at = now + timedelta(
        minutes=RESET_TOKEN_LIFETIME_MINUTES
    )
    db.commit()

    return {
        "message": "Email verified. You can now set a new password.",
        "reset_token": reset_token,
        "expires_in_seconds": RESET_TOKEN_LIFETIME_MINUTES * 60,
    }


@router.post("/reset-password")
def complete_password_reset(
    payload: ArchitectPasswordResetComplete,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    user = find_user_by_email(db, email)
    if user is None or user.role != "architect" or not user.is_active:
        raise invalid_code()

    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, user.id)
    if (
        challenge is None
        or challenge.verified_at is None
        or challenge.reset_token_hash is None
        or challenge.reset_token_expires_at is None
        or challenge.reset_token_expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password-reset session expired. Request a new code.",
        )

    supplied_hash = secret_digest(
        str(user.id), "architect-password-reset-token", payload.reset_token
    )
    if not hmac.compare_digest(challenge.reset_token_hash, supplied_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password-reset session. Verify your email again.",
        )

    user.password_hash = hash_password(payload.new_password)
    db.delete(challenge)
    db.commit()

    return {"message": "Password reset successfully. Please sign in with your new password."}



