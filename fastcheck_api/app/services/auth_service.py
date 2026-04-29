from __future__ import annotations

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.core.security import create_access_token, verify_password
from fastcheck_api.app.services.legacy_service import legacy_service


class AuthService:
    @staticmethod
    async def login(*, db: AsyncIOMotorDatabase, email: str, password: str) -> dict:
        user = await db["users"].find_one({"email": email.lower()})
        if not user:
            raise ValueError("Invalid credentials")

        if not user.get("isActive", False):
            raise PermissionError("ACCOUNT_NOT_ACTIVATED")

        stored = user.get("password")
        if not stored:
            raise ValueError("Invalid credentials")

        if not verify_password(password, stored):
            raise ValueError("Invalid credentials")

        tenant_id = user.get("tenant")
        if isinstance(tenant_id, ObjectId):
            tenant_id_str = str(tenant_id)
        else:
            tenant_id_str = str(tenant_id or "")

        token = create_access_token(
            user_id=str(user["_id"]),
            email=str(user.get("email") or ""),
            role=str(user.get("role") or ""),
            tenant_id=tenant_id_str,
        )

        await legacy_service.login_user(user_id=str(user["_id"]), email=email.lower(), password=password)

        return {
            "token": token,
            "user": {
                "id": str(user["_id"]),
                "name": str(user.get("name") or ""),
                "email": str(user.get("email") or ""),
                "role": str(user.get("role") or ""),
            },
        }
