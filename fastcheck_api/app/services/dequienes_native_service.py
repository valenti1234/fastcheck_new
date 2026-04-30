from __future__ import annotations

import re
from typing import Any

import httpx

from fastcheck_api.app.core.config import settings


def _sanitize_rut_for_dequienes(rut: str) -> str:
    rut_no_dots = (rut or "").replace(".", "").strip()
    parts = rut_no_dots.split("-", 1)
    numeric = re.sub(r"\D+", "", parts[0])
    numeric = re.sub(r"^0+", "", numeric) or "0"
    return numeric


class DequienesNativeService:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=settings.dequienes_base_url.rstrip("/"),
                timeout=httpx.Timeout(settings.dequienes_http_timeout_seconds),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"accept": "application/json"}
        api_key = (settings.dequienes_api_key or "").strip()
        if api_key:
            headers["x-api-key"] = api_key
        return headers

    async def relationships(
        self,
        *,
        rut: str,
        distance: int = 2,
        relationship_direction: str = "BOTH",
        one_path_per_node: bool = False,
    ) -> dict[str, Any]:
        rut_sanitized = _sanitize_rut_for_dequienes(rut)
        client = self._get_client()
        resp = await client.get(
            f"/relationships/{rut_sanitized}",
            params={
                "distance": int(distance),
                "relationship_direction": relationship_direction,
                "one_path_per_node": "true" if one_path_per_node else "false",
            },
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {"raw": data}

    async def legal_events(self, *, rut: str) -> dict[str, Any]:
        rut_sanitized = _sanitize_rut_for_dequienes(rut)
        client = self._get_client()
        resp = await client.get(f"/api/legal-events/{rut_sanitized}", headers=self._headers())
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {"raw": data}


dequienes_native_service = DequienesNativeService()

