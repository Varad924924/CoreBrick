from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from requests.exceptions import RequestException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import settings
from app.dependencies import get_db
from app.email_service import send_otp_email
from app.models import ArchitectProfile, ArchitectSignupChallenge, User
from app.routers.auth import find_user_by_email, make_auth_response
from app.schemas_architect_signup import (
    ArchitectGoogleCredentialRequest,
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



@router.post("/google")
def architect_google_signup_or_login(
    payload: ArchitectGoogleCredentialRequest,
    db: Session = Depends(get_db),
):
    """Verify a Google ID token and sign up or sign in an architect."""

    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )

    try:
        google_info = id_token.verify_oauth2_token(
            payload.credential,
            GoogleRequest(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google credential.",
        ) from exc
    except (GoogleAuthError, RequestException) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google identity verification is temporarily unavailable.",
        ) from exc

    issuer = google_info.get("iss")
    if issuer not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google credential has an invalid issuer.",
        )

    google_sub = google_info.get("sub")
    raw_email = google_info.get("email")
    email_verified = (
        google_info.get("email_verified") is True
        or str(google_info.get("email_verified", "")).lower() == "true"
    )

    if (
        not isinstance(google_sub, str)
        or not google_sub
        or not isinstance(raw_email, str)
        or "@" not in raw_email
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google credential is missing required identity claims.",
        )

    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google has not verified this email address. Use email OTP signup.",
        )

    email = raw_email.strip().lower()
    email_domain = email.rsplit("@", 1)[-1]
    hosted_domain = google_info.get("hd")

    # Google is authoritative for Gmail addresses and verified Workspace
    # identities that include a hosted-domain claim. For other addresses,
    # keep the existing email OTP flow available.
    is_gmail = email_domain == "gmail.com"
    is_workspace = isinstance(hosted_domain, str) and bool(hosted_domain.strip())

    if not (is_gmail or is_workspace):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This Google account does not provide an authoritative "
                "email identity. Please use email and OTP signup."
            ),
        )

    # Use Google's stable subject identifier, not email, for returning users.
    google_user = db.scalar(
        select(User).where(User.google_sub == google_sub)
    )

    if google_user is not None:
        if google_user.role != "architect":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This Google identity is not registered as an architect.",
            )

        if not google_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This architect account is disabled.",
            )

        auth_response = make_auth_response(db, google_user)
        return {
            "action": "login",
            **auth_response.model_dump(mode="json"),
        }

    # Never silently link Google to an existing password-based account.
    existing_email_user = find_user_by_email(db, email)
    if existing_email_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An account already exists with this email. "
                "Sign in using its existing method; Google has not been linked."
            ),
        )

    now = datetime.now(timezone.utc)
    token_expires_at = now + timedelta(
        minutes=SIGNUP_TOKEN_LIFETIME_MINUTES
    )
    signup_token = secrets.token_urlsafe(32)

    challenge = get_challenge(db, email)

    # Google accounts do not need a Core Brick email OTP. The required
    # password_hash and otp_hash columns receive non-usable random values.
    unusable_password_hash = hash_password(secrets.token_urlsafe(48))
    unused_otp_hash = secret_digest(
        email,
        "google-signup-no-otp",
        secrets.token_urlsafe(32),
    )
    token_hash = secret_digest(
        email,
        "architect-signup-token",
        signup_token,
    )

    if challenge is None:
        challenge = ArchitectSignupChallenge(
            email=email,
            password_hash=unusable_password_hash,
            otp_hash=unused_otp_hash,
            expires_at=token_expires_at,
            attempt_count=0,
            resend_count=0,
            last_sent_at=now,
            verified_at=now,
            signup_token_hash=token_hash,
            signup_token_expires_at=token_expires_at,
            google_sub=google_sub,
        )
        db.add(challenge)
    else:
        challenge.password_hash = unusable_password_hash
        challenge.otp_hash = unused_otp_hash
        challenge.expires_at = token_expires_at
        challenge.attempt_count = 0
        challenge.resend_count = 0
        challenge.last_sent_at = now
        challenge.verified_at = now
        challenge.signup_token_hash = token_hash
        challenge.signup_token_expires_at = token_expires_at
        challenge.google_sub = google_sub

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google sign-up is already being processed. Please try again.",
        ) from exc

    google_name = google_info.get("name")
    return {
        "action": "complete_profile",
        "email": email,
        "full_name": google_name if isinstance(google_name, str) else "",
        "signup_token": signup_token,
        "expires_in_seconds": SIGNUP_TOKEN_LIFETIME_MINUTES * 60,
    }


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
        challenge.google_sub = None

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
    status_code=status.HTTP_201_CREATED,
)
def complete_architect_signup(
    payload: ArchitectSignupComplete,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    now = datetime.now(timezone.utc)
    challenge = get_challenge(db, email)

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-up session not found. Please start again.",
        )

    if challenge.verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email before completing registration.",
        )

    if (
        challenge.signup_token_expires_at is None
        or challenge.signup_token_expires_at <= now
        or challenge.signup_token_hash is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-up token expired. Please verify your email again.",
        )

    provided_hash = secret_digest(
        email,
        "architect-signup-token",
        payload.signup_token,
    )

    if not hmac.compare_digest(
        challenge.signup_token_hash,
        provided_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid sign-up token.",
        )

    if find_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=email,
        password_hash=challenge.password_hash,
        google_sub=challenge.google_sub,
        role="architect",
        is_active=True,
    )

    try:
        db.add(user)
        db.flush()

        profile = ArchitectProfile(
            user_id=user.id,
            full_name=payload.full_name.strip(),
            phone=payload.phone.strip(),
            bio=payload.bio.strip() if payload.bio else None,
            approval_status="pending",
        )

        db.add(profile)
        db.delete(challenge)
        db.commit()
        db.refresh(user)

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc

    return make_auth_response(db, user)
