from fastcheck_api.app.api.v2.routers.authz import router as authz_router
from fastcheck_api.app.api.v2.routers.comments import router as comments_router
from fastcheck_api.app.api.v2.routers.org import router as org_router
from fastcheck_api.app.api.v2.routers.users import router as users_router
from fastcheck_api.app.api.v2.routers.third_parties import router as third_parties_router
from fastcheck_api.app.api.v2.routers.third_party_export import router as third_party_export_router
from fastcheck_api.app.api.v2.routers.audit import router as audit_router
from fastcheck_api.app.api.v2.routers.workspace import router as workspace_router
from fastcheck_api.app.api.v2.routers.tags import router as tags_router
from fastcheck_api.app.api.v2.routers.gobierno_riesgo import router as gobierno_riesgo_router
from fastcheck_api.app.api.v2.routers.capacidad_pool import router as capacidad_pool_router

__all__ = [
    "authz_router",
    "comments_router",
    "org_router",
    "users_router",
    "third_parties_router",
    "third_party_export_router",
    "audit_router",
    "workspace_router",
    "tags_router",
    "gobierno_riesgo_router",
    "capacidad_pool_router",
]
