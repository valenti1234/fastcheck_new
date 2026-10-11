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
    doc = await db["users"].find_one({"_id": ObjectId(user.id)}, projection={"name": 1, "email": 1, "role": 1, "_id": 1, "legacy_role": 1, "tenant": 1, "organizacion_id": 1, "pais_ids": 1, "unidad_ids": 1, "area_id": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    doc_role = doc.get("role") or doc.get("legacy_role") or user.role
    doc_legacy = doc.get("legacy_role") or user.legacy_role or (doc.get("role") or user.role)
    doc_org = doc.get("organizacion_id") or getattr(user, "organizacion_id", None)
    doc_pais = doc.get("pais_ids") or getattr(user, "pais_ids", None) or []
    doc_unidad = doc.get("unidad_ids") or getattr(user, "unidad_ids", None) or []
    doc_area = doc.get("area_id") or getattr(user, "area_id", None)
    def _oid_s(x):
        return str(x) if x is not None and hasattr(x, "__class__") and x.__class__.__name__ == "ObjectId" else (x if x is None else str(x))
    def _oid_list(lst):
        return [_oid_s(x) for x in (lst or [])]
    return {
        "id": str(doc.get("_id", user.id)),
        "_id": str(doc.get("_id", user.id)),
        "name": doc.get("name") or "",
        "email": doc.get("email") or user.email,
        "role": doc_role,
        "legacy_role": doc_legacy,
        "authz_v2_migrated": bool(getattr(user, "authz_v2_migrated", False)),
        "roles": list(getattr(user, "roles", []) or []),
        "nivel_info": str(getattr(user, "nivel_info", "RESULTADO_GENERAL") or "RESULTADO_GENERAL"),
        "pn_authorized": bool(getattr(user, "pn_authorized", False)),
        "cache_version": int(getattr(user, "cache_version", 1) or 1),
        "sensibles_confirmados": list(getattr(user, "sensibles_confirmados", []) or []),
        "organizacion_id": _oid_s(doc_org),
        "pais_ids": _oid_list(doc_pais),
        "unidad_ids": _oid_list(doc_unidad),
        "area_id": _oid_s(doc_area),
        "tenant": str(doc.get("tenant") or user.tenant) if doc.get("tenant") or getattr(user, "tenant", None) else None,
    }


@router.post(
    "/refresh",
    summary="Refresh token",
    description="Issue a new JWT token using the current token's identity and tenant context.",
)
async def refresh(user: Annotated[CurrentUser, Depends(get_current_user)]):
    token = create_access_token(user_id=user.id, email=user.email, role=user.role, tenant_id=user.tenant)
    return {"token": token}
