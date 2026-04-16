from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CreditBalanceOut(BaseModel):
    availableCredits: int = Field(description="Remaining credits for the tenant.", examples=[99])
    totalCreditsUsed: int = Field(description="Total credits used by the tenant.", examples=[1])
    lastCreditOperation: datetime | None = None


class TenantUsageOut(BaseModel):
    tenantId: str = Field(description="Tenant id (MongoDB ObjectId as string).", examples=["507f1f77bcf86cd799439012"])
    creditBalance: CreditBalanceOut


class CreditOperationOut(BaseModel):
    id: str = Field(alias="_id", description="Credit operation id (MongoDB ObjectId as string).")
    tenantId: str = Field(description="Tenant id (MongoDB ObjectId as string).")
    userId: str | None = Field(default=None, description="User id (MongoDB ObjectId as string).")
    operationType: str = Field(description="Operation type.", examples=["evaluation"])
    creditsChanged: int = Field(description="Positive for additions, negative for deductions.", examples=[-1])
    balanceAfter: int = Field(description="Tenant balance after this operation.", examples=[99])
    description: str | None = Field(default=None, description="Human-readable description.")
    metadata: dict[str, Any] | None = None
    createdAt: datetime | None = None


class ListCreditOperationsResponse(BaseModel):
    operations: list[CreditOperationOut]
    total: int = Field(description="Total operations for this tenant.", examples=[123])
    pages: int = Field(description="Total pages for the current limit.", examples=[7])
