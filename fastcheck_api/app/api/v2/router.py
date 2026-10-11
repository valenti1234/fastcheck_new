"""API V2 — prefixo común /v2. Monta routers authz|comments|tags|org|users|third-parties|third-parties-export|audit|workspace|gobierno|capacidad pool."""
from __future__ import annotations

from fastapi import APIRouter

from fastcheck_api.app.api.v2 import (
    authz_router,
    comments_router,
    org_router,
    users_router,
    third_parties_router,
    third_party_export_router,
    audit_router,
    workspace_router,
    tags_router,
    gobierno_riesgo_router,
    capacidad_pool_router,
)


router = APIRouter(prefix="/v2")

router.include_router(authz_router)
router.include_router(comments_router)
router.include_router(tags_router)
router.include_router(org_router)
router.include_router(users_router)
router.include_router(third_parties_router)
router.include_router(third_party_export_router)
router.include_router(audit_router)
router.include_router(workspace_router)
router.include_router(gobierno_riesgo_router)
router.include_router(capacidad_pool_router)
