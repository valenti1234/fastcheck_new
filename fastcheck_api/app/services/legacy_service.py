from __future__ import annotations

import base64
import json
import time
from typing import Any

import httpx

from fastcheck_api.app.core.config import settings


class LegacyService:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.legacy_base_url,
            timeout=settings.legacy_http_timeout_seconds,
        )
        self._user_tokens: dict[str, tuple[str, float | None]] = {}

    async def close(self) -> None:
        await self._client.aclose()

    def _extract_exp(self, token: str) -> float | None:
        try:
            parts = token.split(".")
            if len(parts) < 2:
                return None
            payload_b64 = parts[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload_raw = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
            payload = json.loads(payload_raw.decode("utf-8"))
            exp = payload.get("exp")
            if isinstance(exp, (int, float)):
                return float(exp)
        except Exception:
            return None
        return None

    def set_user_token(self, *, user_id: str, token: str) -> None:
        exp = self._extract_exp(token)
        self._user_tokens[user_id] = (token, exp)

    def get_user_token(self, *, user_id: str) -> str | None:
        entry = self._user_tokens.get(user_id)
        if not entry:
            return None
        token, exp = entry
        if exp is None:
            return token
        if (time.time() + 60) < exp:
            return token
        self._user_tokens.pop(user_id, None)
        return None

    async def login_user(self, *, user_id: str, email: str, password: str) -> str:
        try:
            resp = await self._client.post("auth/login", json={"email": email, "password": password})
            resp.raise_for_status()
            data = resp.json()
            token = data.get("token") if isinstance(data, dict) else None
            if not token or not isinstance(token, str):
                raise RuntimeError("Legacy login did not return a token")
            self.set_user_token(user_id=user_id, token=token)
            return token
        except httpx.HTTPStatusError as e:
            body = (e.response.text or "").replace("\n", " ").strip()
            if len(body) > 500:
                body = body[:500] + "..."
            raise RuntimeError(f"Legacy login failed ({e.response.status_code}): {body or 'no body'}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Legacy login request error: {str(e)}") from e

    async def lookup_rut(self, *, rut: str, token: str) -> dict[str, Any]:
        try:
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
        except httpx.HTTPStatusError as e:
            body = (e.response.text or "").replace("\n", " ").strip()
            if len(body) > 500:
                body = body[:500] + "..."
            raise RuntimeError(f"Legacy lookup failed ({e.response.status_code}): {body or 'no body'}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Legacy lookup request error: {str(e)}") from e

    async def save_fastcheck_summary(self, *, rut: str, summary: str, token: str) -> dict[str, Any]:
        try:
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
        except httpx.HTTPStatusError as e:
            body = (e.response.text or "").replace("\n", " ").strip()
            if len(body) > 500:
                body = body[:500] + "..."
            raise RuntimeError(f"Legacy save summary failed ({e.response.status_code}): {body or 'no body'}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Legacy save summary request error: {str(e)}") from e


legacy_service = LegacyService()
