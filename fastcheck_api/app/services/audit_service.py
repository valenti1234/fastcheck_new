from __future__ import annotations

import datetime as dt
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class AuditService:
    @staticmethod
    async def log_consulta(
        *,
        db: AsyncIOMotorDatabase,
        tenant_id: str,
        user_id: str | None,
        consulta_type: str,
        endpoint: str,
        response_status: int,
        rut: str | None = None,
        ruts: list[str] | None = None,
        request_data: dict[str, Any] | None = None,
        response_data: dict[str, Any] | None = None,
        error_message: str | None = None,
        processing_time_ms: int | None = None,
        credits_used: int | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        doc: dict[str, Any] = {
            "tenantId": tenant_id,
            "consultaType": consulta_type,
            "endpoint": endpoint,
            "responseStatus": response_status,
            "createdAt": dt.datetime.now(dt.timezone.utc),
            "updatedAt": dt.datetime.now(dt.timezone.utc),
        }
        if user_id:
            try:
                doc["userId"] = ObjectId(user_id)
            except Exception:
                pass
        if rut:
            doc["rut"] = rut
        if ruts:
            doc["ruts"] = ruts
        if request_data is not None:
            doc["requestData"] = request_data
        if response_data is not None:
            doc["responseData"] = response_data
        if error_message:
            doc["errorMessage"] = error_message
        if processing_time_ms is not None:
            doc["processingTime"] = processing_time_ms
        if credits_used is not None:
            doc["creditsUsed"] = credits_used
        if ip_address:
            doc["ipAddress"] = ip_address
        if user_agent:
            doc["userAgent"] = user_agent
        if metadata is not None:
            doc["metadata"] = metadata
        await db["consulta_history"].insert_one(doc)
