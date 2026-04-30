from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.schemas.reports import FastCheckReportOut
from fastcheck_api.app.utils.mongo import jsonable, sanitize_rut


router = APIRouter(prefix="/reports", tags=["reports"])

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
    rut = sanitize_rut(rut)
    doc = (
        await db["summaries"]
        .find({"rut": rut, "tenantId": user.tenant, "summaryType": "fast-check"})
        .sort([("createdAt", -1)])
        .limit(1)
        .to_list(length=1)
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return _mask_json(jsonable(doc[0]))
