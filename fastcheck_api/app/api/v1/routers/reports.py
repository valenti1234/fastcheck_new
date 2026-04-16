from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.schemas.reports import FastCheckReportOut
from fastcheck_api.app.utils.mongo import jsonable


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/fast-check/{rut}",
    response_model=FastCheckReportOut,
    summary="Get FastCheck report",
    description="Fetch the latest saved FastCheck summary for a RUT from the existing `summaries` collection (tenant-scoped).",
)
async def get_fastcheck_report(
    rut: str,
    user: Annotated[CurrentUser, Depends(require_permission("evaluation:read"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    doc = (
        await db["summaries"]
        .find({"rut": rut, "tenantId": user.tenant, "summaryType": "fast-check"})
        .sort([("createdAt", -1)])
        .limit(1)
        .to_list(length=1)
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return jsonable(doc[0])
