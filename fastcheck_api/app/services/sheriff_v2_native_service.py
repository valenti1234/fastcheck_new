from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from fastcheck_api.app.core.config import settings


class SheriffV2NativeService:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=60)
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    async def close(self) -> None:
        await self._client.aclose()

    def _base_url(self) -> str:
        base_url = (settings.sheriff_v2_base_url or "").strip()
        if not base_url:
            raise RuntimeError("Missing SHERIFF_V2_BASE_URL")
        return base_url.rstrip("/")

    def _client_identifier(self) -> str:
        return (settings.sheriff_v2_client_identifier or "SheriffSecureClient-v1").strip()

    def _credentials(self) -> tuple[str, str]:
        access_key = (settings.sheriff_v2_access_key or "").strip()
        access_secret = (settings.sheriff_v2_access_secret or "").strip()
        if not access_key or not access_secret:
            raise RuntimeError("Missing shf V2 access credentials")
        return access_key, access_secret

    async def _get_token(self) -> str:
        now = time.time()
        if self._token and now < (self._token_expires_at - 30):
            return self._token

        base_url = self._base_url()
        access_key, access_secret = self._credentials()
        url = f"{base_url}/api/clients/v2/apiCredentials/getToken"
        headers = {
            "Content-Type": "application/json",
            "accept": "application/json",
            "x-client-identifier": self._client_identifier(),
        }
        resp = await self._client.post(url, headers=headers, json={"accessKey": access_key, "accessSecret": access_secret})
        resp.raise_for_status()
        payload = resp.json()
        token: str | None = None
        if isinstance(payload, dict):
            raw = payload.get("data") or payload.get("token") or payload.get("access_token") or payload.get("accessToken")
            if isinstance(raw, str):
                token = raw
            elif isinstance(raw, dict):
                inner = raw.get("token") or raw.get("access_token") or raw.get("accessToken")
                if isinstance(inner, str):
                    token = inner
        token = (token or "").strip()
        if not token:
            raise RuntimeError("shf token response invalid")

        ttl = int(settings.sheriff_v2_token_ttl_seconds or 600)
        self._token = token
        self._token_expires_at = now + ttl
        return token

    async def _request(self, method: str, path: str, *, params: dict[str, Any] | None = None, json: dict[str, Any] | None = None) -> dict[str, Any]:
        base_url = self._base_url()
        url = f"{base_url}{path}"
        token = await self._get_token()
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {token}",
            "x-client-identifier": self._client_identifier(),
        }
        resp = await self._client.request(method, url, headers=headers, params=params, json=json)
        if resp.status_code == 401:
            self._token = None
            token = await self._get_token()
            headers["Authorization"] = f"Bearer {token}"
            resp = await self._client.request(method, url, headers=headers, params=params, json=json)
        if resp.status_code >= 400:
            body = (resp.text or "")[:2000]
            raise RuntimeError(f"shf {resp.status_code} for {method} {path}: {body}")
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError("Unexpected shf response")
        return data

    async def query_rut(self, *, rut: str, is_monitoring: bool = False) -> dict[str, Any]:
        rut = (rut or "").strip()
        if not rut:
            raise ValueError("Missing rut")

        cargar = await self._request(
            "POST",
            "/api/clients/v2/helper/cargarRut",
            json={"rut": rut, "isMonitoring": bool(is_monitoring), "includeEquifax": False},
        )
        await asyncio.sleep(2)

        resumen = await self._request(
            "GET",
            "/api/clients/v2/helper/resumen",
            params={"rut": rut, "complete": "True"},
        )

        result: dict[str, Any] = {"success": True, "cargarRut": cargar, "resumen": resumen}

        ok = True
        if isinstance(cargar, dict) and ("success" in cargar) and (not bool(cargar.get("success"))):
            ok = False
        if isinstance(resumen, dict) and ("success" in resumen) and (not bool(resumen.get("success"))):
            ok = False

        if ok:
            judicial_civil, judicial_cobranza, judicial_laboral, multa_laboral, mora_previsional, compliance, malla_societaria, credit_score = await asyncio.gather(
                self._request("GET", f"/api/clients/v2/helper/judicial/{rut}/civil"),
                self._request("GET", f"/api/clients/v2/helper/judicial/{rut}/cobranza"),
                self._request("GET", f"/api/clients/v2/helper/judicial/{rut}/laboral"),
                self._request("GET", f"/api/clients/v2/helper/cobranzaLaboral/{rut}/multaLaboral"),
                self._request("GET", f"/api/clients/v2/helper/cobranzaLaboral/{rut}/moraPrevisional"),
                self._request("GET", f"/api/clients/v2/helper/compliance/{rut}"),
                self._request("GET", f"/api/clients/v2/helper/legal/{rut}/mallaSocietaria"),
                self._request("GET", f"/api/clients/v2/creditScore/{rut}"),
            )
            result.update(
                {
                    "judicial": {"civil": judicial_civil, "cobranza": judicial_cobranza, "laboral": judicial_laboral},
                    "cobranzaLaboral": {"multaLaboral": multa_laboral, "moraPrevisional": mora_previsional},
                    "compliance": compliance,
                    "legal": {"mallaSocietaria": malla_societaria},
                    "creditScore": credit_score,
                }
            )

        return result


sheriff_v2_native_service = SheriffV2NativeService()
