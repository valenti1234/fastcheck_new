from __future__ import annotations

import json
from typing import Any

import aio_pika

from fastcheck_api.app.core.config import settings


class RabbitMQService:
    def __init__(self) -> None:
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.RobustChannel | None = None

    async def connect(self) -> None:
        if not settings.rabbitmq_enabled:
            return
        if self._connection and not self._connection.is_closed:
            return
        self._connection = await aio_pika.connect_robust(settings.rabbitmq_connection_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=1)
        await self._channel.declare_queue(settings.rabbitmq_queue, durable=True)

    async def publish_evaluation(self, data: dict[str, Any]) -> None:
        if not settings.rabbitmq_enabled:
            return
        await self.connect()
        if not self._channel:
            raise RuntimeError("RabbitMQ channel not available")
        exchange = self._channel.default_exchange
        message = aio_pika.Message(
            body=json.dumps(data).encode("utf-8"),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await exchange.publish(message, routing_key=settings.rabbitmq_queue)

    async def close(self) -> None:
        if self._channel and not self._channel.is_closed:
            await self._channel.close()
        if self._connection and not self._connection.is_closed:
            await self._connection.close()


rabbitmq_service = RabbitMQService()
