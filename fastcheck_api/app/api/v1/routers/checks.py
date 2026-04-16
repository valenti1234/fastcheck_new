from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.config import settings
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.schemas.checks import (
    CreateCheckRequest,
    EvaluationJobOut,
    ListJobsResponse,
    ListResultsResponse,
)
from fastcheck_api.app.services.audit_service import AuditService
from fastcheck_api.app.services.check_service import CheckService, InsufficientCreditsError


router = APIRouter(prefix="/checks", tags=["checks"])
API_PREFIX = settings.normalized_api_prefix or "/api/v1"


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
    openapi_extra={
        "x-code-samples": [
            {
                "lang": "curl",
                "label": "cURL",
                "source": f"curl -X POST 'http://127.0.0.1:8181{API_PREFIX}/checks' \\\n  -H 'Authorization: Bearer <jwt>' \\\n  -H 'Content-Type: application/json' \\\n  -d '{{\"supplier\":{{\"rut\":\"12345678-9\",\"name\":\"ACME SpA\"}}}}'",
            },
            {
                "lang": "python",
                "label": "httpx",
                "source": f"import httpx\nresp = httpx.post('http://127.0.0.1:8181{API_PREFIX}/checks',\n    headers={{'Authorization': 'Bearer <jwt>'}},\n    json={{'supplier': {{'rut': '12345678-9', 'name': 'ACME SpA'}}}})\nprint(resp.json())",
            },
            {
                "lang": "js",
                "label": "fetch",
                "source": f"const resp = await fetch('http://127.0.0.1:8181{API_PREFIX}/checks', {{\n  method: 'POST',\n  headers: {{\n    'Authorization': 'Bearer <jwt>',\n    'Content-Type': 'application/json'\n  }},\n  body: JSON.stringify({{ supplier: {{ rut: '12345678-9', name: 'ACME SpA' }} }})\n}});\nconsole.log(await resp.json());",
            },
        ]
    },
)
async def create_check(
    request: Request,
    payload: CreateCheckRequest,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:create"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    start = time.perf_counter()
    try:
        job = await CheckService.create_single_check(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            rut=payload.supplier.rut,
            name=payload.supplier.name,
        )
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=payload.supplier.rut,
            endpoint="/api/v1/checks",
            response_status=status.HTTP_201_CREATED,
            request_data={"supplier": {"rut": payload.supplier.rut, "name": payload.supplier.name}},
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
            rut=payload.supplier.rut,
            endpoint="/api/v1/checks",
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            request_data={"supplier": {"rut": payload.supplier.rut, "name": payload.supplier.name}},
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
    openapi_extra={
        "x-code-samples": [
            {
                "lang": "curl",
                "label": "cURL",
                "source": f"curl 'http://127.0.0.1:8181{API_PREFIX}/checks/<job_id>/results?page=1&limit=10' \\\n  -H 'Authorization: Bearer <jwt>'",
            },
            {
                "lang": "python",
                "label": "httpx",
                "source": f"import httpx\nresp = httpx.get('http://127.0.0.1:8181{API_PREFIX}/checks/<job_id>/results',\n    params={{'page': 1, 'limit': 10}},\n    headers={{'Authorization': 'Bearer <jwt>'}})\nprint(resp.json())",
            },
        ]
    },
)
async def get_check_results(
    job_id: str,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
):
    try:
        return await CheckService.list_results(db=db, tenant_id=user.tenant, job_id=job_id, page=page, limit=limit)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
