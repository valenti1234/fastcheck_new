from __future__ import annotations

import datetime as dt
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from fastcheck_api.app.services.rabbitmq_service import rabbitmq_service
from fastcheck_api.app.utils.mongo import jsonable, to_object_id


class InsufficientCreditsError(Exception):
    pass


class CheckService:
    @staticmethod
    async def create_single_check(
        *,
        db: AsyncIOMotorDatabase,
        tenant_id: str,
        user_id: str,
        rut: str,
        name: str | None,
    ) -> dict[str, Any]:
        now = dt.datetime.now(dt.timezone.utc)
        tenant_oid = to_object_id(tenant_id)

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
            raise InsufficientCreditsError("Insufficient credits")

        new_balance = int((tenant_after.get("creditBalance") or {}).get("availableCredits") or 0)

        await db["creditoperations"].insert_one(
            {
                "tenantId": tenant_oid,
                "userId": to_object_id(user_id),
                "operationType": "evaluation",
                "creditsChanged": -1,
                "balanceAfter": new_balance,
                "description": f"Valutazione singola per {rut}",
                "metadata": {"evaluationType": "single", "supplierRut": rut, "supplierName": name},
                "createdAt": now,
            }
        )

        job_doc: dict[str, Any] = {
            "tenantId": tenant_id,
            "status": "processing",
            "type": "single",
            "createdBy": user_id,
            "totalEvaluations": 1,
            "completedEvaluations": 0,
            "failedEvaluations": 0,
            "supplierData": {"rut": rut, "name": name or "N/A"},
            "createdAt": now,
            "updatedAt": now,
        }
        insert = await db["evaluationjobs"].insert_one(job_doc)
        job_id = str(insert.inserted_id)

        await rabbitmq_service.publish_evaluation(
            {"rut": rut, "name": name, "jobId": job_id, "tenantId": tenant_id, "userId": user_id}
        )

        stored = await db["evaluationjobs"].find_one({"_id": insert.inserted_id})
        if not stored:
            raise RuntimeError("Failed to create job")
        return jsonable(stored)

    @staticmethod
    async def list_jobs(*, db: AsyncIOMotorDatabase, tenant_id: str, page: int, limit: int) -> dict[str, Any]:
        skip = (page - 1) * limit
        cursor = (
            db["evaluationjobs"]
            .find({"tenantId": tenant_id})
            .sort([("createdAt", -1)])
            .skip(skip)
            .limit(limit)
        )
        jobs = [jsonable(doc) async for doc in cursor]
        total = await db["evaluationjobs"].count_documents({"tenantId": tenant_id})
        pages = (total + limit - 1) // limit
        return {"jobs": jobs, "total": total, "pages": pages}

    @staticmethod
    async def get_job(*, db: AsyncIOMotorDatabase, tenant_id: str, job_id: str) -> dict[str, Any] | None:
        try:
            oid = ObjectId(job_id)
        except Exception:
            return None
        doc = await db["evaluationjobs"].find_one({"_id": oid, "tenantId": tenant_id})
        return jsonable(doc) if doc else None

    @staticmethod
    async def list_results(
        *, db: AsyncIOMotorDatabase, tenant_id: str, job_id: str, page: int, limit: int
    ) -> dict[str, Any]:
        try:
            oid = ObjectId(job_id)
        except Exception:
            raise ValueError("Invalid job id")

        job = await db["evaluationjobs"].find_one({"_id": oid, "tenantId": tenant_id})
        if not job:
            raise LookupError("Job not found")

        skip = (page - 1) * limit
        cursor = (
            db["evaluationresults"]
            .find({"jobId": oid, "tenantId": tenant_id})
            .sort([("createdAt", -1)])
            .skip(skip)
            .limit(limit)
        )
        results = [jsonable(doc) async for doc in cursor]
        total = await db["evaluationresults"].count_documents({"jobId": oid, "tenantId": tenant_id})
        pages = (total + limit - 1) // limit
        return {"results": results, "total": total, "pages": pages}
