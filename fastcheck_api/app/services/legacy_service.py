from __future__ import annotations

from typing import Any

import httpx

from fastcheck_api.app.core.config import settings


class LegacyService:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.legacy_base_url,
            timeout=settings.legacy_http_timeout_seconds,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def lookup_rut(self, *, rut: str, token: str) -> dict[str, Any]:
        resp = await self._client.post(
            "rut/lookup",
            headers={"Authorization": f"Bearer {token}"},
            json={"rut": rut, "isMonitoring": False, "type": "masiva"},
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError("Unexpected legacy response")
        return data

    async def save_fastcheck_summary(self, *, rut: str, summary: str, token: str) -> dict[str, Any]:
        resp = await self._client.post(
            f"rut/fast-check-summary/{rut}",
            headers={"Authorization": f"Bearer {token}"},
            json={"summary": summary},
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError("Unexpected legacy response")
        return data


legacy_service = LegacyService()
