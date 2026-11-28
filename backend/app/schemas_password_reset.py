from pydantic import BaseModel, EmailStr, Field


class ArchitectPasswordResetRequest(BaseModel):
    email: EmailStr


class ArchitectPasswordResetVerify(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^[0-9]{6}$")


class ArchitectPasswordResetComplete(BaseModel):
    email: EmailStr
    reset_token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=12, max_length=128)



