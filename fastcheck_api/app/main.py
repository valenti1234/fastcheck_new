from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from fastcheck_api.app.api.v1.routers import auth, checks, reports, usage
from fastcheck_api.app.core.logging import configure_logging
from fastcheck_api.app.core.mongodb import lifespan_db
from fastcheck_api.app.services.legacy_service import legacy_service
from fastcheck_api.app.services.rabbitmq_service import rabbitmq_service
from fastcheck_api.app.middleware.request_logging import RequestLoggingMiddleware
from fastcheck_api.app.middleware.tenant_context import TenantContextMiddleware
from fastcheck_api.app.core.config import settings


logger = logging.getLogger("fastcheck")

tags_metadata = [
    {"name": "auth", "description": "Authentication and session management."},
    {"name": "checks", "description": "Create checks (evaluations) and retrieve job/results."},
    {"name": "reports", "description": "Fetch saved reports from existing persistence."},
    {"name": "usage", "description": "Usage and credit balance information."},
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


app = FastAPI(
    title="FastCheck API",
    version="0.1.0",
    description="FastCheck API for check evaluation and report retrieval.",
    openapi_url="/openapi.json",
    docs_url="/internal/docs",
    redoc_url="/internal/redoc",
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
        "docs": "/docs",
        "swagger_ui": "/internal/docs",
        "redoc": "/internal/redoc",
        "health": "/health",
    }


@app.get(
    "/docs",
    summary="Customer API docs",
    description="Customer-facing API reference with generated code examples. The OpenAPI schema remains the source of truth.",
    include_in_schema=False,
)
async def customer_docs():
    return HTMLResponse(
        """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FastCheck API Docs</title>
    <style>
      html, body { height: 100%; margin: 0; }
    </style>
  </head>
  <body>
    <rapi-doc
      spec-url="openapi.json"
      render-style="read"
      show-header="false"
      allow-try="true"
      allow-authentication="true"
      allow-server-selection="true"
      show-components="true"
      show-info="true"
      show-side-nav="true"
      theme="dark"
      primary-color="#4f46e5"
    ></rapi-doc>
    <script src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
  </body>
</html>
        """.strip()
    )


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
api_v1.include_router(reports.router)
api_v1.include_router(usage.router)
app.include_router(api_v1)
