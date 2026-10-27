from email.message import EmailMessage
import smtplib
import ssl

from app.database import settings


def send_otp_email(
    to_email: str,
    otp: str,
    expires_minutes: int = 10,
) -> None:
    """Send an architect email-verification code through configured SMTP."""

    host = settings.smtp_host
    sender = settings.smtp_from_email

    if not host or not sender:
        raise RuntimeError(
            "Email delivery is not configured. Configure SMTP_HOST "
            "and SMTP_FROM_EMAIL before requesting an OTP."
        )

    username = settings.smtp_username
    password = settings.smtp_password

    if bool(username) != bool(password):
        raise RuntimeError(
            "SMTP_USERNAME and SMTP_PASSWORD must be configured together."
        )

    if settings.smtp_use_ssl and settings.smtp_use_tls:
        raise RuntimeError(
            "Use either SMTP implicit SSL or STARTTLS, not both."
        )

    message = EmailMessage()
    message["Subject"] = "Verify your Core Brick architect account"
    message["From"] = sender
    message["To"] = to_email
    message.set_content(
        "Your Core Brick architect sign-up verification code is:\n\n"
        f"{otp}\n\n"
        f"This code expires in {expires_minutes} minutes. "
        "If you did not request this code, you can ignore this email."
    )

    context = ssl.create_default_context()

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            host,
            settings.smtp_port,
            timeout=15,
            context=context,
        ) as server:
            if username and password:
                server.login(username, password)
            server.send_message(message)
    else:
        with smtplib.SMTP(
            host,
            settings.smtp_port,
            timeout=15,
        ) as server:
            server.ehlo()

            if settings.smtp_use_tls:
                server.starttls(context=context)
                server.ehlo()

            if username and password:
                server.login(username, password)

            server.send_message(message)
