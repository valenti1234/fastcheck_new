from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.core.security import create_access_token
from fastcheck_api.app.schemas.auth import LoginRequest, LoginResponse, UserOut
from fastcheck_api.app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login",
    description="Authenticate with email and password and receive a bearer JWT token compatible with the existing Node.js backend.",
)
async def login(payload: LoginRequest, db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]):
    try:
        res = await AuthService.login(db=db, email=payload.email, password=payload.password)
        return res
    except PermissionError as e:
        if str(e) == "ACCOUNT_NOT_ACTIVATED":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "message": "Tu cuenta está pendiente de activación por parte del superadministrador. Contacta al administrador para completar la activación.",
                    "activationStatus": "pending",
                },
            )
        raise
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user",
    description="Return the authenticated user's profile from the existing `users` collection.",
)
async def me(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    doc = await db["users"].find_one({"_id": ObjectId(user.id)}, projection={"name": 1, "email": 1, "role": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"id": user.id, "name": doc.get("name") or "", "email": doc.get("email") or user.email, "role": doc.get("role") or user.role}


@router.post(
    "/refresh",
    summary="Refresh token",
    description="Issue a new JWT token using the current token's identity and tenant context.",
)
async def refresh(user: Annotated[CurrentUser, Depends(get_current_user)]):
    token = create_access_token(user_id=user.id, email=user.email, role=user.role, tenant_id=user.tenant)
    return {"token": token}
