from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

#from fastcheck_api.app.api.v1.routers import auth, checks, reports, rut, usage
from fastcheck_api.app.api.v1.routers import auth, checks, rut, usage, system, admin_compat
from fastcheck_api.app.api.v2.router import router as api_v2_router
from fastcheck_api.app.core.logging import configure_logging
from fastcheck_api.app.core.mongodb import lifespan_db
from fastcheck_api.app.services.legacy_service import legacy_service
from fastcheck_api.app.services.dequienes_native_service import dequienes_native_service
from fastcheck_api.app.services.sheriff_v2_native_service import sheriff_v2_native_service
from fastcheck_api.app.services.rabbitmq_service import rabbitmq_service
from fastcheck_api.app.middleware.request_logging import RequestLoggingMiddleware
from fastcheck_api.app.middleware.tenant_context import TenantContextMiddleware
from fastcheck_api.app.core.config import settings


logger = logging.getLogger("fastcheck")

tags_metadata = [
    {"name": "auth", "description": "Authentication and session management."},
    {"name": "checks", "description": "Create checks (evaluations) and retrieve job/results."},
    {"name": "reports", "description": "Fetch saved reports from existing persistence."},
    {"name": "rut", "description": "Legacy-compatible RUT lookup endpoints."},
    {"name": "usage", "description": "Usage and credit balance information."},
    {"name": "authz-v2", "description": "RBAC+ABAC+Scopes — 7 pasos DOCX §6.3, permisos efectivos, scopes."},
    {"name": "org-v2", "description": "Jerarquía organizacional V2: organizaciones, países, UO, áreas, descendientes."},
    {"name": "users-v2", "description": "Gestión usuarios V2: roles, overrides, grant sensible, alcances."},
    {"name": "third-parties-v2", "description": "Terceros con proyección 5 niveles + gate PN."},
    {"name": "audit-v2", "description": "Log auditoría: búsqueda, stats negazioni per passo 1..7."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    async for _ in lifespan_db():
        if settings.rabbitmq_enabled:
            try:
                await rabbitmq_service.connect()
            except Exception:
                logger.exception("RabbitMQ connection failed; continuing without async processing")
        try:
            yield
        finally:
            try:
                await rabbitmq_service.close()
            except Exception:
                logger.exception("RabbitMQ shutdown failed")
            await legacy_service.close()
            await sheriff_v2_native_service.close()
            await dequienes_native_service.aclose()


app = FastAPI(
    title="FastCheck API",
    version="0.1.0",
    description="FastCheck API for check evaluation and report retrieval.",
    openapi_url="/openapi.json",
    docs_url="/docs",            # ✅ Swagger UI UFFICIALE (default utente)
    redoc_url="/redoc",          # ✅ ReDoc UFFICIALE (alternativa)
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(TenantContextMiddleware)


@app.get(
    "/",
    summary="API entrypoint",
    description="Convenience endpoint with links to the OpenAPI schema and internal Swagger/ReDoc.",
)
async def root():
    return {
        "openapi": "/openapi.json",
        "swagger_ui": "/docs",          # ← Ora è /docs (non più /internal/docs)
        "redoc": "/redoc",              # ← ReDoc ufficiale
        "rapidoc": "/rapidoc",          # ← RapiDoc (alternativa dark con esempi codice)
        "health": "/health",
        "aliases_api_prefix": {
            "openapi": "/api/openapi.json",
            "swagger_ui": "/api/docs",
            "redoc": "/api/redoc",
            "rapidoc": "/api/rapidoc",
        },
    }


@app.get(
    "/internal/docs",
    include_in_schema=False,
)
async def redirect_internal_docs_to_docs():
    """Backward compatibility: before v2-FASE2 /docs was RapiDoc and Swagger UI was hidden here."""
    return RedirectResponse(url="/docs", status_code=307)


@app.get(
    "/internal/redoc",
    include_in_schema=False,
)
async def redirect_internal_redoc_to_redoc():
    return RedirectResponse(url="/redoc", status_code=307)


@app.get(
    "/rapidoc",
    summary="Customer API docs (RapiDoc dark with code samples)",
    description="Alternative 3rd party UI with generated code examples, dark theme and no ads. CDN jsdelivr (fallback reliable).",
    include_in_schema=False,
)
async def rapidoc_view():
    """RapiDoc (precedentemente disponibile su /docs). Ora /docs è il VERO Swagger UI."""
    return HTMLResponse(
        """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FastCheck API · RapiDoc</title>
    <style>
      html, body { height: 100%; margin: 0; }
    </style>
  </head>
  <body>
    <rapi-doc
      spec-url="/openapi.json"
      render-style="read"
      show-header="true"
      allow-try="true"
      allow-authentication="true"
      persist-auth="true"
      allow-server-selection="true"
      show-components="true"
      show-info="true"
      show-side-nav="true"
      theme="dark"
      primary-color="#4f46e5"
    ></rapi-doc>
    <!-- CDN jsdelivr (più affidabile di unpkg) con fallback integrità -->
    <script src="https://cdn.jsdelivr.net/npm/rapidoc@9.3.4/dist/rapidoc-min.js"
            integrity="sha256-BgYHq+gDnqL0Xq+5wA3rYFy9w5P2b3qF0yJg8+I1BVE="
            crossorigin="anonymous"
            referrerpolicy="no-referrer"></script>
  </body>
</html>
        """.strip()
    )


# =====================================================================
# ALIAS docs/openapi su prefisso "/api" (per compatibilità frontend)
# /api/*  →  redirect permanenti verso gli endpoint top-level.
# =====================================================================

@app.get("/api/openapi.json", include_in_schema=False)
async def api_openapi_alias():
    return RedirectResponse(url="/openapi.json", status_code=307)


@app.get("/api/docs", include_in_schema=False)
async def api_docs_alias():
    return RedirectResponse(url="/docs", status_code=307)


@app.get("/api/redoc", include_in_schema=False)
async def api_redoc_alias():
    return RedirectResponse(url="/redoc", status_code=307)


@app.get("/api/rapidoc", include_in_schema=False)
async def api_rapidoc_alias():
    return RedirectResponse(url="/rapidoc", status_code=307)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error", extra={"path": request.url.path})
    return JSONResponse(status_code=500, content={"status": "error", "message": "Something went wrong!"})


api_v1 = APIRouter(prefix=settings.normalized_api_prefix)


@api_v1.get("/health", include_in_schema=False)
async def prefixed_health():
    return {"status": "ok"}


@api_v1.get("/docs", include_in_schema=False)
async def prefixed_customer_docs():
    return await customer_docs()


@api_v1.get("/openapi.json", include_in_schema=False)
async def prefixed_openapi():
    return JSONResponse(app.openapi())


api_v1.include_router(auth.router)
api_v1.include_router(checks.router)
#api_v1.include_router(reports.router)
api_v1.include_router(rut.router)
api_v1.include_router(usage.router)
api_v1.include_router(system.router)
api_v1.include_router(admin_compat.router)
app.include_router(api_v1)
app.include_router(api_v2_router)

# ╔══════════════════════════════════════════════════════════════════╗
# ║  ALIAS COMPATIBILIDAD FRONTEND VITE (/api/*)                    ║
# ║  Frontend axios usa VITE_API_BASE_URL = ".../api" quindi le     ║
# ║  rotte sono chiamate come "/api/auth/login" e "/api/v2/...".    ║
# ║  FastAPI monta originariamente:                                 ║
# ║       v1 -> /client-api-v1/*                                    ║
# ║       v2 -> /v2/*                                               ║
# ║  Per NO TOCAR 47 files frontend aggiungiamo mounts ALIAS        ║
# ║  identici che rispondono anche su prefisso "/api" + "/api/v2".  ║
# ╚══════════════════════════════════════════════════════════════════╝

# --- Alias v1 sobre "/api/*" (equivalente a /client-api-v1/*) -----
_api_v1_frontend_alias = APIRouter(prefix="/api")
# Re-attach los mismos sub-routers (mismo objeto, el overhead es 0)
_api_v1_frontend_alias.include_router(auth.router)
_api_v1_frontend_alias.include_router(checks.router)
_api_v1_frontend_alias.include_router(rut.router)
_api_v1_frontend_alias.include_router(usage.router)
_api_v1_frontend_alias.include_router(system.router)
_api_v1_frontend_alias.include_router(admin_compat.router)


@_api_v1_frontend_alias.get("/health", include_in_schema=False)
async def api_prefix_health():
    return {"status": "ok", "api_prefix": "/api (frontend-alias)"}


app.include_router(_api_v1_frontend_alias)

# --- Alias v2 sobre "/api/v2/*" (equivalente a /v2/*) -------------
#     El router interno ya tiene prefix="/v2"; al montarlo con
#     prefix="/api" el path final es /api + /v2 + <ruta> = /api/v2/*.
app.include_router(api_v2_router, prefix="/api")
