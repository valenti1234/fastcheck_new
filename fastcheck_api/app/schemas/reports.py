from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class FastCheckReportOut(BaseModel):
    id: str = Field(alias="_id", description="Summary id (MongoDB ObjectId as string).")
    rut: str = Field(description="Supplier RUT.", examples=["12345678-9"])
    tenantId: str = Field(description="Tenant id (string stored in summaries).")
    summaryType: str = Field(description="Summary type.", examples=["fast-check"])
    content: str = Field(description="Rendered fast-check summary content (Markdown or plain text).")
    metadata: dict[str, Any] | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
