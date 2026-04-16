from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr = Field(description="User email address.", examples=["user@example.com"])
    password: str = Field(description="User password.", examples=["********"])


class UserOut(BaseModel):
    id: str = Field(description="User id (MongoDB ObjectId as string).", examples=["507f1f77bcf86cd799439011"])
    name: str = Field(description="User display name.", examples=["Jane Doe"])
    email: EmailStr = Field(description="User email address.", examples=["user@example.com"])
    role: str = Field(
        description="User role (source of truth for access control).",
        examples=["tenant_admin"],
    )


class LoginResponse(BaseModel):
    token: str = Field(description="Bearer JWT token.", examples=["<jwt>"])
    user: UserOut
