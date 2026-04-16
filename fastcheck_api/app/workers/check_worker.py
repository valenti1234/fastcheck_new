from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from typing import Any

import aio_pika
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from fastcheck_api.app.core.config import settings
from fastcheck_api.app.core.logging import configure_logging
from fastcheck_api.app.core.security import create_access_token
from fastcheck_api.app.services.legacy_service import legacy_service


logger = logging.getLogger("fastcheck.worker")


def _db() -> Any:
    client = AsyncIOMotorClient(settings.mongodb_uri)
    return client, client[settings.mongo_db_name]


async def _update_job_progress(db: Any, job_oid: ObjectId, tenant_id: str) -> None:
    job = await db["evaluationjobs"].find_one({"_id": job_oid, "tenantId": tenant_id})
    if not job:
        return
    total = int(job.get("totalEvaluations") or 0)
    completed = await db["evaluationresults"].count_documents({"jobId": job_oid, "tenantId": tenant_id, "status": "success"})
    failed = await db["evaluationresults"].count_documents({"jobId": job_oid, "tenantId": tenant_id, "status": "failed"})
    status = "processing"
    if total and (completed + failed) >= total:
        status = "completed"
    await db["evaluationjobs"].update_one(
        {"_id": job_oid, "tenantId": tenant_id},
        {
            "$set": {
                "completedEvaluations": completed,
                "failedEvaluations": failed,
                "status": status,
                "updatedAt": dt.datetime.now(dt.timezone.utc),
            }
        },
    )


async def _process_payload(db: Any, payload: dict[str, Any]) -> None:
    rut = str(payload.get("rut") or "")
    name = payload.get("name")
    tenant_id = str(payload.get("tenantId") or "")
    user_id = str(payload.get("userId") or "")
    job_id = str(payload.get("jobId") or "")

    if not rut or not tenant_id or not user_id or not job_id:
        raise ValueError("Invalid message payload")

    job_oid = ObjectId(job_id)
    user_oid = ObjectId(user_id)
    user = await db["users"].find_one({"_id": user_oid}, projection={"email": 1, "role": 1, "tenant": 1})
    if not user:
        raise RuntimeError("User not found")

    token = create_access_token(
        user_id=user_id,
        email=str(user.get("email") or ""),
        role=str(user.get("role") or ""),
        tenant_id=tenant_id,
    )

    now = dt.datetime.now(dt.timezone.utc)

    try:
        result_data = await legacy_service.lookup_rut(rut=rut, token=token)
        ai_summary = result_data.get("aiAnalysis") or None
        if ai_summary and isinstance(ai_summary, str) and ai_summary.strip():
            try:
                await legacy_service.save_fastcheck_summary(rut=rut, summary=ai_summary, token=token)
            except Exception:
                logger.exception("Failed to save fast-check summary via legacy endpoint")

        await db["evaluationresults"].insert_one(
            {
                "jobId": job_oid,
                "tenantId": tenant_id,
                "rut": rut,
                "name": name,
                "status": "success",
                "data": result_data,
                "createdAt": now,
                "updatedAt": now,
            }
        )
    except Exception as e:
        await db["evaluationresults"].insert_one(
            {
                "jobId": job_oid,
                "tenantId": tenant_id,
                "rut": rut,
                "name": name,
                "status": "failed",
                "error": str(e),
                "createdAt": now,
                "updatedAt": now,
            }
        )
    finally:
        await _update_job_progress(db, job_oid, tenant_id)


async def run_worker() -> None:
    configure_logging()
    if not settings.rabbitmq_enabled:
        raise RuntimeError("RabbitMQ disabled")

    client, db = _db()
    connection: aio_pika.RobustConnection | None = None
    try:
        connection = await aio_pika.connect_robust(settings.rabbitmq_connection_url)
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1)
        queue = await channel.declare_queue(settings.rabbitmq_queue, durable=True)

        async with queue.iterator() as iterator:
            async for message in iterator:
                async with message.process(requeue=True):
                    payload = json.loads(message.body.decode("utf-8"))
                    if not isinstance(payload, dict):
                        raise ValueError("Invalid message body")
                    await _process_payload(db, payload)
    finally:
        try:
            await legacy_service.close()
        except Exception:
            pass
        if connection and not connection.is_closed:
            await connection.close()
        client.close()


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
