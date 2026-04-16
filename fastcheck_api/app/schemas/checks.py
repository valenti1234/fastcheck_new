from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SupplierInput(BaseModel):
    rut: str = Field(
        description="Chilean RUT in canonical format (recommended: no dots, with dash).",
        examples=["12345678-9"],
    )
    name: str | None = Field(default=None, description="Optional supplier/company name.", examples=["ACME SpA"])


class CreateCheckRequest(BaseModel):
    supplier: SupplierInput = Field(description="Supplier to evaluate.")


class EvaluationJobOut(BaseModel):
    id: str = Field(alias="_id", description="Evaluation job id (MongoDB ObjectId as string).", examples=["507f1f77bcf86cd799439011"])
    tenantId: str = Field(description="Tenant id (string stored in jobs/results collections).")
    status: str = Field(description="Job status.", examples=["processing"])
    type: str = Field(description="Job type.", examples=["single"])
    createdBy: str = Field(description="User id that created the job (string).")
    totalEvaluations: int = Field(description="Total evaluations tracked by this job.", examples=[1])
    completedEvaluations: int = Field(description="Number of successful results.", examples=[0])
    failedEvaluations: int = Field(description="Number of failed results.", examples=[0])
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    supplierData: dict[str, Any] | None = None


class ListJobsResponse(BaseModel):
    jobs: list[EvaluationJobOut]
    total: int = Field(description="Total jobs in this tenant.", examples=[42])
    pages: int = Field(description="Total pages for the current limit.", examples=[5])


class EvaluationResultOut(BaseModel):
    id: str = Field(alias="_id", description="Evaluation result id (MongoDB ObjectId as string).")
    jobId: str = Field(description="Evaluation job id (as string or ObjectId string).")
    tenantId: str = Field(description="Tenant id (string stored in jobs/results collections).")
    rut: str = Field(description="Supplier RUT.", examples=["12345678-9"])
    name: str | None = Field(default=None, description="Optional supplier name.", examples=["ACME SpA"])
    status: str = Field(description="Result status.", examples=["success"])
    error: str | None = Field(default=None, description="Error message if failed.")
    data: dict[str, Any] | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


class ListResultsResponse(BaseModel):
    results: list[EvaluationResultOut]
    total: int = Field(description="Total results in this job.", examples=[1])
    pages: int = Field(description="Total pages for the current limit.", examples=[1])
