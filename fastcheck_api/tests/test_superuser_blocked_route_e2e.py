"""BLOQUE 1.2 FASE1 · Tests E2E SuperuserBlockedRoute su /v2/workspace/*.

4 scenari Q7 hard constraint:
  A) SUPER superuser  → GET /v2/workspace/me  → HTTP 403 SUPERUSER_WORKSPACE_BLOCKED
  B) CHC tenant_admin → GET /v2/workspace/me  → HTTP 200 OK (tenant CHC)
  C) AXA evaluator    → GET /v2/workspace/me  → HTTP 200 OK (tenant AXA Virbac)
  D) CCU read_only    → GET /v2/workspace/me  → HTTP 200 OK (tenant CCU UCSC)

Safety lock doppiamente garantito:
  1. SuperuserBlockedRoute.get_route_handler chiama _assert_safe_target_db(db)
  2. Ogni test qua effettua 2 assert runtime su conn usata da fastcheck app
     se la connessione fosse 'duxiter' → fail immediato prima di qualunque chiamata.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient

from fastcheck_api.app.api.dependencies import SUPERUSER_WORKSPACE_BLOCKED_CODE
from fastcheck_api.app.core.config import settings
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.core.security import create_access_token

UID_SUPER_USER = "696eaa2bddea6b91873de160"
EMAIL_SUPER = "superadmin@gmail.com"
TENANT_SUPER = "6ac127b7e2f379cf956f2576"  # FIX 2026-10-05: tenant == users.organizacion_id reale

UID_CHC_ADMIN = "6a710ccc41eb4a347a7b2afa"
EMAIL_CHC = "anibal.fernandez@cmpc.com"
TENANT_CHC = "6ac127c3e2f379cf956f2648"  # FIX 2026-10-05: CMPC org reale

UID_AXA_EVAL = "696f6405174b6c5725971aaf"
EMAIL_AXA = "ghap68@yahoo.com"
TENANT_AXA = "6ac127bae2f379cf956f258b"  # FIX 2026-10-05: Virbac org reale

UID_CCU_READ = "6a2971190e276e4dabaa6b6e"
EMAIL_CCU = "clsalgado@ucsc.cl"
TENANT_CCU = "6ac127c0e2f379cf956f2609"  # FIX 2026-10-05: UCSC Claudio Salgado org reale


def _safety_lock_db_target() -> None:
    """Runtime safety: blocco EXPLICITO. Se settings o DB puntano a DUxITER → fail."""
    loop = asyncio.new_event_loop()
    try:
        db = loop.run_until_complete(_async_safety_db())
    finally:
        loop.close()
    assert db.name != "duxiter", (
        f"SAFETY LOCK BLOQUE1.2: connesso a DB PRODUZIONE {db.name!r}. "
        f"Autorizzato solo duxiter-2."
    )
    assert db.name == "duxiter-2", (
        f"SAFETY LOCK BLOQUE1.2: connesso a {db.name!r} invece di duxiter-2 staging."
    )
    assert settings.authz_forbid_prod_db is True, (
        "SAFETY LOCK BLOQUE1.2: settings.authz_forbid_prod_db deve essere True."
    )


async def _async_safety_db():
    return get_db()


_safety_lock_db_target()


@pytest.fixture(scope="module")
def client() -> TestClient:
    from fastcheck_api.app.main import app

    with TestClient(app, raise_server_exceptions=False) as tc:
        yield tc


def _mk_token(user_id: str, email: str, role: str, tenant: str) -> str:
    return create_access_token(
        user_id=user_id,
        email=email,
        role=role,
        tenant_id=tenant,
    )


def test_A_super_user_workspace_me_blocked_403(client: TestClient) -> None:
    """A) SUPERUSER globale → /v2/workspace/me deve ritornare 403 con code corretto."""
    tok = _mk_token(UID_SUPER_USER, EMAIL_SUPER, "superuser", TENANT_SUPER)
    resp = client.get("/v2/workspace/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 403, (
        f"Bloque1.2 A SUPER: atteso 403 SUPERUSER_WORKSPACE_BLOCKED, "
        f"ricevuto {resp.status_code}. body={resp.text[:300]}"
    )
    body: dict[str, Any] = resp.json()
    detail = body.get("detail", body)
    assert isinstance(detail, dict), f"detail deve essere dict, got {type(detail)}: {detail}"
    assert detail.get("code") == SUPERUSER_WORKSPACE_BLOCKED_CODE, (
        f"Bloque1.2 A: code={detail.get('code')!r}, atteso "
        f"{SUPERUSER_WORKSPACE_BLOCKED_CODE!r}"
    )
    assert detail.get("http_code_num") == 40301


def test_B_chc_tenant_admin_workspace_me_200(client: TestClient) -> None:
    """B) CHC tenant_admin (CMPC) → /v2/workspace/me 200, context coerente."""
    tok = _mk_token(UID_CHC_ADMIN, EMAIL_CHC, "tenant_admin", TENANT_CHC)
    resp = client.get("/v2/workspace/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 200, (
        f"Bloque1.2 B CHC: atteso 200, ricevuto {resp.status_code}. body={resp.text[:300]}"
    )
    body = resp.json()
    assert body.get("tenant_id") == TENANT_CHC
    assert body.get("email") == EMAIL_CHC
    assert isinstance(body.get("unidad_ids", []), list)


def test_C_axa_evaluator_workspace_me_200(client: TestClient) -> None:
    """C) AXA evaluator (Virbac) → /v2/workspace/me 200."""
    tok = _mk_token(UID_AXA_EVAL, EMAIL_AXA, "evaluator", TENANT_AXA)
    resp = client.get("/v2/workspace/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 200, (
        f"Bloque1.2 C AXA: atteso 200, ricevuto {resp.status_code}. body={resp.text[:300]}"
    )
    body = resp.json()
    assert body.get("tenant_id") == TENANT_AXA
    assert body.get("email") == EMAIL_AXA


def test_D_ccu_read_only_workspace_me_200(client: TestClient) -> None:
    """D) CCU read_only (UCSC) → /v2/workspace/me 200."""
    tok = _mk_token(UID_CCU_READ, EMAIL_CCU, "read_only", TENANT_CCU)
    resp = client.get("/v2/workspace/me", headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 200, (
        f"Bloque1.2 D CCU: atteso 200, ricevuto {resp.status_code}. body={resp.text[:300]}"
    )
    body = resp.json()
    assert body.get("tenant_id") == TENANT_CCU
    assert body.get("email") == EMAIL_CCU
