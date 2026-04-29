from __future__ import annotations

import logging
import re
import time
from typing import Annotated

import datetime as dt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.schemas.checks import (
    CreateCheckRequest,
    EvaluationJobOut,
    ListJobsResponse,
    ListResultsResponse,
    LookupResponse,
)
from fastcheck_api.app.services.audit_service import AuditService
from fastcheck_api.app.services.check_service import CheckService, InsufficientCreditsError
from fastcheck_api.app.services.legacy_service import legacy_service
from fastcheck_api.app.utils.mongo import jsonable, sanitize_rut


router = APIRouter(prefix="/checks", tags=["checks"])
logger = logging.getLogger("fastcheck.checks")

_MASK_REPLACEMENTS: dict[str, str] = {
    "sheriff": "provider_a",
    "equifax": "provider_b",
    "dequienes": "provider_c",
}
_MASK_PATTERN = re.compile("|".join(re.escape(k) for k in _MASK_REPLACEMENTS), re.IGNORECASE)


def _mask_text(value: str) -> str:
    return _MASK_PATTERN.sub(lambda m: _MASK_REPLACEMENTS[m.group(0).lower()], value)


def _mask_json(value):  # type: ignore[no-untyped-def]
    if isinstance(value, str):
        return _mask_text(value)
    if isinstance(value, list):
        return [_mask_json(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if isinstance(k, str) and k.lower() == "datasourcedesc":
                continue
            masked_key = _mask_text(k) if isinstance(k, str) else k
            out[masked_key] = _mask_json(v)
        return out
    return value


@router.get(
    "",
    response_model=ListJobsResponse,
    summary="List checks",
    description="List evaluation jobs (checks) for the current tenant.",
)
async def list_checks(
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
):
    return await CheckService.list_jobs(db=db, tenant_id=user.tenant, page=page, limit=limit)


@router.post(
    "",
    response_model=EvaluationJobOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a check",
    description="Create a single evaluation job and enqueue processing in RabbitMQ using the existing queue and message format.",
)
async def create_check(
    request: Request,
    payload: CreateCheckRequest,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:create"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    start = time.perf_counter()
    clean_rut = sanitize_rut(payload.supplier.rut)
    try:
        job = await CheckService.create_single_check(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            rut=clean_rut,
            name=payload.supplier.name,
        )
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=clean_rut,
            endpoint="/api/v1/checks",
            response_status=status.HTTP_201_CREATED,
            request_data={"supplier": {"rut": clean_rut, "name": payload.supplier.name}},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=1,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"evaluationType": "single"},
        )
        return job
    except InsufficientCreditsError:
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=clean_rut,
            endpoint="/api/v1/checks",
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            request_data={"supplier": {"rut": clean_rut, "name": payload.supplier.name}},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "insufficient_credits"},
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits",
        )


@router.post(
    "/lookup",
    response_model=LookupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lookup a RUT (sync)",
    description="Create a check, run the legacy lookup immediately, persist the result, and return job+result in a single request.",
)
async def lookup(
    request: Request,
    payload: CreateCheckRequest,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:create"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    start = time.perf_counter()
    clean_rut = sanitize_rut(payload.supplier.rut)
    token = legacy_service.get_user_token(user_id=user.id)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Legacy token missing or expired; login again",
        )

    try:
        job = await CheckService.create_single_check(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            rut=clean_rut,
            name=payload.supplier.name,
            enqueue=False,
        )
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=clean_rut,
            endpoint="/api/v1/checks/lookup",
            response_status=status.HTTP_201_CREATED,
            request_data={"supplier": {"rut": clean_rut, "name": payload.supplier.name}},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=1,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"evaluationType": "single", "mode": "sync"},
        )
    except InsufficientCreditsError:
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=clean_rut,
            endpoint="/api/v1/checks/lookup",
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            request_data={"supplier": {"rut": clean_rut, "name": payload.supplier.name}},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "insufficient_credits", "mode": "sync"},
        )
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient credits")

    job_id = str(job.get("_id") or "")
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid job id")

    now = dt.datetime.now(dt.timezone.utc)

    try:
        result_data = await legacy_service.lookup_rut(rut=clean_rut, token=token)
        ai_summary = result_data.get("aiAnalysis") if isinstance(result_data, dict) else None
        if ai_summary and isinstance(ai_summary, str) and ai_summary.strip():
            try:
                await legacy_service.save_fastcheck_summary(rut=clean_rut, summary=ai_summary, token=token)
            except Exception:
                pass

        insert = await db["evaluationresults"].insert_one(
            {
                "jobId": job_oid,
                "tenantId": user.tenant,
                "rut": clean_rut,
                "name": payload.supplier.name,
                "status": "success",
                "data": result_data,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        await db["evaluationjobs"].update_one(
            {"_id": job_oid, "tenantId": user.tenant},
            {
                "$set": {
                    "completedEvaluations": 1,
                    "failedEvaluations": 0,
                    "status": "completed",
                    "updatedAt": now,
                }
            },
        )

        stored_job = await db["evaluationjobs"].find_one({"_id": job_oid, "tenantId": user.tenant})
        stored_result = await db["evaluationresults"].find_one({"_id": insert.inserted_id})

        response_payload = {
            "job": jsonable(stored_job) if stored_job else job,
            "result": jsonable(stored_result)
            if stored_result
            else jsonable(
                {
                    "jobId": str(job_oid),
                    "tenantId": user.tenant,
                    "rut": clean_rut,
                    "name": payload.supplier.name,
                    "status": "success",
                    "data": result_data,
                    "createdAt": now,
                    "updatedAt": now,
                }
            ),
        }
        return _mask_json(response_payload)
    except Exception as e:
        request_id = getattr(request.state, "request_id", None)
        logger.exception(
            "lookup_failed",
            extra={
                "request_id": request_id,
                "tenant_id": user.tenant,
                "user_id": user.id,
                "rut": clean_rut,
            },
        )

        reason = str(e).replace("\n", " ").strip()
        if not reason:
            reason = e.__class__.__name__
        if len(reason) > 500:
            reason = reason[:500] + "..."

        await db["evaluationresults"].insert_one(
            {
                "jobId": job_oid,
                "tenantId": user.tenant,
                "rut": clean_rut,
                "name": payload.supplier.name,
                "status": "failed",
                "error": reason,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        await db["evaluationjobs"].update_one(
            {"_id": job_oid, "tenantId": user.tenant},
            {
                "$set": {
                    "completedEvaluations": 0,
                    "failedEvaluations": 1,
                    "status": "failed",
                    "updatedAt": now,
                }
            },
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=reason)


@router.get(
    "/{job_id}",
    response_model=EvaluationJobOut,
    summary="Get a check",
    description="Fetch a single evaluation job by id (tenant-scoped).",
)
async def get_check(
    job_id: str,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    job = await CheckService.get_job(db=db, tenant_id=user.tenant, job_id=job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.get(
    "/{job_id}/results",
    response_model=ListResultsResponse,
    summary="List check results",
    description="List evaluation results for a given job id (tenant-scoped).",
)
async def get_check_results(
    job_id: str,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
):
    try:
        payload = await CheckService.list_results(db=db, tenant_id=user.tenant, job_id=job_id, page=page, limit=limit)
        return _mask_json(payload)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
