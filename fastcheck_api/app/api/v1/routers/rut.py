from __future__ import annotations

import datetime as dt
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.audit_service import AuditService
from fastcheck_api.app.services.legacy_service import legacy_service
from fastcheck_api.app.utils.mongo import sanitize_rut, to_object_id


router = APIRouter(prefix="/rut", tags=["rut"])

_bearer = HTTPBearer(auto_error=False)


class RutLookupRequest(BaseModel):
    rut: str = Field(examples=["12345678-9"])
    isMonitoring: bool = Field(default=False, description="Compatibility flag with legacy backend.")


@router.post(
    "/lookup",
    summary="Lookup RUT (single evaluation)",
    description=(
        "Runs a single evaluation for a RUT using the legacy backend and persists the result in MongoDB.\n\n"
        "If a successful result for the same RUT already exists for the tenant, returns it without consuming credits."
    ),
)
async def lookup_rut(
    request: Request,
    payload: RutLookupRequest,
    user: Annotated[CurrentUser, Depends(require_permission("rut:lookup"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
):
    start = time.perf_counter()
    rut = sanitize_rut(payload.rut)

    token = credentials.credentials if credentials else None
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    cached = (
        await db["evaluationresults"]
        .find({"tenantId": user.tenant, "rut": rut, "status": "success"})
        .sort([("createdAt", -1)])
        .limit(1)
        .to_list(length=1)
    )
    if cached and isinstance(cached[0], dict) and isinstance(cached[0].get("data"), dict):
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/api/v1/rut/lookup",
            response_status=status.HTTP_200_OK,
            request_data={"rut": rut, "isMonitoring": payload.isMonitoring},
            response_data={"source": "cache"},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"source": "cache"},
        )
        return {**cached[0]["data"], "isFromCache": True}

    tenant_oid = to_object_id(user.tenant)
    now = dt.datetime.now(dt.timezone.utc)

    tenant_after = await db["tenants"].find_one_and_update(
        {"_id": tenant_oid, "creditBalance.availableCredits": {"$gte": 1}},
        {
            "$inc": {
                "creditBalance.availableCredits": -1,
                "creditBalance.totalCreditsUsed": 1,
            },
            "$set": {
                "creditBalance.lastCreditOperation": now,
                "updatedAt": now,
            },
        },
        return_document=ReturnDocument.AFTER,
    )
    if not tenant_after:
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/api/v1/rut/lookup",
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            request_data={"rut": rut, "isMonitoring": payload.isMonitoring},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "insufficient_credits"},
        )
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient credits")

    new_balance = int((tenant_after.get("creditBalance") or {}).get("availableCredits") or 0)
    await db["creditoperations"].insert_one(
        {
            "tenantId": tenant_oid,
            "userId": to_object_id(user.id),
            "operationType": "evaluation",
            "creditsChanged": -1,
            "balanceAfter": new_balance,
            "description": f"Valutazione singola per {rut}",
            "metadata": {"evaluationType": "single", "supplierRut": rut},
            "createdAt": now,
        }
    )

    job_doc: dict[str, Any] = {
        "tenantId": user.tenant,
        "status": "processing",
        "type": "single",
        "createdBy": user.id,
        "totalEvaluations": 1,
        "completedEvaluations": 0,
        "failedEvaluations": 0,
        "supplierData": {"rut": rut, "name": "N/A"},
        "createdAt": now,
        "updatedAt": now,
    }
    job_insert = await db["evaluationjobs"].insert_one(job_doc)
    job_id = str(job_insert.inserted_id)

    response_status = status.HTTP_200_OK
    error_message: str | None = None
    result_data: dict[str, Any] | None = None
    try:
        result_data = await legacy_service.lookup_rut(
            rut=rut,
            token=token,
            is_monitoring=payload.isMonitoring,
            evaluation_type="individual",
        )
        ai_summary = result_data.get("aiAnalysis")
        if isinstance(ai_summary, str) and ai_summary.strip():
            try:
                await legacy_service.save_fastcheck_summary(rut=rut, summary=ai_summary, token=token)
            except Exception:
                pass

        await db["evaluationresults"].insert_one(
            {
                "jobId": job_insert.inserted_id,
                "tenantId": user.tenant,
                "rut": rut,
                "name": None,
                "status": "success",
                "data": result_data,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        await db["evaluationjobs"].update_one(
            {"_id": job_insert.inserted_id, "tenantId": user.tenant},
            {"$set": {"status": "completed", "completedEvaluations": 1, "updatedAt": now}},
        )
        return {**result_data, "jobId": job_id, "isFromCache": False}
    except HTTPException as e:
        raise e
    except Exception as e:
        response_status = status.HTTP_502_BAD_GATEWAY
        error_message = str(e)
        await db["evaluationresults"].insert_one(
            {
                "jobId": job_insert.inserted_id,
                "tenantId": user.tenant,
                "rut": rut,
                "name": None,
                "status": "failed",
                "error": error_message,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        await db["evaluationjobs"].update_one(
            {"_id": job_insert.inserted_id, "tenantId": user.tenant},
            {"$set": {"status": "completed", "failedEvaluations": 1, "updatedAt": now}},
        )
        raise HTTPException(status_code=response_status, detail="Legacy lookup failed")
    finally:
        processing_ms = int((time.perf_counter() - start) * 1000)
        audit_response: dict[str, Any] | None = None
        if result_data is not None:
            audit_response = {"jobId": job_id}
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/api/v1/rut/lookup",
            response_status=response_status,
            request_data={"rut": rut, "isMonitoring": payload.isMonitoring},
            response_data=audit_response,
            error_message=error_message,
            processing_time_ms=processing_ms,
            credits_used=1,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"evaluationType": "single", "jobId": job_id},
        )
