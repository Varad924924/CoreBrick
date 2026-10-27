from pydantic import BaseModel, EmailStr, Field


class ArchitectSignupOtpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class ArchitectSignupOtpVerify(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^[0-9]{6}$")


class ArchitectSignupComplete(BaseModel):
    email: EmailStr
    signup_token: str = Field(min_length=32, max_length=200)
    full_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=7, max_length=30)
    bio: str | None = Field(default=None, max_length=5000)
