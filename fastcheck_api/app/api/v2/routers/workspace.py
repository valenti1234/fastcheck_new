"""Rotte workspace TENANT-SPECIFIC (Q7 FASE1).

Montate con route_class=SuperuserBlockedRoute: il superuser GLOBALE viene
bloccato HTTP 403 SUPERUSER_WORKSPACE_BLOCKED. Solo utenti appartenenti
a uno specifico tenant possono chiamare queste rotte.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from fastcheck_api.app.api.dependencies import (
    CurrentUser,
    SuperuserBlockedRoute,
    get_current_user,
)
from fastcheck_api.app.services.authz_service import EnrichedUser

router = APIRouter(
    prefix="/workspace",
    tags=["workspace-v2"],
    route_class=SuperuserBlockedRoute,
)


@router.get("/health", summary="Healthcheck workspace gateway")
async def workspace_health(request: Request):
    return {
        "status": "ok",
        "gateway": "workspace_tenant_specific",
        "superuser_blocked": True,
        "path": request.url.path,
    }


@router.get("/me", summary="Contexto workspace dell'utente autenticato")
async def workspace_me(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    niveles = []
    if enriched is not None:
        niveles = sorted(enriched.roles)
    return {
        "user_id": user.id,
        "email": user.email,
        "tenant_id": user.tenant,
        "legacy_role": user.legacy_role or user.role,
        "organizacion_id": user.organizacion_id,
        "pais_ids": user.pais_ids,
        "unidad_ids": user.unidad_ids,
        "area_id": user.area_id,
        "roles_v2": niveles,
        "nivel_info": user.nivel_info,
        "authz_v2_migrated": user.authz_v2_migrated,
    }
