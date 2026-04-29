from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.core.security import AuthError, decode_token


_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    role: str
    tenant: str


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    token = credentials.credentials
    try:
        payload = decode_token(token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e

    user_id = str(payload.get("id") or "")
    email = str(payload.get("email") or "")
    role = str(payload.get("role") or "")
    tenant = str(payload.get("tenant") or "")
    if not user_id or not email or not role or not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    try:
        user_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user id")

    user_doc = await db["users"].find_one({"_id": user_oid}, projection={"isActive": 1, "tenant": 1})
    if not user_doc or not user_doc.get("isActive", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Account not activated. Please wait for superadmin approval.", "code": "ACCOUNT_NOT_ACTIVATED"},
        )

    stored_tenant = user_doc.get("tenant")
    stored_tenant_id = str(stored_tenant) if stored_tenant is not None else ""
    if stored_tenant_id and stored_tenant_id != tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    if role != "superuser":
        try:
            tenant_oid = ObjectId(tenant)
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant id")

        tenant_doc = await db["tenants"].find_one({"_id": tenant_oid}, projection={"isActive": 1})
        if not tenant_doc or not tenant_doc.get("isActive", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Tenant not activated. Please wait for superadmin approval.", "code": "TENANT_NOT_ACTIVATED"},
            )

    current = CurrentUser(id=user_id, email=email, role=role, tenant=tenant)
    request.state.current_user = current
    request.state.tenant_id = tenant
    return current


Permission = str


ROLE_PERMISSIONS: dict[str, set[Permission]] = {
    "superuser": {
        "user:create",
        "user:read",
        "user:update",
        "user:delete",
        "evaluation:create",
        "evaluation:read",
        "evaluation:update",
        "evaluation:delete",
        "evaluation:bulk",
        "company:read",
        "company:update",
        "rut:lookup",
        "rut:read",
        "sheriff:logs:read",
        "monitoring:create",
        "monitoring:read",
        "monitoring:update",
        "monitoring:delete",
        "monitoring:execute",
        "tenant:read",
        "tenant:update",
        "tenant:users:manage",
        "admin:dashboard",
        "admin:settings",
        "admin:logs",
        "notification:read",
        "notification:create",
    },
    "tenant_admin": {
        "user:create",
        "user:read",
        "user:update",
        "user:delete",
        "evaluation:create",
        "evaluation:read",
        "evaluation:update",
        "evaluation:delete",
        "evaluation:bulk",
        "company:read",
        "company:update",
        "rut:lookup",
        "rut:read",
        "sheriff:logs:read",
        "monitoring:create",
        "monitoring:read",
        "monitoring:update",
        "monitoring:delete",
        "monitoring:execute",
        "tenant:read",
        "tenant:update",
        "tenant:users:manage",
        "admin:dashboard",
        "notification:read",
        "notification:create",
    },
    "evaluator": {
        "user:read",
        "evaluation:create",
        "evaluation:read",
        "evaluation:update",
        "evaluation:delete",
        "evaluation:bulk",
        "company:read",
        "rut:lookup",
        "rut:read",
        "sheriff:logs:read",
        "monitoring:create",
        "monitoring:read",
        "monitoring:update",
        "monitoring:execute",
        "tenant:read",
        "notification:read",
    },
    "read_only": {
        "user:read",
        "evaluation:read",
        "company:read",
        "rut:read",
        "sheriff:logs:read",
        "monitoring:read",
        "tenant:read",
        "notification:read",
    },
    "write_only": {
        "evaluation:create",
        "evaluation:read",
        "company:read",
        "rut:lookup",
        "monitoring:create",
        "monitoring:execute",
        "notification:create",
        "tenant:read",
        "tenant:update",
    },
}


def require_permission(permission: Permission):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        perms = ROLE_PERMISSIONS.get(user.role, set())
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Forbidden: Insufficient permissions", "required": permission, "userRole": user.role},
            )
        return user

    return _dep
