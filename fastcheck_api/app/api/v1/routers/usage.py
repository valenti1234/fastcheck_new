from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.schemas.usage import ListCreditOperationsResponse, TenantUsageOut
from fastcheck_api.app.utils.mongo import jsonable


router = APIRouter(prefix="/usage", tags=["usage"])


@router.get(
    "",
    response_model=TenantUsageOut,
    summary="Get tenant usage",
    description="Return tenant credit balance from the existing `tenants.creditBalance` structure.",
)
async def get_usage(
    user: Annotated[CurrentUser, Depends(require_permission("tenant:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    tenant = await db["tenants"].find_one({"_id": ObjectId(user.tenant)}, projection={"creditBalance": 1})
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    credit_balance = tenant.get("creditBalance") or {}
    return {"tenantId": user.tenant, "creditBalance": jsonable(credit_balance)}


@router.get(
    "/operations",
    response_model=ListCreditOperationsResponse,
    summary="List credit operations",
    description="List credit operations for the current tenant from the existing `creditoperations` ledger.",
)
async def list_operations(
    user: Annotated[CurrentUser, Depends(require_permission("tenant:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    skip = (page - 1) * limit
    tenant_oid = ObjectId(user.tenant)
    cursor = (
        db["creditoperations"]
        .find({"tenantId": tenant_oid})
        .sort([("createdAt", -1)])
        .skip(skip)
        .limit(limit)
    )
    operations = [jsonable(doc) async for doc in cursor]
    total = await db["creditoperations"].count_documents({"tenantId": tenant_oid})
    pages = (total + limit - 1) // limit
    return {"operations": operations, "total": total, "pages": pages}
