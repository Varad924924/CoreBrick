
from getpass import getpass

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def main() -> None:
    email = input("Company account email: ").strip().lower()

    if not email or "@" not in email:
        print("Please enter a valid email address.")
        return

    password = getpass("Choose a strong password (minimum 12 characters): ")
    confirmation = getpass("Confirm password: ")

    if len(password) < 12:
        print("Password must contain at least 12 characters.")
        return

    if password != confirmation:
        print("Passwords do not match.")
        return

    db = SessionLocal()

    try:
        existing_user = db.scalar(
            select(User).where(func.lower(User.email) == email)
        )

        if existing_user:
            print(
                f"An account already exists for this email "
                f"with role '{existing_user.role}'. No changes made."
            )
            return

        company_user = User(
            email=email,
            password_hash=hash_password(password),
            role="company",
            is_active=True,
        )

        db.add(company_user)
        db.commit()

        print("Company account created successfully.")
        print(f"Email: {email}")
        print("Role: company")
        print("Password stored as a secure hash.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
