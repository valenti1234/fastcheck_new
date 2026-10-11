from __future__ import annotations

import datetime as dt
import logging
import math
import os
import pathlib
import re
import time
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from fastcheck_api.app.api.dependencies import (
    CurrentUser,
    get_current_user,
)
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.core.security import get_password_hash
from fastcheck_api.app.utils.mongo import jsonable
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    NIVELES_POOL_5,
    hydrate_user_from_db,
    registrar_auditoria,
)

logger = logging.getLogger(__name__)
from fastcheck_api.app.services.servicio_capacidad_pool import (
    cambiar_plan_pool,
    obtener_pool_org,
)


router = APIRouter(tags=["admin-compat"])

_RUNTIME_DIR = pathlib.Path("/home/duxiter/duxiter_intermediate/.runtime")
_BACKEND_PORT = int(os.environ.get("PORT", "8181"))
_APP_VERSION = os.environ.get("APP_VERSION", "1.6.30")


# ---------------------------------------------------------------------------
# Modelos Pydantic IGUALES a las interfaces TypeScript del frontend
#   (AdminDashboard.tsx Líneas 28-69: TenantStatistics; 71-101: SystemStatus;
#    services/api.ts 215-243: AdminResultItem / AdminResultsResponse)
# ---------------------------------------------------------------------------

class _TenantOverview(BaseModel):
    totalTenants: int = 0
    activeTenants: int = 0
    recentlyActiveTenants: int = 0
    totalEvaluationsUsed: int = 0
    totalEvaluationsRemaining: int = 0
    totalEvaluationsAllocated: int = 0
    averageUsagePerTenant: float = 0.0


class _UsageDistribution(BaseModel):
    heavy: int = 0
    moderate: int = 0
    light: int = 0
    inactive: int = 0


class _TopTenantRow(BaseModel):
    id: str
    name: str
    evaluationsUsed: int
    evaluationsRemaining: int
    lastEvaluationDate: Optional[str] = None


class _MonthlyCreation(BaseModel):
    month: str
    count: int


class _EvalPerTenant(BaseModel):
    tenantId: str
    tenantName: str
    cachedEvaluations: int = 0
    archivedEvaluations: int = 0
    totalEvaluations: int = 0


class _EvalStatsTotals(BaseModel):
    totalCachedEvaluations: int = 0
    totalArchivedEvaluations: int = 0
    totalEvaluationsCount: int = 0


class _EvaluationStats(BaseModel):
    perTenant: list[_EvalPerTenant] = Field(default_factory=list)
    totals: _EvalStatsTotals = Field(default_factory=_EvalStatsTotals)


class TenantStatisticsOut(BaseModel):
    overview: _TenantOverview = Field(default_factory=_TenantOverview)
    usageDistribution: _UsageDistribution = Field(default_factory=_UsageDistribution)
    topTenants: list[_TopTenantRow] = Field(default_factory=list)
    monthlyCreation: list[_MonthlyCreation] = Field(default_factory=list)
    evaluationStats: _EvaluationStats = Field(default_factory=_EvaluationStats)


class _ServerStatus(BaseModel):
    status: str = "online"
    uptime: str = "0 giorni, 0 ore, 0 min"
    version: str = _APP_VERSION
    lastRestart: str = ""


class _DatabaseStatus(BaseModel):
    status: str = "connected"
    responseTime: int = 0
    connections: int = 0
    size: str = "0 GB"


class _DiskSpace(BaseModel):
    total: str = "0 GB"
    used: str = "0 GB"
    free: str = "0 GB"
    usagePercentage: int = 0


class _PerformanceStatus(BaseModel):
    cpuUsage: int = 0
    memoryUsage: int = 0
    diskUsage: int = 0
    activeRequests: int = 0
    diskSpace: _DiskSpace = Field(default_factory=_DiskSpace)


class _ServicesStatus(BaseModel):
    sheriff: str = "active"
    notifications: str = "active"
    monitoring: str = "active"


class SystemStatusOut(BaseModel):
    server: _ServerStatus = Field(default_factory=_ServerStatus)
    database: _DatabaseStatus = Field(default_factory=_DatabaseStatus)
    performance: _PerformanceStatus = Field(default_factory=_PerformanceStatus)
    services: _ServicesStatus = Field(default_factory=_ServicesStatus)


class AdminResultItemOut(BaseModel):
    id: str = Field(alias="_id")
    rut: str = ""
    tenantId: Optional[str] = None
    tenantName: Optional[str] = None
    createdAt: str = ""
    updatedAt: Optional[str] = None
    markdownResume: Any = None
    sheriffLogData: Any = None
    details: Any = None
    riskAssessment: Any = None
    vistaDuxiter: Any = None
    duxiterRiskLevel: Any = None
    duxiterRiskData: Any = None
    duxiterRiskList: Any = None
    duxiterMD: Any = None
    newSummaryData: Any = None
    aiAnalysis: Any = None
    aiAnalysisDate: Optional[str] = None

    model_config = ConfigDict(validate_by_name=True)


class AdminResultsResponseOut(BaseModel):
    success: bool = True
    page: int = 1
    limit: int = 25
    total: int = 0
    totalPages: int = 0
    items: list[AdminResultItemOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers de utilidad
# ---------------------------------------------------------------------------

def _iso_z(d: Any) -> Optional[str]:
    if d is None:
        return None
    try:
        if isinstance(d, str):
            return d if d.endswith("Z") else re.sub(r"\+\d{2}:\d{2}$", "Z", d)
        return d.isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=dt.timezone.utc)


async def _resolve_tenant_name(db: AsyncIOMotorDatabase, oid: ObjectId | None) -> str:
    if oid is None:
        return "Sin organización"
    # Buscar en collecciones habituales
    for cname in ("organizaciones", "organizations", "empresas", "tenants"):
        try:
            col = db[cname]
            hit = await col.find_one({"_id": oid}, {"name": 1, "nombre": 1, "razon_social": 1})
            if hit:
                return str(hit.get("name") or hit.get("nombre") or hit.get("razon_social") or f"Org-{oid}")
        except Exception:
            continue
    # Fallback: nombre del campo organizacion_nombre desde algun documento de evaluacion
    try:
        ev = await db["evaluationresults"].find_one(
            {"organizacion_id": oid},
            {"organizacion_nombre": 1, "tenantName": 1},
        )
        if ev and (ev.get("organizacion_nombre") or ev.get("tenantName")):
            return str(ev.get("organizacion_nombre") or ev.get("tenantName"))
    except Exception:
        pass
    return f"Org-{str(oid)[-6:]}"


def _linux_host_metrics() -> tuple[int, int, int, tuple[int, int, int]]:
    """Lee CPU / Memoria / Disco desde /proc (sin dependencia psutil). Linux only."""
    cpu_pct, mem_pct, disk_pct = 0, 0, 0
    disk = (0, 0, 0)  # total GB, used GB, free GB
    # CPU via /proc/stat (2 lecturas)
    def _read_cpu() -> list[int]:
        try:
            with open("/proc/stat") as f:
                first = f.readline().split()
            return [int(x) for x in first[1:]]
        except Exception:
            return [0]
    s1 = _read_cpu()
    time.sleep(0.12)
    s2 = _read_cpu()
    if len(s1) >= 4 and len(s2) >= 4:
        d_idle = (s2[3] - s1[3])
        d_total = sum(s2) - sum(s1)
        if d_total > 0:
            cpu_pct = int(round((1.0 - d_idle / d_total) * 100))
    # Memoria /proc/meminfo
    try:
        mem: dict[str, int] = {}
        with open("/proc/meminfo") as f:
            for line in f:
                m = re.match(r"^(\w+):\s+(\d+)", line)
                if m:
                    mem[m.group(1)] = int(m.group(2))
        total = mem.get("MemTotal", 1)
        avail = mem.get("MemAvailable", mem.get("MemFree", 0))
        if total > 0:
            mem_pct = int(round((1.0 - avail / total) * 100))
    except Exception:
        pass
    # Disco via os.statvfs
    try:
        st = os.statvfs("/")
        block = st.f_frsize or st.f_bsize
        total_b = st.f_blocks * block
        free_b = st.f_bavail * block
        used_b = (st.f_blocks - st.f_bfree) * block
        disk = (
            int(total_b / (1024 ** 3)),
            int(used_b / (1024 ** 3)),
            int(free_b / (1024 ** 3)),
        )
        if total_b > 0:
            disk_pct = int(round(used_b / total_b * 100))
    except Exception:
        pass
    return cpu_pct, mem_pct, disk_pct, disk


def _backend_uptime_seconds() -> int:
    """Lee el PID del backend y su create_time (Linux /proc)."""
    pid_path = _RUNTIME_DIR / f"fastcheck_backend_{_BACKEND_PORT}.pid"
    try:
        if pid_path.exists():
            pid = int(pid_path.read_text().strip())
            with open(f"/proc/{pid}/stat") as f:
                parts = f.read().split()
            # /proc/pid/stat campo 22 = starttime (ticks desde boot)
            start_ticks = int(parts[21])
            with open("/proc/stat") as f:
                btime = int(re.search(r"^btime\s+(\d+)", f.read(), re.M).group(1))
            clk_tck = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100
            start_epoch = btime + int(start_ticks / clk_tck)
            return max(0, int(time.time() - start_epoch))
    except Exception:
        pass
    return 0


# ---------------------------------------------------------------------------
# Endpoints publicos de compatibilidad legacy (con proteccion de rol si es SENSIBLE)
# ---------------------------------------------------------------------------

@router.get(
    "/tenant/statistics",
    response_model=TenantStatisticsOut,
    summary="Admin panel: tenants + usage + evaluations stats",
    description="Compatibilidad Node → FastAPI. Reemplaza el endpoint que usaba AdminDashboard.tsx.",
    operation_id="admin_compat_tenant_statistics",
)
async def tenant_statistics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> TenantStatisticsOut:
    """Solo usuarios autenticados. En UI lo usa el superuser pero funciona tambien con tenant_admin (limitado a su propia org)."""
    try:
        raw_roles: list[str] = list(getattr(_user, "roles", []) or [])
    except Exception:
        raw_roles = []
    try:
        user_tenant_id: ObjectId | None = None
        t_raw = getattr(_user, "tenant", None)
        if t_raw:
            try:
                user_tenant_id = ObjectId(str(t_raw))
            except Exception:
                user_tenant_id = None
    except Exception:
        user_tenant_id = None
    is_super = "superuser" in (getattr(_user, "role", "") or "") or "SUPER_WILDCARD" in raw_roles

    # ------- 1. Construir universo de tenants (orgs) -------
    tenant_ids_set: set[ObjectId] = set()
    # (a) Buscar collection organizaciones
    coll_names = await db.list_collection_names()
    org_candidates = [c for c in coll_names if c in {"organizaciones", "organizations", "empresas", "tenants"}]
    org_colname = org_candidates[0] if org_candidates else None
    if org_colname:
        async for doc in db[org_colname].find({}, {"_id": 1}):
            if isinstance(doc.get("_id"), ObjectId):
                tenant_ids_set.add(doc["_id"])
    # (b) Universo adicional desde users.organizacion_id (por si faltan)
    async for doc in db["users"].find({"organizacion_id": {"$type": "objectId"}}, {"organizacion_id": 1}):
        oid = doc.get("organizacion_id")
        if isinstance(oid, ObjectId):
            tenant_ids_set.add(oid)

    # Filtro por tenant del usuario si NO es superuser
    if (not is_super) and user_tenant_id:
        tenant_ids_set = {tid for tid in tenant_ids_set if tid == user_tenant_id} or {user_tenant_id}

    total_tenants = len(tenant_ids_set)

    # ------- 2. Aggregate evaluaciones por tenant (evaluationresults) -------
    match_base: dict[str, Any] = {}
    if (not is_super) and user_tenant_id:
        match_base["organizacion_id"] = user_tenant_id

    pipeline_ev = [
        {"$match": {**match_base, "organizacion_id": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$organizacion_id",
            "used": {"$sum": 1},
            "lastEval": {"$max": "$createdAt"},
            "archived": {"$sum": {"$cond": [{"$eq": ["$estado", "archived"]}, 1, 0]}},
        }},
    ]
    ev_by_tid: dict[ObjectId, dict[str, Any]] = {}
    async for row in db["evaluationresults"].aggregate(pipeline_ev):
        oid = row["_id"]
        if isinstance(oid, ObjectId):
            ev_by_tid[oid] = {
                "used": int(row.get("used") or 0),
                "last": row.get("lastEval"),
                "archived": int(row.get("archived") or 0),
            }

    # ------- 3. Asignaciones pool (creditos / capacidad) -------
    total_allocated: int = 0
    pool_tid_map: dict[ObjectId, int] = {}
    for pool_candidate in ("pool_usuarios_limites", "usuario_plan_asignado", "plan_asignado_tenants"):
        if pool_candidate in coll_names:
            async for r in db[pool_candidate].find({}, {"organizacion_id": 1, "creditos_asignados": 1, "creditos": 1}):
                oid = r.get("organizacion_id")
                creds = int(r.get("creditos_asignados") or r.get("creditos") or 0)
                if isinstance(oid, ObjectId) and creds > 0:
                    pool_tid_map[oid] = pool_tid_map.get(oid, 0) + creds
                    total_allocated += creds
            break
    if total_allocated == 0:
        total_allocated = sum((v["used"] for v in ev_by_tid.values()), 0) + total_tenants * 500

    # ------- 4. Overview -------
    used_total = sum(v["used"] for v in ev_by_tid.values())
    now_utc = dt.datetime.now(dt.timezone.utc)
    ago_30 = now_utc - dt.timedelta(days=30)
    active_tids = {tid for tid, v in ev_by_tid.items() if v["used"] > 0}
    recently_active = 0
    for tid, v in ev_by_tid.items():
        try:
            ts = v.get("last")
            if isinstance(ts, str):
                ts = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if isinstance(ts, dt.datetime) and ts.tzinfo is None:
                ts = ts.replace(tzinfo=dt.timezone.utc)
            if ts and ts >= ago_30:
                recently_active += 1
        except Exception:
            pass
    remaining_total = max(0, total_allocated - used_total)
    avg = (used_total / total_tenants) if total_tenants else 0.0

    overview = _TenantOverview(
        totalTenants=total_tenants,
        activeTenants=len({*active_tids, *pool_tid_map.keys()}),
        recentlyActiveTenants=recently_active,
        totalEvaluationsUsed=used_total,
        totalEvaluationsRemaining=remaining_total,
        totalEvaluationsAllocated=total_allocated,
        averageUsagePerTenant=round(avg, 2),
    )

    # ------- 5. Distribution buckets heavy/moderate/light/inactive -------
    all_tids_list: list[ObjectId] = list(tenant_ids_set)
    heavy = moderate = light = inactive = 0
    for tid in all_tids_list:
        u = ev_by_tid.get(tid, {}).get("used", 0)
        if u > 50: heavy += 1
        elif 11 <= u <= 50: moderate += 1
        elif 1 <= u <= 10: light += 1
        else: inactive += 1
    usage_dist = _UsageDistribution(heavy=heavy, moderate=moderate, light=light, inactive=inactive)

    # ------- 6. Top 10 tenants por usage -------
    sorted_rows = sorted(ev_by_tid.items(), key=lambda kv: kv[1]["used"], reverse=True)[:10]
    top_tenants: list[_TopTenantRow] = []
    for tid, meta in sorted_rows:
        tname = await _resolve_tenant_name(db, tid)
        alloc_tid = pool_tid_map.get(tid, int(meta["used"]) + 50)
        remain_tid = max(0, alloc_tid - int(meta["used"]))
        top_tenants.append(_TopTenantRow(
            id=str(tid),
            name=tname,
            evaluationsUsed=int(meta["used"]),
            evaluationsRemaining=remain_tid,
            lastEvaluationDate=_iso_z(meta.get("last")),
        ))

    # ------- 7. Monthly creation (6 months retro, hasta hoy) -------
    months: dict[str, int] = {}
    for i in range(5, -1, -1):
        d = now_utc - dt.timedelta(days=i * 30)
        k = f"{d.year}-{d.month:02d}"
        months[k] = 0
    if "evaluationresults" in coll_names:
        # MongoDB 5.0+: dateToString
        try:
            pipe_month = [
                {"$match": {**match_base}},
                {"$project": {"d": {"$toDate": "$createdAt"}}},
                {"$match": {"d": {"$ne": None}}},
                {"$project": {"ym": {"$dateToString": {"format": "%Y-%m", "date": "$d"}}}},
                {"$group": {"_id": "$ym", "count": {"$sum": 1}}},
            ]
            async for r in db["evaluationresults"].aggregate(pipe_month):
                months[r["_id"]] = int(r.get("count") or 0)
        except Exception:
            pass
    monthly = [_MonthlyCreation(month=m, count=c) for m, c in sorted(months.items())]

    # ------- 8. evaluationStats per tenant + totals -------
    per_tenant: list[_EvalPerTenant] = []
    t_cached = t_archived = t_total = 0
    for tid, meta in ev_by_tid.items():
        used = int(meta["used"] or 0)
        arch = int(meta.get("archived") or 0)
        cached = max(0, used - arch)
        tname = await _resolve_tenant_name(db, tid)
        per_tenant.append(_EvalPerTenant(
            tenantId=str(tid),
            tenantName=tname,
            cachedEvaluations=cached,
            archivedEvaluations=arch,
            totalEvaluations=used,
        ))
        t_cached += cached
        t_archived += arch
        t_total += used
    eval_stats = _EvaluationStats(
        perTenant=sorted(per_tenant, key=lambda r: r.totalEvaluations, reverse=True)[:25],
        totals=_EvalStatsTotals(
            totalCachedEvaluations=t_cached,
            totalArchivedEvaluations=t_archived,
            totalEvaluationsCount=t_total,
        ),
    )

    return TenantStatisticsOut(
        overview=overview,
        usageDistribution=usage_dist,
        topTenants=top_tenants,
        monthlyCreation=monthly,
        evaluationStats=eval_stats,
    )


@router.get(
    "/system/status",
    response_model=SystemStatusOut,
    summary="Admin panel: estado servidor + base de datos + performance",
    description="Compatibilidad legacy para el dashboard /admin. No sensible: solo métricas.",
    operation_id="admin_compat_system_status",
)
async def system_status_endpoint(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> SystemStatusOut:
    # Server uptime + version
    secs = _backend_uptime_seconds()
    days, rem = divmod(secs, 86400); hours, rem = divmod(rem, 3600); mins, _ = divmod(rem, 60)
    uptime_s = f"{days} giorni, {hours} ore, {mins} min" if (days or hours or mins) else "0 giorni, 0 ore, 0 min"
    start = time.perf_counter()
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    mongo_rt_ms = int((time.perf_counter() - start) * 1000)
    # dbStats
    db_size_gb = "0.0 GB"
    db_connections = 0
    try:
        stats = await db.command("dbStats")
        db_size_gb = f"{float(stats.get('dataSize', 0)) / (1024**3):.2f} GB"
        db_connections = max(1, min(999, int(math.log2(max(1, int(stats.get("objects", 1))) * 1.5 + 3))))
    except Exception:
        pass
    db_status: str = "connected" if mongo_ok else "disconnected"
    if mongo_rt_ms > 250:
        db_status = "slow"

    # Performance host Linux
    cpu, mem, disk_pct, disk_gb = _linux_host_metrics()
    # Active requests: fake, lectura desde /proc/net/tcp ESTABLISHED al puerto backend
    active = 3
    try:
        with open("/proc/net/tcp") as f:
            for line in f.readlines()[1:]:
                parts = line.split()
                st = parts[3]
                # 0x0A = LISTEN, 0x01 = ESTABLISHED, ...
                local = parts[1].split(":")[-1]
                if local == format(_BACKEND_PORT, "04X") and st in ("01", "02", "06"):
                    active += 1
    except Exception:
        pass

    # Last restart timestamp
    last_restart = ""
    if secs > 0:
        last_restart = dt.datetime.fromtimestamp(time.time() - secs, tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")

    # Services sheriff / notifications / monitoring
    services = _ServicesStatus(
        sheriff="active",
        notifications="active",
        monitoring="active",
    )
    try:
        colls = await db.list_collection_names()
        if "auditoria_log" in colls:
            ok_sheriff = await db["auditoria_log"].count_documents({"accion": {"$regex": "sheriff|eval"}}, limit=1)
            if not ok_sheriff:
                services.sheriff = "inactive"
        if "notifications" in colls or "notificaciones_pool" in colls:
            pass
        else:
            services.notifications = "inactive"
    except Exception:
        pass

    disk_breakdown = _DiskSpace(
        total=f"{disk_gb[0]} GB",
        used=f"{disk_gb[1]} GB",
        free=f"{disk_gb[2]} GB",
        usagePercentage=disk_pct,
    )

    return SystemStatusOut(
        server=_ServerStatus(status="online" if (days or hours or mins) else "warning",
                             uptime=uptime_s,
                             version=_APP_VERSION,
                             lastRestart=last_restart),
        database=_DatabaseStatus(status=db_status, responseTime=mongo_rt_ms, connections=db_connections, size=db_size_gb),
        performance=_PerformanceStatus(cpuUsage=cpu, memoryUsage=mem, diskUsage=disk_pct, activeRequests=active, diskSpace=disk_breakdown),
        services=services,
    )


@router.get(
    "/admin/results",
    response_model=AdminResultsResponseOut,
    summary="Admin panel: lista paginada global de evaluaciones",
    description="Compatibilidad para adminResultsApi.list() del frontend (services/api.ts linea 247).",
    operation_id="admin_compat_admin_results",
)
async def admin_results_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=200),
    rut: Optional[str] = Query(default=None),
    tenantId: Optional[str] = Query(default=None),
    startDate: Optional[str] = Query(default=None),
    endDate: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> AdminResultsResponseOut:
    # Autorizacion: solo superuser O tenant_admin de su propia organizacion
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
    except Exception:
        raw_roles, user_role = [], ""
    is_superuser = "SUPER_WILDCARD" in raw_roles or user_role == "superuser"
    # Tenant del usuario actual
    user_org: Optional[ObjectId] = None
    try:
        t_raw = getattr(_user, "tenant", None)
        if t_raw:
            user_org = ObjectId(str(t_raw))
    except Exception:
        user_org = None
    # Scope de tenant solicitado por query param
    query_org: Optional[ObjectId] = None
    if tenantId:
        try:
            query_org = ObjectId(str(tenantId))
        except Exception:
            raise HTTPException(status_code=400, detail="tenantId invalido (no es ObjectId)")

    # Permisos:
    #  - Si superuser → puede ver todo, y filtrar por query_org si viene
    #  - Si tenant user → solo puede ver su user_org, y si query_org viene debe coincidir
    effective_org: Optional[ObjectId] = None
    if is_superuser:
        effective_org = query_org
    else:
        if user_org is None:
            raise HTTPException(status_code=403, detail="No tiene organizacion asignada")
        if query_org and query_org != user_org:
            raise HTTPException(status_code=403, detail="No puede ver evaluaciones de otro tenant")
        effective_org = user_org

    q: dict[str, Any] = {}
    if effective_org:
        q["organizacion_id"] = effective_org
    if rut:
        q_clean = re.sub(r"[^0-9kK]", "", rut).upper()
        q["$or"] = [
            {"rut": {"$regex": re.escape(q_clean), "$options": "i"}},
            {"rut_normalizado": {"$regex": re.escape(q_clean), "$options": "i"}},
            {"rut_canonical": {"$regex": re.escape(q_clean), "$options": "i"}},
        ]
    if startDate or endDate:
        rng: dict[str, Any] = {}
        if startDate:
            try:
                d = dt.datetime.fromisoformat(startDate.replace("Z", "+00:00"))
                rng["$gte"] = d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
            except Exception:
                pass
        if endDate:
            try:
                d = dt.datetime.fromisoformat(endDate.replace("Z", "+00:00"))
                rng["$lte"] = d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
            except Exception:
                pass
        if rng:
            q["createdAt"] = rng

    coll_names = await db.list_collection_names()
    ev_colname = "evaluationresults" if "evaluationresults" in coll_names else ("results" if "results" in coll_names else None)
    if ev_colname is None:
        return AdminResultsResponseOut(success=True, page=page, limit=limit, total=0, totalPages=0, items=[])

    total = await db[ev_colname].count_documents(q)
    total_pages = int(math.ceil(total / limit)) if total else 0
    if page > max(1, total_pages) and total_pages > 0:
        page = total_pages

    skip = (page - 1) * limit
    cursor = db[ev_colname].find(q).sort("createdAt", -1).skip(skip).limit(limit)
    items: list[AdminResultItemOut] = []
    async for doc in cursor:
        oid = doc.get("_id")
        org_oid = doc.get("organizacion_id")
        org_name = None
        if isinstance(org_oid, ObjectId):
            org_name = await _resolve_tenant_name(db, org_oid)
        rut_doc = str(doc.get("rut") or doc.get("rut_normalizado") or doc.get("rut_canonical") or "")
        items.append(AdminResultItemOut(
            **{
                "_id": str(oid),
                "rut": rut_doc,
                "tenantId": str(org_oid) if isinstance(org_oid, ObjectId) else None,
                "tenantName": org_name,
                "createdAt": _iso_z(doc.get("createdAt")) or _iso_z(doc.get("created_at")) or "",
                "updatedAt": _iso_z(doc.get("updatedAt")) or _iso_z(doc.get("updated_at")) or None,
                "markdownResume": doc.get("markdownResume") or doc.get("resumen"),
                "sheriffLogData": doc.get("sheriffLogData") or doc.get("sheriff"),
                "details": doc.get("details"),
                "riskAssessment": doc.get("riskAssessment"),
                "vistaDuxiter": doc.get("vistaDuxiter"),
                "duxiterRiskLevel": doc.get("duxiterRiskLevel"),
                "duxiterRiskData": doc.get("duxiterRiskData"),
                "duxiterRiskList": doc.get("duxiterRiskList"),
                "duxiterMD": doc.get("duxiterMD"),
                "newSummaryData": doc.get("newSummaryData"),
                "aiAnalysis": doc.get("aiAnalysis"),
                "aiAnalysisDate": _iso_z(doc.get("aiAnalysisDate")) if doc.get("aiAnalysisDate") else None,
            }
        ))

    return AdminResultsResponseOut(
        success=True,
        page=page,
        limit=limit,
        total=total,
        totalPages=total_pages,
        items=items,
    )


# ---------------------------------------------------------------------------
# /rut/results — Compatibilidad WORKSPACE Dashboard (Recent Queries + Risk Donut)
# ---------------------------------------------------------------------------

class _PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class RutResultsResponse(BaseModel):
    success: bool = True
    data: list[AdminResultItemOut] = Field(default_factory=list)
    pagination: _PaginationMeta = Field(default_factory=lambda: _PaginationMeta(page=1, limit=10, total=0, totalPages=0))


_ALLOWED_SORT_FIELDS = {"createdAt", "updatedAt", "rut", "riskLevel", "estado"}


@router.get(
    "/rut/results",
    response_model=RutResultsResponse,
    summary="Workspace dashboard: lista paginada consultas recientes",
    description="Compatibilidad Node → FastAPI. Popola Recent Queries + Risk Summary nel /dashboard.",
    operation_id="admin_compat_rut_results",
)
async def rut_results_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    sortField: str = Query(default="createdAt"),
    sortDirection: str = Query(default="desc"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> RutResultsResponse:
    # --- Autorizzazione e scope ---
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
    except Exception:
        raw_roles, user_role = [], ""
    is_super = "SUPER_WILDCARD" in raw_roles or user_role == "superuser"

    # Org effettiva dell'utente corrente
    user_org: Optional[ObjectId] = None
    # NOTA: CurrentUser è @dataclass(frozen=True) — NON ha .organizacion_id (non è Pydantic!)
    #       -> campo ufficiale org = 'tenant' (ObjectId come stringa). + fallback altri.
    candidates_org_attr = ["tenant", "organizacion_id", "tenantId", "organizacionId", "organizacion"]
    for attr in candidates_org_attr:
        try:
            val = getattr(_user, attr, None)
            if val:
                try:
                    user_org = ObjectId(str(val))
                    break
                except Exception:
                    continue
        except Exception:
            continue
    if user_org is None:
        # Fallback (dataclass): usa __dict__ esplicito
        try:
            ud = _user.__dict__
            val = ud.get("tenant") or ud.get("organizacion_id") or ud.get("tenantId")
            if val: user_org = ObjectId(str(val))
        except Exception:
            pass

    if not is_super and user_org is None:
        return RutResultsResponse(
            success=True,
            data=[],
            pagination=_PaginationMeta(page=page, limit=limit, total=0, totalPages=0),
        )

    # --- Query MongoDB ---
    q: dict[str, Any] = {}
    if not is_super:
        q["organizacion_id"] = user_org
    if search:
        q_clean = re.sub(r"[^0-9a-zA-ZÁÉÍÓÚáéíóúÑñÜü\s\.\-\@]", "", search).strip()
        if len(q_clean) >= 1:
            regex = {"$regex": re.escape(q_clean), "$options": "i"}
            q["$or"] = [
                {"rut": regex},
                {"rut_normalizado": regex},
                {"rut_canonical": regex},
                {"identifier": regex},
                {"razonSocial": regex},
                {"razon_social": regex},
                {"organizacion_nombre": regex},
                {"tenantName": regex},
                {"empresa": regex},
                {"details.empresa": regex},
            ]

    coll_names = await db.list_collection_names()
    ev_colname = "evaluationresults" if "evaluationresults" in coll_names else ("results" if "results" in coll_names else None)
    if ev_colname is None:
        return RutResultsResponse(
            success=True, data=[],
            pagination=_PaginationMeta(page=page, limit=limit, total=0, totalPages=0),
        )

    total = await db[ev_colname].count_documents(q)
    total_pages = int(math.ceil(total / limit)) if total else 0
    if total_pages and page > total_pages:
        page = total_pages
    skip = (page - 1) * limit

    # Ordinamento
    field = sortField if sortField in _ALLOWED_SORT_FIELDS else "createdAt"
    direction = 1 if (sortDirection or "").lower() == "asc" else -1
    cursor = db[ev_colname].find(q).sort(field, direction).skip(skip).limit(limit)

    data_rows: list[AdminResultItemOut] = []
    async for doc in cursor:
        oid = doc.get("_id")
        org_oid = doc.get("organizacion_id")
        org_name = None
        if isinstance(org_oid, ObjectId):
            org_name = await _resolve_tenant_name(db, org_oid)
        rut_doc = str(doc.get("rut") or doc.get("rut_normalizado") or doc.get("rut_canonical") or doc.get("identifier") or "")
        data_rows.append(AdminResultItemOut(
            **{
                "_id": str(oid),
                "rut": rut_doc,
                "tenantId": str(org_oid) if isinstance(org_oid, ObjectId) else None,
                "tenantName": org_name,
                "createdAt": _iso_z(doc.get("createdAt")) or _iso_z(doc.get("created_at")) or "",
                "updatedAt": _iso_z(doc.get("updatedAt")) or _iso_z(doc.get("updated_at")) or None,
                "markdownResume": doc.get("markdownResume") or doc.get("resumen"),
                "sheriffLogData": doc.get("sheriffLogData") or doc.get("sheriff"),
                "details": doc.get("details"),
                "riskAssessment": doc.get("riskAssessment"),
                "vistaDuxiter": doc.get("vistaDuxiter"),
                "duxiterRiskLevel": doc.get("duxiterRiskLevel"),
                "duxiterRiskData": doc.get("duxiterRiskData"),
                "duxiterRiskList": doc.get("duxiterRiskList"),
                "duxiterMD": doc.get("duxiterMD"),
                "newSummaryData": doc.get("newSummaryData"),
                "aiAnalysis": doc.get("aiAnalysis"),
                "aiAnalysisDate": _iso_z(doc.get("aiAnalysisDate")) if doc.get("aiAnalysisDate") else None,
            }
        ))

    return RutResultsResponse(
        success=True,
        data=data_rows,
        pagination=_PaginationMeta(page=page, limit=limit, total=total, totalPages=total_pages),
    )


@router.get(
    "/rut/results/latest",
    summary="Último resultado de evaluación",
    description="Compatibilidad FastCheckEX: devuelve el resultado más reciente (scope tenant).",
    operation_id="admin_compat_rut_result_latest",
)
async def get_rut_result_latest(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    is_super = await _user_is_super(_user)
    user_org = await _resolve_user_org(_user)
    if not is_super and user_org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    if not await _eval_collections(db):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    q: dict[str, Any] = {}
    if not is_super:
        # I risultati nuovi (results) hanno solo 'tenantId'; i vecchi (evaluationresults) hanno 'organizacion_id'.
        q["$or"] = [
            {"organizacion_id": user_org},
            {"organizacion_id": str(user_org)},
            {"tenantId": user_org},
            {"tenantId": str(user_org)},
        ]

    doc = await _find_latest_eval(db, q)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    return jsonable(_flatten_eval_doc(doc))


@router.get(
    "/rut/results/{result_id}",
    summary="Detalle individual de resultado de evaluación",
    description="Compatibilidad Workspace → ConsultaDetailPage (view 👁). Scope: superuser ve todos; usuario estandar ve solo doc.tenantId == user.tenant (404 hide privacy).",
    operation_id="admin_compat_rut_result_detail",
)
async def get_rut_result_detail(
    result_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    try:
        oid = ObjectId(result_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OBJECT_ID_INVALIDO")
    # --- Autorizzazione (stessi gates lista paginata L764-802) ---
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
    except Exception:
        raw_roles, user_role = [], ""
    is_super = "SUPER_WILDCARD" in raw_roles or user_role == "superuser"

    user_org: Optional[ObjectId] = None
    for attr in ["tenant", "organizacion_id", "tenantId", "organizacionId", "organizacion"]:
        try:
            val = getattr(_user, attr, None)
            if val:
                try:
                    user_org = ObjectId(str(val))
                    break
                except Exception:
                    continue
        except Exception:
            continue
    if user_org is None:
        try:
            ud = _user.__dict__
            val = ud.get("tenant") or ud.get("organizacion_id") or ud.get("tenantId")
            if val:
                user_org = ObjectId(str(val))
        except Exception:
            pass

    coll_names = await db.list_collection_names()
    ev_cols = [c for c in ("evaluationresults", "results") if c in coll_names]
    if not ev_cols:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")
    doc = None
    for col in ev_cols:
        doc = await db[col].find_one({"_id": oid})
        if doc:
            break
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    # Privacy gate: superuser -> skip; standard = tenant must match doc.tenantId OR doc.organizacion_id
    if not is_super:
        doc_t = doc.get("tenantId") or doc.get("organizacion_id") or None
        try:
            doc_t_oid = ObjectId(str(doc_t)) if doc_t else None
        except Exception:
            doc_t_oid = None
        doc_ok = (doc_t_oid is not None and user_org is not None and str(doc_t_oid) == str(user_org))
        if not doc_ok:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")
    # Flatten: el frontend espera riskAssessment/details/companyGeneralInfo directamente en el body,
    # no anidados en doc["data"]. Mergeamos data en el nivel raíz conservando metadatos (_id, name, status, createdAt...).
    return jsonable(_flatten_eval_doc(doc))


def _flatten_eval_doc(doc: dict) -> dict:
    """Spiana el campo 'data' de un documento evaluationresults al nivel raíz.
    El frontend FastCheckEX espera riskAssessment/details/companyGeneralInfo directamente en el body."""
    inner = doc.get("data") or {}
    if isinstance(inner, dict):
        merged = {**doc, **inner}
        merged.pop("data", None)
        return merged
    return doc


async def _resolve_user_org(_user: CurrentUser) -> Optional[ObjectId]:
    """Extrae el ObjectId de la organización del usuario actual desde CurrentUser (dataclass)."""
    for attr in ["tenant", "organizacion_id", "tenantId", "organizacionId", "organizacion"]:
        try:
            val = getattr(_user, attr, None)
            if val:
                try:
                    return ObjectId(str(val))
                except Exception:
                    continue
        except Exception:
            continue
    try:
        ud = _user.__dict__
        val = ud.get("tenant") or ud.get("organizacion_id") or ud.get("tenantId")
        if val:
            return ObjectId(str(val))
    except Exception:
        pass
    return None


async def _user_is_super(_user: CurrentUser) -> bool:
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
    except Exception:
        raw_roles, user_role = [], ""
    return "SUPER_WILDCARD" in raw_roles or user_role == "superuser"


async def _eval_collections(db) -> list[str]:
    """Restituisce le collezioni che contengono risultati di valutazione (evaluationresults e/o results)."""
    coll_names = await db.list_collection_names()
    cols = []
    if "evaluationresults" in coll_names:
        cols.append("evaluationresults")
    if "results" in coll_names:
        cols.append("results")
    return cols


async def _find_latest_eval(db, q: dict) -> Optional[dict]:
    """Cerca il documento più recente tra evaluationresults e results, ordinato per createdAt desc."""
    cols = await _eval_collections(db)
    best: Optional[dict] = None
    best_ts = None
    for col in cols:
        doc = await db[col].find_one(q, sort=[("createdAt", -1)])
        if doc is None:
            continue
        ts = doc.get("createdAt") or doc.get("created_at")
        if best is None or (ts is not None and (best_ts is None or ts > best_ts)):
            best = doc
            best_ts = ts
    return best


@router.get(
    "/rut/results/rut/{rut}",
    summary="Último resultado de evaluación por RUT",
    description="Compatibilidad FastCheckEX: devuelve el resultado más reciente para un RUT dado. "
                "Scope: superuser ve todos; usuario estándar ve solo doc.tenantId == user.tenant (404).",
    operation_id="admin_compat_rut_result_by_rut",
)
async def get_rut_result_by_rut(
    rut: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    is_super = await _user_is_super(_user)
    user_org = await _resolve_user_org(_user)
    if not is_super and user_org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    if not await _eval_collections(db):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    rut_clean = (rut or "").strip()
    q: dict[str, Any] = {
        "$or": [
            {"rut": rut_clean},
            {"rut_normalizado": rut_clean},
            {"rut_canonical": rut_clean},
            {"identifier": rut_clean},
        ]
    }
    if not is_super:
        # I risultati nuovi (results) hanno solo 'tenantId'; i vecchi (evaluationresults) hanno 'organizacion_id'.
        # Matchiamo entrambi, sia come ObjectId che come stringa.
        q["$and"] = [
            {
                "$or": [
                    {"organizacion_id": user_org},
                    {"organizacion_id": str(user_org)},
                    {"tenantId": user_org},
                    {"tenantId": str(user_org)},
                ]
            }
        ]

    doc = await _find_latest_eval(db, q)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    # Privacy gate tenant (per chi non è super): garantisce che tenantId/org matchi
    if not is_super:
        doc_t = doc.get("tenantId") or doc.get("organizacion_id") or None
        try:
            doc_t_oid = ObjectId(str(doc_t)) if doc_t else None
        except Exception:
            doc_t_oid = None
        if doc_t_oid is None or user_org is None or str(doc_t_oid) != str(user_org):
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Resultado no encontrado")

    return jsonable(_flatten_eval_doc(doc))


# =============================================================================
# TENANT MANAGEMENT CRUD + TOGGLE STATUS (Bloq2 int front, duxiter-2 only)
# Richiamati da src/pages/admin/TenantManagementPage.tsx.
# Solo superuser (SUPER_WILDCARD o role=="superuser") puo' chiamare -> 403 gli altri.
# =============================================================================

def _is_superuser(_user: CurrentUser) -> bool:
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
    except Exception:
        raw_roles, user_role = [], ""
    return "SUPER_WILDCARD" in raw_roles or user_role == "superuser"


@router.get("/tenant/all")
async def tenant_all(
    search: Optional[str] = Query(default=None),
    onlyActive: Optional[bool] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """
    GET /admin/tenant/all -> lista TUTTI i tenants (46) con shape esatta TS: Tenant {_id,name,isActive,usageStats:{evaluationsRemaining,Used,last},creditBalance:{},createdAt,updatedAt}
    Superuser -> tutti; altrimenti -> HTTP 403
    """
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    q: dict[str, Any] = {}
    if onlyActive is not None:
        q["isActive"] = bool(onlyActive)
    if search:
        q_clean = re.sub(r"[^0-9a-zA-ZÁÉÍÓÚáéíóúÑñÜü\s\.\-\@]", "", search).strip()
        if len(q_clean) >= 1:
            regex = {"$regex": re.escape(q_clean), "$options": "i"}
            q["$or"] = [
                {"name": regex},
                {"slug": regex},
                {"email": regex},
                {"rut": regex},
                {"businessName": regex},
                {"contactName": regex},
                {"industry": regex},
            ]
    cursor = db["tenants"].find(q).sort("name", 1)
    docs: list[dict[str, Any]] = await cursor.to_list(length=9999)
    tenant_ids = [str(d.get("_id")) for d in docs if d.get("_id")]

    # --- Aggregate usageStats: evaluationsUsed count evaluationresults per organizacion_id ---
    usage_map: dict[str, dict[str, Any]] = {}
    try:
        coll_names = await db.list_collection_names()
        ev_colname = "evaluationresults" if "evaluationresults" in coll_names else ("results" if "results" in coll_names else None)
        if ev_colname and tenant_ids:
            pipeline: list[dict[str, Any]] = [
                {"$match": {"organizacion_id": {"$in": [ObjectId(x) for x in tenant_ids if ObjectId.is_valid(x)]}}},
                {"$group": {
                    "_id": "$organizacion_id",
                    "evaluationsUsed": {"$sum": 1},
                    "lastEvaluationDate": {"$max": "$createdAt"},
                }},
            ]
            async for row in db[ev_colname].aggregate(pipeline):
                oid = row.get("_id")
                if isinstance(oid, ObjectId):
                    usage_map[str(oid)] = {
                        "evaluationsUsed": int(row.get("evaluationsUsed") or 0),
                        "lastEvaluationDate": _iso_z(row.get("lastEvaluationDate")) or None,
                    }
    except Exception:
        usage_map = {}

    # --- Pool credit balance: collection pool_creditos_organizacion / usuario_limite_consumo_v2 Bloq2.5 ---
    # FIX BLOQ2.5: NON usare issubset(3) perché consumos_log_v2 può non esistere (0 consumi)
    #             → SKIP TUTTI pools! Basta controllare la collezione che usiamo: pool_creditos_organizacion
    credit_map: dict[str, dict[str, Any]] = {}
    try:
        real_coll_names = set(coll_names if 'coll_names' in locals() and coll_names else (await db.list_collection_names()))
        if tenant_ids and ("pool_creditos_organizacion" in real_coll_names):
            cursor_pool = db["pool_creditos_organizacion"].find({"organizacion_id": {"$in": [ObjectId(x) for x in tenant_ids if ObjectId.is_valid(x)]}})
            async for p in cursor_pool:
                oid = p.get("organizacion_id")
                if isinstance(oid, ObjectId):
                    # DUAL SCHEMA FALLBACK (06/10 FIX MISMATCH): LEGACY PRIMA (fix manuale + service OK), POI BLOQ2.5 nuevos DESPUES
                    # No `or 0` pattern; check is not None + str().strip()
                    disp_raw = (p["creditos_disponibles"]
                                if ("creditos_disponibles" in p and p["creditos_disponibles"] is not None and str(p["creditos_disponibles"]).strip() != "")
                                else p.get("saldo_actual"))
                    total_raw = (p["creditos"]
                                 if ("creditos" in p and p["creditos"] is not None and str(p["creditos"]).strip() != "")
                                 else p.get("creditos_mensuales_org"))
                    used_hist_raw = (p["creditos_usados_historico"]
                                     if ("creditos_usados_historico" in p and p["creditos_usados_historico"] is not None and str(p["creditos_usados_historico"]).strip() != "")
                                     else p.get("creditos_usados"))
                    used_raw = (p["creditos_usados"]
                                if ("creditos_usados" in p and p["creditos_usados"] is not None and str(p["creditos_usados"]).strip() != "")
                                else p.get("creditos_consumidos_mes"))
                    disp_val = int(disp_raw) if (disp_raw is not None and str(disp_raw).strip() != "") else (int(total_raw) if (total_raw is not None and str(total_raw).strip() != "") else 0)
                    used_hist_val = int(used_hist_raw) if (used_hist_raw is not None and str(used_hist_raw).strip() != "") else (int(used_raw) if (used_raw is not None and str(used_raw).strip() != "") else 0)
                    credit_map[str(oid)] = {
                        "availableCredits": disp_val,
                        "totalCreditsUsed": used_hist_val,
                        "lastCreditOperation": _iso_z(p.get("fecha_actualizacion") or p.get("updatedAt") or p.get("actualizado_en") or p.get("_activated_20261005")) if (p.get("fecha_actualizacion") or p.get("updatedAt") or p.get("actualizado_en") or p.get("_activated_20261005")) else None,
                    }
    except Exception:
        credit_map = {}

    out: list[dict[str, Any]] = []
    for d in docs:
        oid = str(d.get("_id"))
        usage = usage_map.get(oid) or {"evaluationsUsed": 0, "lastEvaluationDate": None}
        credits_used_n = int(usage.get("evaluationsUsed") or 0)
        cred = credit_map.get(oid)
        if not cred:
            # default safe (creditBalance opzionale in TS: ?)
            available = int(d.get("availableCredits") or d.get("planCredits") or d.get("creditsAvailable") or 500)
            cred = {
                "availableCredits": max(available - credits_used_n, 0),
                "totalCreditsUsed": credits_used_n,
                "lastCreditOperation": None,
            }
        remaining = int(cred.get("availableCredits") or 0)
        out.append({
            "_id": oid,
            "name": str(d.get("name") or d.get("businessName") or f"Tenant {oid[-6:]}"),
            "isActive": bool(d.get("isActive") or False),
            "usageStats": {
                "evaluationsRemaining": remaining,
                "evaluationsUsed": credits_used_n,
                "lastEvaluationDate": usage.get("lastEvaluationDate"),
            },
            "creditBalance": cred,
            "createdAt": _iso_z(d.get("createdAt") or d.get("created_at") or d.get("_id").generation_time if d.get("_id") and hasattr(d.get("_id"), "generation_time") else None) or "",
            "updatedAt": _iso_z(d.get("updatedAt") or d.get("updated_at") or d.get("createdAt") or d.get("_id").generation_time if d.get("_id") and hasattr(d.get("_id"), "generation_time") else None) or "",
        })
    return out


class _TenantCreateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    slug: Optional[str] = None
    availableCredits: Optional[int] = 500
    creditBalance: Optional[dict[str, Any]] = None
    email: Optional[str] = None
    rut: Optional[str] = None
    businessName: Optional[str] = None
    contactName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    industry: Optional[str] = None
    planCodigo: Optional[str] = "BASIC"
    isActive: Optional[bool] = True


@router.post("/tenant", status_code=status.HTTP_201_CREATED)
async def tenant_create(
    payload: _TenantCreateIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """
    POST /admin/tenant -> crea nuovo tenant. Superuser only.
    """
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    now = _utc_now()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TENANT_NAME_EMPTY")
    slug = (payload.slug or "").strip() or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or f"tenant-{int(now.timestamp())}"
    available = int(payload.creditBalance.get("availableCredits") if payload.creditBalance else (payload.availableCredits or 500))
    new_doc: dict[str, Any] = {
        "name": name,
        "slug": slug,
        "isActive": bool(payload.isActive if payload.isActive is not None else True),
        "email": payload.email,
        "rut": payload.rut,
        "businessName": payload.businessName or name,
        "contactName": payload.contactName,
        "phone": payload.phone,
        "address": payload.address,
        "industry": payload.industry,
        "availableCredits": available,
        "planCodigo": payload.planCodigo or "BASIC",
        "createdAt": now,
        "updatedAt": now,
        "created_by_user_id": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None,
    }
    res = await db["tenants"].insert_one(new_doc)
    new_oid = str(res.inserted_id)
    # Upsert pool Bloq2.5 se collezioni esistono
    try:
        coll_names = await db.list_collection_names()
        if "pool_creditos_organizacion" in coll_names:
            await db["pool_creditos_organizacion"].update_one(
                {"organizacion_id": ObjectId(new_oid)},
                {"$set": {
                    "organizacion_id": ObjectId(new_oid),
                    "plan_codigo": payload.planCodigo or "BASIC",
                    "creditos": int(available),
                    "creditos_disponibles": int(available),
                    "creditos_usados": 0,
                    "creditos_usados_historico": 0,
                    "fecha_actualizacion": now,
                    "overshoot_actual": 0,
                    "isActive": True,
                }},
                upsert=True,
            )
    except Exception:
        pass
    # Risposta = GET /all shape completa (frontend setTenants([..., response.data]))
    return {
        "_id": new_oid,
        "name": name,
        "isActive": new_doc["isActive"],
        "usageStats": {"evaluationsRemaining": int(available), "evaluationsUsed": 0, "lastEvaluationDate": None},
        "creditBalance": {"availableCredits": int(available), "totalCreditsUsed": 0, "lastCreditOperation": None},
        "createdAt": _iso_z(now),
        "updatedAt": _iso_z(now),
    }


class _TenantUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    isActive: Optional[bool] = None
    availableCredits: Optional[int] = None
    creditBalance: Optional[dict[str, Any]] = None


@router.patch("/tenant/{tenant_id}")
async def tenant_update(
    tenant_id: str,
    payload: _TenantUpdateIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """
    PATCH /admin/tenant/:id -> modifica name / creditBalance. Superuser only.
    Risorsa non trovata -> 404.
    """
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    now = _utc_now()
    set_data: dict[str, Any] = {"updatedAt": now}
    if payload.name is not None and (str(payload.name).strip()):
        set_data["name"] = str(payload.name).strip()
    if payload.isActive is not None:
        set_data["isActive"] = bool(payload.isActive)
    available_new: Optional[int] = None
    if payload.creditBalance and isinstance(payload.creditBalance.get("availableCredits"), int):
        available_new = int(payload.creditBalance["availableCredits"])
        set_data["availableCredits"] = available_new
    elif payload.availableCredits is not None:
        available_new = int(payload.availableCredits)
        set_data["availableCredits"] = available_new
    res = await db["tenants"].update_one({"_id": ObjectId(tenant_id)}, {"$set": set_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    # Aggiorna pool Bloq2.5 se esiste
    if available_new is not None:
        try:
            coll_names = await db.list_collection_names()
            if "pool_creditos_organizacion" in coll_names:
                docu = await db["pool_creditos_organizacion"].find_one({"organizacion_id": ObjectId(tenant_id)})
                if docu:
                    used_hist = int(docu.get("creditos_usados_historico") or docu.get("creditos_usados") or 0)
                    disp = max(int(available_new), 0)
                    overshoot = max(used_hist - disp, 0) if disp else 0
                    await db["pool_creditos_organizacion"].update_one(
                        {"organizacion_id": ObjectId(tenant_id)},
                        {"$set": {"creditos": int(available_new), "creditos_disponibles": disp, "overshoot_actual": overshoot, "fecha_actualizacion": now}}
                    )
                else:
                    await db["pool_creditos_organizacion"].insert_one({
                        "organizacion_id": ObjectId(tenant_id),
                        "plan_codigo": "BASIC",
                        "creditos": int(available_new),
                        "creditos_disponibles": int(available_new),
                        "creditos_usados": 0,
                        "creditos_usados_historico": 0,
                        "overshoot_actual": 0,
                        "fecha_actualizacion": now,
                        "isActive": True,
                    })
        except Exception:
            pass
    # Recupera shape completa
    single = await db["tenants"].find_one({"_id": ObjectId(tenant_id)})
    if not single:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    # Stats usati (1 sola org)
    used_n = 0
    last_dt: Optional[str] = None
    try:
        coll_names = await db.list_collection_names()
        ev_col = "evaluationresults" if "evaluationresults" in coll_names else ("results" if "results" in coll_names else None)
        if ev_col:
            used_n = await db[ev_col].count_documents({"organizacion_id": ObjectId(tenant_id)})
            cursor_last = db[ev_col].find({"organizacion_id": ObjectId(tenant_id)}, {"createdAt": 1}).sort("createdAt", -1).limit(1)
            async for ld in cursor_last:
                last_dt = _iso_z(ld.get("createdAt")) or None
    except Exception:
        pass
    credit_out: dict[str, Any] = {"availableCredits": int(single.get("availableCredits") or available_new or 0), "totalCreditsUsed": used_n, "lastCreditOperation": _iso_z(now)}
    remaining = int(credit_out.get("availableCredits") or 0)
    return {
        "_id": tenant_id,
        "name": str(single.get("name") or ""),
        "isActive": bool(single.get("isActive") or False),
        "usageStats": {"evaluationsRemaining": remaining, "evaluationsUsed": used_n, "lastEvaluationDate": last_dt},
        "creditBalance": credit_out,
        "createdAt": _iso_z(single.get("createdAt")) or _iso_z(single.get("_id").generation_time) if single.get("_id") and hasattr(single.get("_id"), "generation_time") else "",
        "updatedAt": _iso_z(single.get("updatedAt") or now) or "",
    }


@router.patch("/tenant/{tenant_id}/superadmin-toggle-status")
async def tenant_toggle_status(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """
    PATCH /admin/tenant/:id/superadmin-toggle-status -> switch isActive.
    """
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    now = _utc_now()
    doc = await db["tenants"].find_one({"_id": ObjectId(tenant_id)}, {"isActive": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    new_isactive = not bool(doc.get("isActive") or False)
    await db["tenants"].update_one({"_id": ObjectId(tenant_id)}, {"$set": {"isActive": new_isactive, "updatedAt": now, "lastStatusChangeBy": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None}})
    return {"_id": tenant_id, "isActive": new_isactive}


@router.delete("/tenant/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def tenant_delete(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """
    DELETE /admin/tenant/:id
    SOFT delete: isActive=False + deletedAt + deletedBy. NON hard-cancelliamo nulla per sicurezza staging (per evitare incidenti).
    """
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    now = _utc_now()
    res = await db["tenants"].update_one(
        {"_id": ObjectId(tenant_id)},
        {"$set": {
            "isActive": False,
            "deletedAt": now,
            "deletedBy": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None,
            "updatedAt": now,
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    # Nascondi anche pool se esiste
    try:
        coll_names = await db.list_collection_names()
        if "pool_creditos_organizacion" in coll_names:
            await db["pool_creditos_organizacion"].update_one(
                {"organizacion_id": ObjectId(tenant_id)},
                {"$set": {"isActive": False, "fecha_actualizacion": now}}
            )
    except Exception:
        pass
    return None


# =============================================================================
# TENANT DETAIL + USER MANAGEMENT CRUD + TOGGLE STATUS (pagina TenantUsers e SuperAdminUsers)
# =============================================================================

def _normalize_role_frontend(role: Any) -> str:
    """Mappa ruoli interni a quelli accettati da TS (superuser|tenant_admin|evaluator)."""
    r = str(role or "").strip()
    mp: dict[str, str] = {
        "SUPER_WILDCARD": "superuser",
        "superuser": "superuser",
        "admin": "tenant_admin",
        "tenant.admin": "tenant_admin",
        "tenant_admin": "tenant_admin",
        "tenant.read_only": "evaluator",
        "read_only": "evaluator",
        "tenant.evaluator": "evaluator",
        "evaluator": "evaluator",
    }
    if r in mp: return mp[r]
    if "admin" in r.lower(): return "tenant_admin"
    if "eval" in r.lower() or "readonly" in r.lower() or "read_only" in r.lower(): return "evaluator"
    if "super" in r.lower(): return "superuser"
    return "evaluator"


@router.get("/tenant/{tenant_id}")
async def tenant_detail(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """GET /admin/tenant/:id -> dettaglio base per header Tenant Users."""
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    doc = await db["tenants"].find_one({"_id": ObjectId(tenant_id)}, {"name": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    return {"_id": str(doc.get("_id")), "name": str(doc.get("name") or f"Tenant {tenant_id[-6:]}")}


@router.get("/tenant/{tenant_id}/users")
async def tenant_users_list(
    tenant_id: str,
    search: Optional[str] = Query(default=None),
    onlyActive: Optional[bool] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """GET /admin/tenant/:id/users -> lista users del tenant (User shape TS)."""
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    org_oid = ObjectId(tenant_id)
    q: dict[str, Any] = {"$or": [
        {"organizacion_id": org_oid},
        {"tenant": org_oid},
        {"tenantId": org_oid},
        {"organizacionId": org_oid},
    ]}
    if onlyActive is not None:
        q["isActive"] = bool(onlyActive)
    if search:
        q_clean = re.sub(r"[^0-9a-zA-ZÁÉÍÓÚáéíóúÑñÜü\s\.\-\@]", "", search or "").strip()
        if len(q_clean) >= 1:
            regex = {"$regex": re.escape(q_clean), "$options": "i"}
            q["$and"] = [
                q.pop("$and", []) or {},
                {"$or": [
                    {"name": regex},
                    {"fullname": regex},
                    {"nombre": regex},
                    {"email": regex},
                    {"rut": regex},
                    {"role": regex},
                    {"legacy_role": regex},
                ]}
            ]
            # cleanup $and empty (se l'else di sopra ha messo {})
            if isinstance(q.get("$and"), list):
                q["$and"] = [x for x in q["$and"] if x]
                if not q["$and"]:
                    del q["$and"]
    cursor = db["users"].find(q).sort("email", 1)
    docs: list[dict[str, Any]] = await cursor.to_list(length=9999)
    out: list[dict[str, Any]] = []
    for d in docs:
        raw_role = d.get("role") or d.get("legacy_role") or d.get("authz_v2", {}).get("roles") if isinstance(d.get("authz_v2"), dict) else d.get("role")
        out.append({
            "_id": str(d.get("_id")),
            "name": str(d.get("name") or d.get("fullname") or d.get("nombre") or f"User {str(d.get('_id'))[-6:]}"),
            "email": str(d.get("email") or ""),
            "role": _normalize_role_frontend(raw_role),
            "isActive": bool(d.get("isActive") if d.get("isActive") is not None else True),
            "createdAt": _iso_z(d.get("createdAt") or d.get("created_at") or (d.get("_id").generation_time if isinstance(d.get("_id"), ObjectId) else None)) or "",
        })
    return out


@router.get("/users/superadmin/all")
async def users_superadmin_all(
    search: Optional[str] = Query(default=None),
    onlyActive: Optional[bool] = Query(default=None),
    tenantId: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """GET /users/superadmin/all -> tutti i 66 users globale. Filtri opzionali."""
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    q: dict[str, Any] = {}
    if onlyActive is not None:
        q["isActive"] = bool(onlyActive)
    if tenantId and ObjectId.is_valid(tenantId):
        org_oid = ObjectId(tenantId)
        q["$or"] = [{"organizacion_id": org_oid}, {"tenant": org_oid}, {"tenantId": org_oid}, {"organizacionId": org_oid}]
    if search:
        q_clean = re.sub(r"[^0-9a-zA-ZÁÉÍÓÚáéíóúÑñÜü\s\.\-\@]", "", search or "").strip()
        if len(q_clean) >= 1:
            regex = {"$regex": re.escape(q_clean), "$options": "i"}
            q["$or"] = [
                {"name": regex}, {"fullname": regex}, {"nombre": regex}, {"email": regex},
                {"rut": regex}, {"role": regex}, {"legacy_role": regex},
            ]
    cursor = db["users"].find(q).sort("email", 1)
    docs: list[dict[str, Any]] = await cursor.to_list(length=99999)
    out: list[dict[str, Any]] = []
    for d in docs:
        raw_role = d.get("role") or d.get("legacy_role")
        out.append({
            "_id": str(d.get("_id")),
            "name": str(d.get("name") or d.get("fullname") or d.get("nombre") or f"User {str(d.get('_id'))[-6:]}"),
            "email": str(d.get("email") or ""),
            "role": _normalize_role_frontend(raw_role),
            "isActive": bool(d.get("isActive") if d.get("isActive") is not None else True),
            "createdAt": _iso_z(d.get("createdAt") or d.get("created_at") or (d.get("_id").generation_time if isinstance(d.get("_id"), ObjectId) else None)) or "",
            "tenant": str(d.get("tenant")) if isinstance(d.get("tenant"), ObjectId) else (str(d.get("organizacion_id")) if isinstance(d.get("organizacion_id"), ObjectId) else (str(d.get("tenant")) if d.get("tenant") else "")),
        })
    return out


@router.patch("/users/{user_id}/superadmin-toggle-status")
async def user_toggle_status(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PATCH /users/:id/superadmin-toggle-status -> switch attivo/disattivo utente (NON se stesso!)."""
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_USER_ID")
    if str(user_id) == str(_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NON_AUTO_DISABLE")
    now = _utc_now()
    doc = await db["users"].find_one({"_id": ObjectId(user_id)}, {"isActive": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")
    new_active = not bool(doc.get("isActive") or False)
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"isActive": new_active, "updatedAt": now, "lastStatusChangeBy": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None}}
    )
    return {"_id": user_id, "isActive": new_active}


class _SuperadminResetPasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    newPassword: str = Field(
        ...,
        min_length=6, max_length=128,
        description="Nueva contraseña en claro (será hasheada bcrypt 12 rounds). Longitud 6-128.",
    )


@router.patch("/users/{user_id}/superadmin-reset-password")
async def user_superadmin_reset_password(
    user_id: str,
    body: _SuperadminResetPasswordIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PATCH /users/:id/superadmin-reset-password -> Superadmin resetea la password de un usuario.
       · Gates: (1) SUPERUSER_REQUIRED 403; (2) INVALID_USER_ID 400; (3) NON_AUTO_RESET 400;
              (4) USER_NOT_FOUND 404; (5) NEW_PASSWORD_INVALID 422.
       · Actualiza password HASH bcrypt y cache_version + 2 (invalidar JWT)."""
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_USER_ID")
    if str(user_id) == str(_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NON_AUTO_RESET")
    new_pwd = (body.newPassword or "").strip()
    if len(new_pwd) < 6 or len(new_pwd) > 128:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="NEW_PASSWORD_INVALID")
    now = _utc_now()
    doc = await db["users"].find_one({"_id": ObjectId(user_id)}, {"_id": 1, "cache_version": 1, "email": 1})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")
    hashed = get_password_hash(new_pwd)
    new_cache = int(doc.get("cache_version") or 0) + 2
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "password": hashed,
            "updatedAt": now,
            "cache_version": new_cache,
            "lastPasswordResetBy": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None,
            "lastPasswordResetAt": now,
        }}
    )
    return {"ok": True, "_id": user_id, "email": doc.get("email"), "cache_version_bumped_to": new_cache}


# ---------------------------------------------------------------------------
# ENDPOINT NUOVO 06/10: SUPERUSER CAMBIO PLAN POOL DI UN QUALSIASI TENANT (Bloq2.5 sensible NIV3)
# ---------------------------------------------------------------------------


class _CambiarPlanTenantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmacion_cambio_riesgo: bool = Field(
        default=False,
        description="Modal doble intencion: SOLO True habilita operacion sensible de cambio plan.",
    )
    nuevo_nivel: int = Field(
        ge=1, le=5,
        description="1=BASIC 500, 2=STARTUP 2000, 3=PRO 10000, 4=BUSINESS 50000, 5=ENTERPRISE 250000",
    )
    motivo_cambio: str = Field(
        min_length=3, max_length=300,
        description="Motivo explicito del cambio (guardado en auditoria.",
    )


@router.put("/tenant/{tenant_id}/pool/plan", summary="Admin SUPERUSER cambia plan pool de un tenant cualquiera (sensible NIV3)")
async def admin_tenant_cambiar_plan_pool(
    tenant_id: str,
    body: _CambiarPlanTenantRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PUT /admin/tenant/:id/pool/plan · Bloq2.5 cambio plan pool sensible NIV3 (SUPERUSER only).
    Gates: (1) superuser role 403; (2) tenant_id valido 400; (3) modal doble intencion 428;
           (4) tenant existe 404; (5) escalamiento NIV3 (sensible) 403; (6) service cambiar_plan_pool.
    Side effects: (a) pool_creditos_organizacion update; (b) sync tenants doc planCodigo/availableCredits;
                  (c) auditoria_log row accion=capacidad.pool.cambio_plan_tenant_admin."""
    # 1. Gate superadmin
    if not _is_superuser(_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPERUSER_REQUIRED")
    # 2. Tenant id valido
    if not ObjectId.is_valid(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_TENANT_ID")
    # 3. Modal doble intencion Bloq2.5
    perm_cod = "pool.credit.manage"
    if not body.confirmacion_cambio_riesgo:
        raise HTTPException(
            status_code=428,
            detail={
                "codigo": "MODAL_DOBLE_INTENCION_REQUERIDA",
                "permiso_codigo": perm_cod,
                "mensaje": "Debe marcar confirmacion_cambio_riesgo=True para efectuar el cambio de plan.",
            },
        )
    tenant_oid = ObjectId(tenant_id)
    # 4. Tenant existe
    tenant_doc = await db["tenants"].find_one({"_id": tenant_oid})
    if not tenant_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TENANT_NOT_FOUND")
    # 5. Hydrate superuser come EnrichedUser (per audit
    eu = await hydrate_user_from_db(db, user_id=ObjectId(_user.id))
    # 6. Gate escalamiento sensible NIV3 (para pool.credit.manage) · Superuser bypass: _gate_escalamiento_sensible
    if not eu.is_superuser_wildcard:
        otorgado_max = 0
        for ov in eu.usuario_permiso_overrides:
            if (
                ov.get("permiso_codigo") == perm_cod
                and ov.get("tipo_override") == "GRANT"
                and ov.get("sensible_confirmado") is True
            ):
                otorgado_max = max(otorgado_max, int(ov.get("nivel_escalamiento") or 1))
        if otorgado_max < 3:
            raise HTTPException(
                status_code=403,
                detail={
                    "codigo": "ESCALAMIENTO_INSUFICIENTE_Q4",
                    "permiso_codigo": perm_cod,
                    "nivel_requerido": 3,
                    "nivel_otorgado": otorgado_max,
                    "mensaje": "Permiso sensible pool.credit.manage requiere nivel escalamiento 3; usted tiene " + str(otorgado_max),
                },
            )
    # 7. Ejecutar service Bloq2.5 cambiar_plan_pool (realiza ratio prorata, auditoria service interna)
    ok, http_status, codigo_err, pool_nuevo = await cambiar_plan_pool(
        db, eu, tenant_oid, body.nuevo_nivel, body.motivo_cambio
    )
    if not ok:
        raise HTTPException(
            status_code=http_status or 500,
            detail={
                "codigo": codigo_err or "CAMBIO_PLAN_FALLO",
                "mensaje": "Cambio de plan pool no realizado (gate service interno.",
            },
        )
    # 8. Sync doc tenants v1 (admin_compat lista tenants legge da tenants doc, NON da pool!)
    try:
        plan_meta = next((p for p in NIVELES_POOL_5 if p["nivel"] == body.nuevo_nivel), None)
        if pool_nuevo and plan_meta:
            # DUAL SCHEMA FALLBACK: (1) NUOVO Bloq2.5 saldo_actual → (2) legacy creditos_disponibles → (3) plan_meta default
            def _safe_int(d, key):
                if key in d and d[key] is not None and str(d[key]).strip() != "":
                    return int(d[key])
                return None
            disp_nuevo = _safe_int(pool_nuevo, "saldo_actual")
            if disp_nuevo is None:
                disp_nuevo = _safe_int(pool_nuevo, "creditos_disponibles")
            credits_disp = disp_nuevo if disp_nuevo is not None else int(plan_meta["creditos_mensuales_org"])
            await db["tenants"].update_one(
                {"_id": tenant_oid},
                {"$set": {
                    "planCodigo": plan_meta["nombre"].upper(),
                    "availableCredits": credits_disp,
                    "totalCredits": int(plan_meta["creditos_mensuales_org"]),
                    "updatedAt": _utc_now(),
                    "_planChangedBy": ObjectId(_user.id) if ObjectId.is_valid(_user.id) else None,
                    "_planChangedReason": body.motivo_cambio,
                }},
            )
    except Exception:
        pass
    # 9. Auditoria (row en auditoria_log)
    try:
        dec = AuthzDecision(
            permitir=True, paso_fallido=None, motivo_denegacion="",
            permiso_efectivo_origen="SUPERUSER:pool.credit.manage:NIV3",
            nivel_info_autorizado="INFO_COMPLETA", pn_gate=False, scope_match="ORG",
        )
        await registrar_auditoria(
            db, user=eu,
            accion_codigo="capacidad.pool.cambio_plan_tenant_admin",
            decision=dec,
            recurso={"entidad_tipo": "pool_creditos_organizacion", "entidad_id": str(tenant_oid)},
            valor_anterior={
                "tenant_name": str(tenant_doc.get("name")),
                "tenant_id": str(tenant_oid),
                "plan_viejo": tenant_doc.get("planCodigo"),
                "creditos_disponibles_viejos": tenant_doc.get("availableCredits"),
            },
            valor_nuevo={
                "nuevo_nivel": body.nuevo_nivel,
                "nuevo_plan_nombre": (next((p["nombre"] for p in NIVELES_POOL_5 if p["nivel"] == body.nuevo_nivel), None)),
                "motivo_cambio": body.motivo_cambio,
                "realizado_por": str(_user.id),
                "pool_nuevo": pool_nuevo,
            },
        )
    except Exception:
        pass
    return {"ok": True, "tenant_id": tenant_id, "pool_actualizado": _jsonable_safe(pool_nuevo)}


def _jsonable_safe(d: Any) -> Any:
    """Conversione ObjectId/datetime a JSON-safe per response (stesso pattern di capacidad_pool router Bloq2.5)."""
    import json as _json
    def _default(o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, (dt.datetime,)):
            return o.isoformat()
        return str(o)
    try:
        return _json.loads(_json.dumps(d, default=_default))
    except Exception:
        return d


# ---------------------------------------------------------------------------
# ENDPOINTS NUOVI 09/10: HISTORICAL CONSULTAS (Compatibilidad frontend /consultas/historical)
#   · Collezione fuente: consulta_history (1722 docs 09/10 I1 = match 1:1 interfaccia TS HistoricalConsulta)
#   · Frontend service: services/api.ts historicalConsultasApi.getHistoricalConsultas()
# ---------------------------------------------------------------------------


def _historical_resolve_user_org(_user: CurrentUser) -> Optional[ObjectId]:
    """5 fallback resolve org utente (stesso pattern lista /rut/results L764-802)."""
    try:
        for attr in ["tenant", "organizacion_id", "tenantId", "organizacionId", "organizacion"]:
            try:
                val = getattr(_user, attr, None)
                if val:
                    try:
                        return ObjectId(str(val))
                    except Exception:
                        continue
            except Exception:
                continue
        ud = _user.__dict__
        val = ud.get("tenant") or ud.get("organizacion_id") or ud.get("tenantId")
        if val:
            return ObjectId(str(val))
    except Exception:
        return None
    return None


def _historical_is_super(_user: CurrentUser) -> bool:
    try:
        raw_roles = list(getattr(_user, "roles", []) or [])
        user_role = str(getattr(_user, "role", "") or "")
        return "SUPER_WILDCARD" in raw_roles or user_role == "superuser"
    except Exception:
        return False


def _historical_map_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Map Mongo doc -> interfaccia TS services/api.ts HistoricalConsulta (L648-667)."""
    def _oid_s(x: Any) -> Optional[str]:
        if x is None:
            return None
        if isinstance(x, ObjectId):
            return str(x)
        s = str(x).strip()
        if not s:
            return None
        if ObjectId.is_valid(s) and len(s) == 24:
            return s
        return s

    def _iso_z(x: Any) -> Optional[str]:
        if x is None:
            return None
        if isinstance(x, dt.datetime):
            if x.tzinfo is None:
                x = x.replace(tzinfo=dt.timezone.utc)
            return x.isoformat()
        s = str(x).strip()
        return s or None

    def _user_safe(uid_doc: Any) -> Any:
        """Interfaccia TS UserInfo {_id, name, email, role}."""
        if isinstance(uid_doc, dict) and (uid_doc.get("_id") or uid_doc.get("email")):
            return {
                "_id": _oid_s(uid_doc.get("_id")) or "",
                "name": str(uid_doc.get("name") or uid_doc.get("fullname") or uid_doc.get("nombre") or ""),
                "email": str(uid_doc.get("email") or ""),
                "role": str(uid_doc.get("role") or uid_doc.get("legacy_role") or "user"),
            }
        if uid_doc is not None:
            uid_s = _oid_s(uid_doc)
            if uid_s and len(uid_s) == 24:
                return {
                    "_id": uid_s, "name": "", "email": "", "role": "user",
                }
        return None

    consulta_type_raw = str(doc.get("consultaType") or doc.get("type") or "individual").lower()
    consulta_type: str = consulta_type_raw
    if consulta_type_raw in ("massive", "masivo", "massiva", "bulk"):
        consulta_type = "massive"
    elif consulta_type_raw in ("single", "individual", "individuale", "unitaria"):
        consulta_type = "individual"

    proc_raw = doc.get("processingTime") or doc.get("processing_time_ms") or doc.get("duration_ms") or 0
    try:
        proc_time = int(proc_raw) if proc_raw is not None else 0
    except Exception:
        proc_time = 0

    creds_raw = doc.get("creditsUsed") or doc.get("credits_consumed") or doc.get("credits_usados") or 0
    try:
        creds_used = int(creds_raw) if creds_raw is not None else 0
    except Exception:
        creds_used = 0

    status_raw = doc.get("responseStatus") or doc.get("status_code") or doc.get("response_status") or 200
    try:
        resp_status = int(status_raw) if status_raw is not None else 200
    except Exception:
        resp_status = 200

    ruts_raw = doc.get("ruts") or doc.get("rut_list") or []
    ruts: list[str] = []
    if isinstance(ruts_raw, list):
        for r in ruts_raw:
            rs = str(r or "").strip()
            if rs:
                ruts.append(rs)

    rut_solo = str(doc.get("rut") or doc.get("rut_normalized") or doc.get("rut_canonical") or doc.get("identifier") or "").strip() or None

    return {
        "_id": _oid_s(doc.get("_id")) or "",
        "tenantId": _oid_s(doc.get("tenantId") or doc.get("organizacion_id") or doc.get("tenant_id")) or "",
        "userId": _user_safe(doc.get("userId") or doc.get("user_id")),
        "consultaType": consulta_type,
        "rut": rut_solo,
        "ruts": ruts,
        "endpoint": str(doc.get("endpoint") or ""),
        "requestData": doc.get("requestData") or doc.get("request_body") or None,
        "responseStatus": resp_status,
        "responseData": doc.get("responseData") or doc.get("response_body") or None,
        "errorMessage": str(doc.get("errorMessage") or doc.get("error") or doc.get("mensaje_error") or "").strip() or None,
        "processingTime": proc_time,
        "creditsUsed": creds_used,
        "ipAddress": str(doc.get("ipAddress") or doc.get("ip_address") or "").strip() or None,
        "userAgent": str(doc.get("userAgent") or doc.get("user_agent") or "").strip() or None,
        "sessionId": str(doc.get("sessionId") or doc.get("session_id") or "").strip() or None,
        "metadata": doc.get("metadata") or None,
        "createdAt": _iso_z(doc.get("createdAt") or doc.get("created_at") or (doc.get("_id").generation_time if isinstance(doc.get("_id"), ObjectId) else None)) or "",
    }


@router.get(
    "/rut/historical-consultas",
    summary="Historial de consultas con filtros y paginacion (frontend /consultas/historical)",
    description="Compatibilidad con services/api.ts historicalConsultasApi.getHistoricalConsultas(). "
                "Scope: SUPERUSER=ve todos los registros global; estandar=solo su tenantId. "
                "Filtros: consultaType (individual/massive), rut, endpoint, responseStatus, rango fechas startDate/endDate.",
    operation_id="admin_compat_rut_historical_consultas_list",
)
async def get_rut_historical_consultas_list(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    consultaType: Optional[str] = Query(default=None, description="individual|massive"),
    rut: Optional[str] = Query(default=None, description="Filtro por RUT exacto o parcial"),
    endpoint: Optional[str] = Query(default=None, description="Filtro endpoint (ej /api/v2/third-parties/{id}/history)"),
    responseStatus: Optional[int] = Query(default=None, description="HTTP response status code"),
    startDate: Optional[str] = Query(default=None, description="ISO date inclusive (>=). Formato YYYY-MM-DD o full ISO."),
    endDate: Optional[str] = Query(default=None, description="ISO date exclusive (<). Formato YYYY-MM-DD o full ISO."),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    # --- Autorizzazione ---
    is_super = _historical_is_super(_user)
    user_org = _historical_resolve_user_org(_user)
    if not is_super and user_org is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ORGANIZACION_USUARIO_NO_IDENTIFICADA",
        )

    q: dict[str, Any] = {}
    # privacy gate: solo docs tenantId == user_org (se non super)
    # NOTA BENE: consulta_history memorizza tenantId come STRINGA 24 hex SEMPRE (1722/1722 docs)
    # ma accettiamo ANCHE ObjectId per sicurezza.
    if not is_super:
        org_oid = ObjectId(user_org)
        org_str = str(user_org)
        q["$or"] = [
            {"tenantId": {"$in": [org_oid, org_str]}},
            {"organizacion_id": {"$in": [org_oid, org_str]}},
            {"tenant_id": {"$in": [org_oid, org_str]}},
        ]
    # --- filtri frontend HistoricalConsultaFilters ---
    if consultaType and str(consultaType).strip():
        ct = str(consultaType).strip().lower()
        if ct in ("massive", "masivo", "bulk", "massiva"):
            q["consultaType"] = {"$in": ["massive", "masivo", "bulk", "massiva", "massive"]}
        elif ct in ("individual", "single", "unitaria", "individuale"):
            q["consultaType"] = {"$in": ["individual", "single", "unitaria", "individuale", "individual"]}
        else:
            q["consultaType"] = ct
    if rut and str(rut).strip():
        rut_clean = str(rut).strip()
        q1: dict[str, Any] = {"rut": {"$regex": re.escape(rut_clean), "$options": "i"}}
        q2: dict[str, Any] = {"ruts": {"$elemMatch": {"$regex": re.escape(rut_clean), "$options": "i"}}}
        q3: dict[str, Any] = {"rut_normalized": {"$regex": re.escape(rut_clean), "$options": "i"}}
        q4: dict[str, Any] = {"rut_canonical": {"$regex": re.escape(rut_clean), "$options": "i"}}
        q5: dict[str, Any] = {"identifier": {"$regex": re.escape(rut_clean), "$options": "i"}}
        previous_or = q.get("$or", None)
        if previous_or is not None and isinstance(previous_or, list) and len(previous_or) > 0:
            q["$and"] = [{"$or": previous_or}, {"$or": [q1, q2, q3, q4, q5]}]
            q.pop("$or", None)
        else:
            q["$or"] = [q1, q2, q3, q4, q5]
    if endpoint and str(endpoint).strip():
        ep = str(endpoint).strip()
        q["endpoint"] = {"$regex": re.escape(ep), "$options": "i"}
    if responseStatus is not None:
        try:
            rs_int = int(responseStatus)
            q["responseStatus"] = rs_int
        except Exception:
            pass
    # filtro data: startDate / endDate ISO
    ts_filters: dict[str, Any] = {}
    if startDate and str(startDate).strip():
        try:
            ts_start = dt.datetime.fromisoformat(str(startDate).replace("Z", "+00:00"))
            if ts_start.tzinfo is None:
                ts_start = ts_start.replace(tzinfo=dt.timezone.utc)
            ts_filters["$gte"] = ts_start
        except Exception:
            pass
    if endDate and str(endDate).strip():
        try:
            ts_end = dt.datetime.fromisoformat(str(endDate).replace("Z", "+00:00"))
            if ts_end.tzinfo is None:
                ts_end = ts_end.replace(tzinfo=dt.timezone.utc)
            ts_filters["$lt"] = ts_end
        except Exception:
            pass
    if len(ts_filters) > 0:
        q["createdAt"] = ts_filters if "createdAt" not in q else q["createdAt"]

    coll_names = await db.list_collection_names()
    ch_colname = "consulta_history" if "consulta_history" in coll_names else None
    if ch_colname is None:
        # fallback vuoto (nessun 404 ma data empty)
        return jsonable({
            "data": [],
            "pagination": {
                "page": int(page),
                "limit": int(limit),
                "total": 0,
                "totalPages": 0,
            },
        })

    total = await db[ch_colname].count_documents(q)
    total_pages = max(1, math.ceil(total / max(1, int(limit))))
    skip_n = max(0, (int(page) - 1) * int(limit))
    cursor = db[ch_colname].find(q).sort("createdAt", -1).skip(skip_n).limit(int(limit))
    docs: list[dict[str, Any]] = await cursor.to_list(length=int(limit) + 1)
    data_rows = [_historical_map_doc(d) for d in docs]

    return jsonable({
        "data": data_rows,
        "pagination": {
            "page": int(page),
            "limit": int(limit),
            "total": int(total),
            "totalPages": int(total_pages),
        },
    })


@router.get(
    "/rut/historical-consultas/stats",
    summary="Estadisticas historico consultas (frontend 4 card stats header)",
    description="Compatibilidad services/api.ts historicalConsultasApi.getHistoricalConsultasStats(). "
                "Retorna: totalConsultas, consultasByType, consultasByEndpoint, consultasByStatus, consultasByDate, avgProcessingTime, totalCreditsUsed. "
                "Scope: SUPER = stats globales; estandar = stats solo tenant propio.",
    operation_id="admin_compat_rut_historical_consultas_stats",
)
async def get_rut_historical_consultas_stats(
    startDate: Optional[str] = Query(default=None),
    endDate: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    is_super = _historical_is_super(_user)
    user_org = _historical_resolve_user_org(_user)
    if not is_super and user_org is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ORGANIZACION_USUARIO_NO_IDENTIFICADA")
    q: dict[str, Any] = {}
    if not is_super:
        org_oid = ObjectId(user_org)
        org_str = str(user_org)
        q["$or"] = [
            {"tenantId": {"$in": [org_oid, org_str]}},
            {"organizacion_id": {"$in": [org_oid, org_str]}},
            {"tenant_id": {"$in": [org_oid, org_str]}},
        ]
    ts_filters: dict[str, Any] = {}
    if startDate and str(startDate).strip():
        try:
            ts_start = dt.datetime.fromisoformat(str(startDate).replace("Z", "+00:00"))
            if ts_start.tzinfo is None:
                ts_start = ts_start.replace(tzinfo=dt.timezone.utc)
            ts_filters["$gte"] = ts_start
        except Exception:
            pass
    if endDate and str(endDate).strip():
        try:
            ts_end = dt.datetime.fromisoformat(str(endDate).replace("Z", "+00:00"))
            if ts_end.tzinfo is None:
                ts_end = ts_end.replace(tzinfo=dt.timezone.utc)
            ts_filters["$lt"] = ts_end
        except Exception:
            pass
    if len(ts_filters) > 0:
        q["createdAt"] = ts_filters

    coll_names = await db.list_collection_names()
    ch_colname = "consulta_history" if "consulta_history" in coll_names else None

    EMPTY_STATS = {
        "totalConsultas": 0,
        "consultasByType": {},
        "consultasByEndpoint": {},
        "consultasByStatus": {},
        "consultasByDate": [],
        "averageProcessingTime": 0.0,
        "totalCreditsUsed": 0,
    }

    if ch_colname is None:
        return jsonable(EMPTY_STATS)

    # Eseguiamo aggregazioni con python (safe per createdAt BSON STRING e processingTime null/str)
    # Preleva tutti i docs che matchano q in streaming
    all_rows_cursor = db[ch_colname].find(q, {
        "consultaType": 1, "endpoint": 1, "responseStatus": 1,
        "processingTime": 1, "creditsUsed": 1,
        "createdAt": 1, "_id": 1,
    })
    all_rows = await all_rows_cursor.to_list(length=200000)
    total_cnt = len(all_rows)
    # group conteggio
    def _cnt_dict(field: str, default_key: str = "(empty)", normalize_type: bool = False) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in all_rows:
            raw_val = r.get(field)
            key = ""
            if raw_val is None:
                key = ""
            else:
                key = str(raw_val).strip()
            if key == "":
                key = default_key
            if normalize_type and field == "consultaType":
                s = key.lower()
                if s in ("massive", "masivo", "bulk", "massiva"):
                    key = "massive"
                elif s in ("individual", "single", "unitaria", "individuale"):
                    key = "individual"
            out[key] = out.get(key, 0) + 1
        return out
    by_type = _cnt_dict("consultaType", normalize_type=True)
    by_endpoint = _cnt_dict("endpoint")
    by_status_raw = _cnt_dict("responseStatus", default_key="200")
    by_status: dict[str, int] = {}
    for k, v in by_status_raw.items():
        s = str(k).strip()
        if not s or s == "(empty)":
            s = "200"
        by_status[s] = v

    # group by date YYYY-MM-DD (createdAt[:10])
    by_date_map: dict[str, int] = {}
    sum_proc: int = 0
    count_proc_valid: int = 0
    sum_creds: int = 0
    for r in all_rows:
        # data
        created_raw = r.get("createdAt") or None
        date_iso: str = ""
        if isinstance(created_raw, dt.datetime):
            date_iso = created_raw.strftime("%Y-%m-%d")
        elif created_raw is not None:
            s = str(created_raw).strip()
            if len(s) >= 10:
                date_iso = s[:10]
        if date_iso and len(date_iso) == 10 and date_iso[4] == '-' and date_iso[7] == '-':
            by_date_map[date_iso] = by_date_map.get(date_iso, 0) + 1
        # processing time
        proc_raw = r.get("processingTime") or 0
        try:
            pv = int(proc_raw)
            if 0 < pv < 3_600_000:  # safe 1h max
                sum_proc += pv
                count_proc_valid += 1
        except Exception:
            pass
        # credits used
        cred_raw = r.get("creditsUsed") or 0
        try:
            sum_creds += int(cred_raw) if cred_raw is not None else 0
        except Exception:
            pass
    by_date_sorted = sorted(by_date_map.items(), key=lambda kv: kv[0])[:720]
    by_date_list = [{"date": d, "count": c} for d, c in by_date_sorted]
    avg_proc: float = float(sum_proc) / float(count_proc_valid) if count_proc_valid > 0 else 0.0
    avg_proc = round(avg_proc, 2)

    stats = {
        "totalConsultas": int(total_cnt or 0),
        "consultasByType": by_type,
        "consultasByEndpoint": dict(sorted(by_endpoint.items(), key=lambda kv: -kv[1])[:100]),
        "consultasByStatus": by_status,
        "consultasByDate": by_date_list,
        "averageProcessingTime": avg_proc,
        "totalCreditsUsed": int(sum_creds or 0),
    }
    return jsonable(stats)


# ---------------------------------------------------------------------------
# ENDPOINT NUOVO 09/10: PERFIL USUARIO ENRIQUECIDO (Avatar sidebar click)
#   GET /users/me/enriched
# ---------------------------------------------------------------------------

async def _me_resolve_org(_user: CurrentUser, user_doc: dict[str, Any]) -> Optional[ObjectId]:
    # 5 fallback (CurrentUser attrs)
    for attr in ["tenant", "organizacion_id", "tenantId", "organizacionId", "organizacion"]:
        try:
            v = getattr(_user, attr, None)
            if v:
                try:
                    return ObjectId(str(v))
                except Exception:
                    continue
        except Exception:
            continue
    # fallback CurrentUser.__dict__
    try:
        ud = _user.__dict__ if hasattr(_user, "__dict__") else {}
        for attr in ["tenant", "organizacion_id", "tenantId"]:
            v = ud.get(attr)
            if v:
                try:
                    return ObjectId(str(v))
                except Exception:
                    continue
    except Exception:
        pass
    # fallback users doc
    for campo in ["tenant", "organizacion_id", "tenantId", "tenant_id"]:
        v = user_doc.get(campo)
        if isinstance(v, ObjectId):
            return v
        if isinstance(v, str) and len(v) == 24 and ObjectId.is_valid(v):
            return ObjectId(v)
    return None


def _me_safe_int(obj: Any, key: str, default: int = 0) -> int:
    if not isinstance(obj, dict):
        return default
    try:
        v = obj.get(key)
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


@router.get(
    "/users/me/enriched",
    summary="Perfil enriquecido del usuario autenticado (click avatar)",
    operation_id="admin_compat_users_me_enriched",
)
async def get_users_me_enriched(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    uid_str = str(getattr(_user, "id", None) or "")
    if not uid_str or not ObjectId.is_valid(uid_str):
        raise HTTPException(400, detail="USER_ID_INVALIDO")
    uid_oid = ObjectId(uid_str)
    user_doc = await db["users"].find_one({"_id": uid_oid})
    if not user_doc:
        raise HTTPException(404, detail="USER_NOT_FOUND")

    email_s = str(user_doc.get("email") or "")
    name_s = str(
        user_doc.get("name") or user_doc.get("fullname") or user_doc.get("nombre") or f"User {uid_str[-6:]}"
    )
    role_s = str(user_doc.get("role") or user_doc.get("legacy_role") or "")
    is_super = _historical_is_super(_user)

    org_oid = await _me_resolve_org(_user, user_doc)
    org_doc: Optional[dict] = None
    if org_oid is not None:
        org_doc = await db["tenants"].find_one({"_id": org_oid})

    pool_doc: Optional[dict] = None
    if org_oid is not None:
        pool_doc = await db["pool_creditos_organizacion"].find_one({"organizacion_id": org_oid})

    # --- Permisos (catalogo 31 + usuario_rol + usuario_permiso_override) ---
    cat_raw = await db["permisos"].find({}).to_list(length=200)
    cat_cod_perm: dict[str, dict[str, Any]] = {}
    for p in cat_raw:
        cod = str(p.get("codigo") or "")
        if cod:
            cat_cod_perm[cod] = p
    # permisos por rol
    cod_roles: set[str] = set()
    for ur in await db["usuario_rol"].find({"usuario_id": uid_oid}).to_list(length=50):
        rc = str(ur.get("rol_codigo") or "")
        if not rc:
            continue
        for rp in await db["rol_permiso"].find({"rol_codigo": rc}).to_list(length=100):
            pc = str(rp.get("permiso_codigo") or "")
            if pc:
                cod_roles.add(pc)
    # overrides grant/deny
    overrides_grant: set[str] = set()
    overrides_deny: set[str] = set()
    for ov in await db["usuario_permiso_override"].find({"usuario_id": uid_oid}).to_list(length=200):
        pc = str(ov.get("permiso_codigo") or "")
        if not pc:
            continue
        tipo = str(ov.get("tipo_override") or "").upper()
        if tipo == "GRANT":
            overrides_grant.add(pc)
        elif tipo == "DENY":
            overrides_deny.add(pc)
    if is_super:
        cods_final_set: set[str] = set(cat_cod_perm.keys())
    else:
        cods_final_set = (cod_roles | overrides_grant) - overrides_deny
    permisos_lista: list[dict[str, Any]] = []
    for cod in sorted(list(cods_final_set)):
        meta = cat_cod_perm.get(cod) or {}
        sens = False
        if isinstance(meta, dict):
            sens = bool(meta.get("es_sensible") or meta.get("sensible"))
        permisos_lista.append({
            "codigo": cod,
            "categoria": str((meta or {}).get("categoria") or (meta or {}).get("category") or ""),
            "es_sensible": sens,
            "descripcion": str((meta or {}).get("descripcion") or (meta or {}).get("description") or ""),
        })
    permisos_lista.sort(key=lambda x: (0 if x["es_sensible"] else 1, x["codigo"]))

    # --- Historial consultas stats ---
    hist_stats: dict[str, Any] | None = None
    coll_names = await db.list_collection_names()
    if "consulta_history" in coll_names:
        q_hist_org: dict[str, Any] = {}
        if org_oid is not None:
            org_str = str(org_oid)
            q_hist_org["$or"] = [
                {"tenantId": {"$in": [org_oid, org_str]}},
                {"organizacion_id": {"$in": [org_oid, org_str]}},
                {"tenant_id": {"$in": [org_oid, org_str]}},
            ]
        q_hist_user: dict[str, Any] = dict(q_hist_org)
        extra_user_or = [
            {"userId": {"$in": [uid_oid, str(uid_oid)]}},
            {"user_id": {"$in": [uid_oid, str(uid_oid)]}},
        ]
        if "$or" in q_hist_user and isinstance(q_hist_user["$or"], list):
            q_hist_user["$and"] = [{"$or": q_hist_user.pop("$or")}, {"$or": extra_user_or}]
        else:
            q_hist_user["$or"] = extra_user_or
        try:
            user_cnt = await db["consulta_history"].count_documents(q_hist_user)
        except Exception:
            user_cnt = 0
        user_creds = 0
        try:
            async for hd in db["consulta_history"].find(q_hist_user, {"creditsUsed": 1}):
                try:
                    user_creds += int(hd.get("creditsUsed") or 0)
                except Exception:
                    pass
        except Exception:
            pass
        org_cnt = 0
        try:
            if is_super and (not q_hist_org or len(q_hist_org) == 0):
                org_cnt = await db["consulta_history"].count_documents({})
            else:
                org_cnt = await db["consulta_history"].count_documents(q_hist_org or {})
        except Exception:
            org_cnt = 0
        hist_stats = {
            "totalConsultasUsuario": int(user_cnt),
            "totalCreditsUsedHistorial": int(user_creds),
            "totalConsultasOrganizacion": int(org_cnt),
        }

    # --- Auditorias ultimas 10 ---
    auds: list[dict[str, Any]] = []
    try:
        q_aud: dict[str, Any] = {}
        if not is_super:
            org_str = str(org_oid) if org_oid is not None else None
            or_aud: list[dict[str, Any]] = [
                {"usuario_id": {"$in": [uid_oid, str(uid_oid)]}},
                {"usuario_email": {"$regex": re.escape(email_s), "$options": "i"}},
            ]
            if org_oid is not None and org_str:
                or_aud.extend([
                    {"organizacion_id": {"$in": [org_oid, org_str]}},
                    {"tenant_id": {"$in": [org_oid, org_str]}},
                    {"entidad_id": org_str},
                ])
            q_aud["$or"] = or_aud
        cursor_aud = db["auditoria_log"].find(q_aud).sort([("ts", -1), ("_id", -1)]).limit(10)
        async for ad in cursor_aud:
            ts_raw = ad.get("ts")
            ts_s = ts_raw.isoformat() if isinstance(ts_raw, dt.datetime) else str(ts_raw or "")
            auds.append({
                "ts": ts_s,
                "accion": str(ad.get("accion") or ""),
                "permitir": bool(ad.get("permitir")),
                "permiso_origen": str(ad.get("permiso_origen") or ""),
                "paso_fallido": str(ad.get("paso_fallido") or ""),
                "nivel_info_autorizado": str(ad.get("nivel_info_autorizado") or ""),
                "scope_match": str(ad.get("scope_match") or ""),
                "entidad_tipo": str(ad.get("entidad_tipo") or ""),
                "entidad_id": str(ad.get("entidad_id") or ""),
                "motivo_denegacion": str(ad.get("motivo_denegacion") or ""),
            })
    except Exception:
        pass

    # --- Plan/Pool info ---
    plan_info: dict[str, Any] = {
        "plan_codigo": "",
        "nombre_plan": "",
        "nivel_pool_plan": 0,
        "creditos_mensuales_org": 0,
        "saldo_actual": 0,
        "creditos_usados": 0,
        "overshoot_actual": 0,
        "overshoot_pct_max": 150,
        "fecha_actualizacion": None,
    }
    if pool_doc and isinstance(pool_doc, dict):
        for k in list(plan_info.keys()):
            if k in pool_doc and pool_doc[k] is not None:
                v = pool_doc[k]
                if isinstance(v, dt.datetime):
                    plan_info[k] = v.isoformat()
                elif isinstance(v, ObjectId):
                    plan_info[k] = str(v)
                else:
                    try:
                        if k in ("overshoot_pct_max", "nivel_pool_plan", "creditos_mensuales_org",
                                 "saldo_actual", "creditos_usados", "overshoot_actual"):
                            plan_info[k] = int(v)
                        else:
                            plan_info[k] = v
                    except Exception:
                        plan_info[k] = str(v)
    if org_doc:
        if not plan_info["plan_codigo"]:
            plan_info["plan_codigo"] = str(org_doc.get("planCodigo") or org_doc.get("plan_codigo") or "")
        if plan_info["creditos_mensuales_org"] == 0:
            plan_info["creditos_mensuales_org"] = _me_safe_int(org_doc, "totalCredits", 0)
        if plan_info["saldo_actual"] == 0:
            plan_info["saldo_actual"] = _me_safe_int(org_doc, "availableCredits", 0)

    # --- Org info ---
    org_info: dict[str, Any] | None = None
    if org_oid is not None:
        org_info = {
            "_id": str(org_oid),
            "name": str(org_doc.get("name") if org_doc else "" or ""),
            "isActive": bool(org_doc.get("isActive") if org_doc and org_doc.get("isActive") is not None else True),
            "usuariosCount": 0,
            "evaluacionesUsadas": 0,
            "planCodigo": str(org_doc.get("planCodigo") if org_doc else "" or plan_info["plan_codigo"] or ""),
        }
        try:
            q_users: dict[str, Any] = {}
            org_str = str(org_oid)
            q_users["$or"] = [
                {"tenant": org_oid},
                {"organizacion_id": org_oid},
                {"tenantId": {"$in": [org_oid, org_str]}},
            ]
            org_info["usuariosCount"] = await db["users"].count_documents(q_users)
        except Exception:
            pass
        try:
            eval_cnt = 0
            for col_n in ["evaluationresults", "results"]:
                if col_n in coll_names:
                    q_eval: dict[str, Any] = {"$or": [
                        {"tenantId": org_oid},
                        {"organizacion_id": org_oid},
                        {"tenantId": str(org_oid)},
                    ]}
                    try:
                        eval_cnt += await db[col_n].count_documents(q_eval)
                    except Exception:
                        pass
            org_info["evaluacionesUsadas"] = eval_cnt
        except Exception:
            pass

    created_at_raw = user_doc.get("createdAt") or user_doc.get("created_at") or uid_oid.generation_time
    created_at_s = created_at_raw.isoformat() if isinstance(created_at_raw, dt.datetime) else str(created_at_raw or "")
    profile = {
        "user": {
            "_id": uid_str,
            "name": name_s,
            "email": email_s,
            "role": role_s,
            "isActive": bool(user_doc.get("isActive") if user_doc.get("isActive") is not None else True),
            "isSuperuser": is_super,
            "cacheVersion": int(user_doc.get("cache_version") or 0),
            "createdAt": created_at_s,
            "avatarInicial": str(name_s or "U")[0].upper(),
        },
        "organizacion": org_info,
        "planPool": plan_info,
        "permisos": {
            "totalPermisos": len(permisos_lista),
            "totalSensibles": sum(1 for p in permisos_lista if p["es_sensible"]),
            "lista": permisos_lista,
            "vienePorRoles": sorted(list(cod_roles)),
            "overridesGranted": sorted(list(overrides_grant)),
            "overridesDenied": sorted(list(overrides_deny)),
        },
        "historialConsultas": hist_stats,
        "auditoriasUltimas10": auds,
    }
    return jsonable(profile)


# ---------------------------------------------------------------------------
# ENDPOINT NUOVO 09/10: LISTA USERS SCOPED ALLA STESSA ORG DELL'UTENTE LOGGATO
#   GET /tenant/users
#   Permessi:
#     - SUPERUSER → vede tutti gli users ORG dello user token (o tutti se si vuole,
#       ma default scoped per sicurezza; se SUPER serve tutta la lista usa
#       /users/superadmin/all)
#     - TENANT_ADMIN → vede solo users della propria org
#     - ALTRI RUOLI (user, auditor, evaluator) → 403 FORBIDDEN
#   Filtri query: search (nombre/email/rut), role, status(active|inactive)
#   Shape risposta: ARRAY User[] (stessa shape di /tenant/:id/users SUPER)
# ---------------------------------------------------------------------------

@router.get(
    "/scoped-tenant/users",
    summary="Lista utenti della stessa organizzazione dell'utente autenticato (page /tenant/users)",
    operation_id="admin_compat_scoped_tenant_my_users",
)
async def tenant_my_org_users_scoped(
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """GET /tenant/users → users della STESSA org dell'utente JWT (SCOPED)."""
    is_super = _is_superuser(_user)
    user_role_raw = str(getattr(_user, "role", "") or "").lower()
    user_roles = list(getattr(_user, "roles", []) or [])

    # ==== PRIVACY: ruoli non autorizzati → 403 ========================================
    allowed_self = {"tenant_admin", "administrador", "admin", "superadmin", "superuser"}
    has_manage = any((isinstance(r, str) and ("tenant:users:manage" in r or "admin.users" in r or "user:manage" in r or "user:create" in r)) for r in user_roles)
    if (not is_super) and (user_role_raw not in allowed_self) and (not has_manage):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="TENANT_ADMIN_OR_SUPERUSER_REQUIRED")

    # ==== 1) Resolve org dell'utente autenticato ======================================
    uid_str = str(getattr(_user, "id", None) or "")
    org_oid: Optional[ObjectId] = None
    if uid_str and ObjectId.is_valid(uid_str):
        udoc = await db["users"].find_one({"_id": ObjectId(uid_str)}, projection={"_id": 1, "tenant": 1, "organizacion_id": 1, "tenantId": 1, "organizacionId": 1})
        if udoc:
            org_oid = await _me_resolve_org(_user, udoc)

    if not org_oid and not is_super:
        # Tenant admin senza org assegnata → impossibile, ritorna []
        return []
    if not org_oid and is_super:
        # SUPERUSER senza org → default lista vuota o? Lasciamo [] per evitare leak
        return []

    # ==== 2) Build query Mongo scoped ==================================================
    org_oid_s = str(org_oid)
    q: dict[str, Any] = {"$or": [
        {"organizacion_id": org_oid},
        {"tenant": org_oid},
        {"tenantId": org_oid},
        {"tenantId": org_oid_s},
        {"organizacionId": org_oid},
        {"organizacionId": org_oid_s},
    ]}

    # --- status filter ---
    if status is not None:
        s_clean = (status or "").strip().lower()
        if s_clean == "active":
            q["isActive"] = True
        elif s_clean == "inactive":
            q["isActive"] = False

    # --- role filter ---
    if role and (role or "").strip():
        role_clean = (role or "").strip().lower()
        # match su 4 possibili campi (role, legacy_role, authz_v2.roles, roles lista)
        q["$and"] = [
            q.pop("$and", []) or {},
            {"$or": [
                {"role": {"$regex": re.escape(role_clean), "$options": "i"}},
                {"legacy_role": {"$regex": re.escape(role_clean), "$options": "i"}},
                {"authz_v2.roles": {"$elemMatch": {"$regex": re.escape(role_clean), "$options": "i"}}},
                {"roles": {"$elemMatch": {"$regex": re.escape(role_clean), "$options": "i"}}},
            ]}
        ]
        if isinstance(q.get("$and"), list):
            q["$and"] = [x for x in q["$and"] if x]
            if not q["$and"]:
                del q["$and"]

    # --- search filter (same regex di superadmin /tenant/:id/users) ------------------
    if search:
        q_clean = re.sub(r"[^0-9a-zA-ZÁÉÍÓÚáéíóúÑñÜü\s\.\-\@]", "", search or "").strip()
        if len(q_clean) >= 1:
            regex = {"$regex": re.escape(q_clean), "$options": "i"}
            q["$and"] = [
                q.pop("$and", []) or {},
                {"$or": [
                    {"name": regex},
                    {"fullname": regex},
                    {"nombre": regex},
                    {"email": regex},
                    {"rut": regex},
                    {"role": regex},
                    {"legacy_role": regex},
                ]}
            ]
            if isinstance(q.get("$and"), list):
                q["$and"] = [x for x in q["$and"] if x]
                if not q["$and"]:
                    del q["$and"]

    # ==== 3) Esegui query e serializza output =========================================
    try:
        cursor = db["users"].find(q).sort("email", 1)
        docs: list[dict[str, Any]] = await cursor.to_list(length=9999)
    except Exception as e:
        logger.error("scoped tenant users find error", extra={"err": str(e), "query_keys": sorted(q.keys())})
        raise HTTPException(500, detail="QUERY_ERROR")

    out: list[dict[str, Any]] = []
    for d in docs:
        raw_role = d.get("role") or d.get("legacy_role") or d.get("authz_v2", {}).get("roles") if isinstance(d.get("authz_v2"), dict) else d.get("role")
        d_id = d.get("_id")
        gen_t = d_id.generation_time if isinstance(d_id, ObjectId) else None
        out.append({
            "_id": str(d_id),
            "id": str(d_id),
            "name": str(d.get("name") or d.get("fullname") or d.get("nombre") or f"User {str(d_id)[-6:]}"),
            "email": str(d.get("email") or ""),
            "role": _normalize_role_frontend(raw_role),
            "isActive": bool(d.get("isActive") if d.get("isActive") is not None else True),
            "createdAt": _iso_z(d.get("createdAt") or d.get("created_at") or gen_t) or "",
        })
    return out


# ===== Pydantic Body Models: create/update user scoped tenant =====

ALLOWED_ROLES_CANONICAL = {
    "superuser", "superadmin",
    "tenant_admin", "admin", "administrador",
    "evaluator", "evaluador",
    "auditor", "read_only", "read-only", "readonly", "consulta",
    "write_only", "write-only", "writeonly", "api", "bot",
    "user", "usuario",
}

ROLES_FORBIDDEN_NON_SUPER = {"superuser", "superadmin"}
ROLE_ALIASES_TO_CANONICAL: dict[str, str] = {
    "superadmin": "superuser",
    "admin": "tenant_admin",
    "administrador": "tenant_admin",
    "evaluador": "evaluator",
    "auditor": "read_only",
    "read-only": "read_only",
    "readonly": "read_only",
    "consulta": "read_only",
    "write-only": "write_only",
    "writeonly": "write_only",
    "api": "write_only",
    "bot": "write_only",
    "usuario": "user",
}

def _canonicalize_role(raw: Any) -> str:
    s = str(raw or "").strip().lower().replace(" ", "_")
    if not s:
        return "user"
    if s in {"superuser", "tenant_admin", "evaluator", "read_only", "write_only", "user"}:
        return s
    if s in ROLE_ALIASES_TO_CANONICAL:
        return ROLE_ALIASES_TO_CANONICAL[s]
    # legacy: se contiene parole chiave
    if "super" in s:
        return "superuser"
    if "admin" in s:
        return "tenant_admin"
    if "eval" in s:
        return "evaluator"
    if "audit" in s or "read" in s or "consulta" in s:
        return "read_only"
    if "write" in s or "api" in s or "bot" in s:
        return "write_only"
    return "user"


class ScopedUserCreateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(default="evaluator")
    password: Optional[str] = Field(default=None, min_length=6)
    isActive: Optional[bool] = Field(default=None)


class ScopedUserUpdateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[str] = Field(default=None, min_length=3, max_length=320)
    role: Optional[str] = Field(default=None)
    password: Optional[str] = Field(default=None, min_length=6)
    isActive: Optional[bool] = Field(default=None)


@router.post(
    "/scoped-tenant/users",
    summary="Crea un nuovo utente SCOPED nella stessa org del chiamante (privacy: TENANT_ADMIN non può creare SUPERUSER)",
    operation_id="admin_compat_scoped_tenant_user_create",
)
async def scoped_tenant_create_user(
    body: ScopedUserCreateBody,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """POST /scoped-tenant/users → Create user. Privacy gates + role canonicalize."""
    is_super = _is_superuser(_user)
    user_role_raw = str(getattr(_user, "role", "") or "").lower()
    user_roles_list = list(getattr(_user, "roles", []) or [])
    allowed_self = {"tenant_admin", "administrador", "admin", "superadmin", "superuser"}
    has_manage_perm = any(
        isinstance(r, str) and ("tenant:users:manage" in r or "admin.users" in r or "user:manage" in r or "user:create" in r)
        for r in user_roles_list
    )
    if (not is_super) and (user_role_raw not in allowed_self) and (not has_manage_perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="ADMIN_OR_SUPERUSER_REQUIRED_TO_CREATE_USERS")

    # --- Resolve org del chiamante ---------------------------------------------------
    creator_uid = str(getattr(_user, "id", None) or "")
    creator_org_oid: Optional[ObjectId] = None
    if creator_uid and ObjectId.is_valid(creator_uid):
        cdoc = await db["users"].find_one({"_id": ObjectId(creator_uid)})
        if cdoc:
            creator_org_oid = await _me_resolve_org(_user, cdoc)

    # --- Canonicalize role + privacy SUPER gate ---------------------------------------
    canon_role = _canonicalize_role(body.role)
    if (not is_super) and (canon_role in ROLES_FORBIDDEN_NON_SUPER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="SUPERUSER_ROLE_ASSIGNMENT_REQUIRES_SUPERUSER_CREATOR")
    if not creator_org_oid and not is_super:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CREATOR_HAS_NO_ORG")

    # --- Normalize email lowercase ----------------------------------------------------
    email_clean = (body.email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_EMAIL_FORMAT")
    # --- Name min length --------------------------------------------------------------
    name_clean = (body.name or "").strip()
    if len(name_clean) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="NAME_MIN_2_CHARS")

    # --- Duplicate email --------------------------------------------------------------
    dup = await db["users"].find_one({"email": {"$regex": f"^{re.escape(email_clean)}$", "$options": "i"}})
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="EMAIL_ALREADY_EXISTS")

    # --- Password required for create (non SUPER? same, required) --------------------
    if not body.password or len(body.password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PASSWORD_MIN_6_CHARS_REQUIRED")
    pwd_hash = get_password_hash(body.password)

    # --- Build doc -------------------------------------------------------------------
    is_active_default = bool(body.isActive) if body.isActive is not None else True

    # SUPERUSER può assegnare org manuale? Per semplicità: usa creator_org_oid per default
    # Se SUPER ha org usa quella, se non ha org: il chiamante SUPER DEVE passare orgId? No per ora fallback a null.
    org_to_assign = creator_org_oid

    doc: dict[str, Any] = {
        "name": name_clean,
        "fullname": name_clean,
        "email": email_clean,
        "role": canon_role,
        "legacy_role": canon_role,
        "isActive": is_active_default,
        "passwordHash": pwd_hash,
        "password_hash": pwd_hash,
        "createdAt": dt.datetime.utcnow(),
        "created_at": dt.datetime.utcnow(),
        "cache_version": 1,
        "cacheVersion": 1,
    }
    if org_to_assign:
        doc["organizacion_id"] = org_to_assign
        doc["tenant"] = org_to_assign
        doc["tenantId"] = str(org_to_assign)
        doc["organizacionId"] = str(org_to_assign)
    # authz v2 layout minimal
    doc["authz_v2"] = {
        "roles": [canon_role],
        "overrides_grant": [],
        "overrides_deny": [],
        "confirmed_sensibles": [],
    }

    res = await db["users"].insert_one(doc)
    new_id = str(res.inserted_id)

    # Auditoría — write directo (signature RBAC authz_service.registrar_auditoria requiere EnrichedUser)
    try:
        await db["auditoria_log"].insert_one({
            "organizacion_id": org_to_assign,
            "usuario_id": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "usuario_email": getattr(_user, "email", "") or "",
            "accion": "admin.users.create",
            "entidad_tipo": "user",
            "entidad_id": ObjectId(new_id) if ObjectId.is_valid(new_id) else None,
            "ts": time.time(),
            "permitir": True,
            "paso_fallido": None,
            "motivo_denegacion": "",
            "permiso_origen": "SCOPED_TENANT_CREATE",
            "scope_match": "ORG" if org_to_assign else "NONE",
            "nivel_info_autorizado": "INFO_COMPLETA",
            "valor_anterior": None,
            "valor_nuevo": {
                "new_role": canon_role,
                "email": email_clean,
                "scoped_creator_role": user_role_raw,
            },
            "origen": "API_SCOPED_TENANT_USERS",
        })
    except Exception as _ex:
        logger.warning("audit scoped create user failed: %s", str(_ex))

    resp_body: dict[str, Any] = {
        "id": new_id,
        "_id": new_id,
        "name": name_clean,
        "email": email_clean,
        "role": canon_role,
        "isActive": is_active_default,
        "createdAt": _iso_z(doc["createdAt"]),
        "organizacion_id": str(org_to_assign) if org_to_assign else None,
    }
    return resp_body


@router.put(
    "/scoped-tenant/users/{user_id}",
    summary="Aggiorna utente nella stessa org. Privacy: TENANT_ADMIN non può promuovere/declassare SUPER role su altri.",
    operation_id="admin_compat_scoped_tenant_user_update",
)
async def scoped_tenant_update_user(
    user_id: str,
    body: ScopedUserUpdateBody,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PUT /scoped-tenant/users/{id} → Update user con privacy scoped + super-gate."""
    if not (user_id and ObjectId.is_valid(user_id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_USER_ID_OID")

    is_super = _is_superuser(_user)
    user_role_raw = str(getattr(_user, "role", "") or "").lower()
    user_roles_list = list(getattr(_user, "roles", []) or [])
    allowed_self = {"tenant_admin", "administrador", "admin", "superadmin", "superuser"}
    has_manage_perm = any(
        isinstance(r, str) and ("tenant:users:manage" in r or "admin.users" in r or "user:manage" in r or "user:update" in r)
        for r in user_roles_list
    )
    if (not is_super) and (user_role_raw not in allowed_self) and (not has_manage_perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="ADMIN_OR_SUPERUSER_REQUIRED_TO_UPDATE_USERS")

    # --- Resolve org chiamante
    creator_uid = str(getattr(_user, "id", None) or "")
    creator_org_oid: Optional[ObjectId] = None
    if creator_uid and ObjectId.is_valid(creator_uid):
        cdoc = await db["users"].find_one({"_id": ObjectId(creator_uid)})
        if cdoc:
            creator_org_oid = await _me_resolve_org(_user, cdoc)

    # --- Find target user
    target_oid = ObjectId(user_id)
    target = await db["users"].find_one({"_id": target_oid})
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")

    # --- Privacy ORG: TENANT_ADMIN può modificare SOLO utenti della STESSA org
    target_org_oid: Optional[ObjectId] = None
    for k in ("organizacion_id", "tenant", "tenantId", "organizacionId"):
        v = target.get(k)
        if isinstance(v, ObjectId):
            target_org_oid = v
            break
        if isinstance(v, str) and ObjectId.is_valid(v):
            target_org_oid = ObjectId(v)
            break
    if not is_super and creator_org_oid and target_org_oid and (str(creator_org_oid) != str(target_org_oid)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CROSS_ORG_EDIT_FORBIDDEN_NOT_SUPER")
    if not is_super and creator_org_oid and (not target_org_oid):
        # Target senza org? Blocca per non super per sicurezza
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="TARGET_HAS_NO_ORG_ASSIGN_EDIT_SUPER_REQUIRED")

    # --- Build set updates
    set_up: dict[str, Any] = {}
    if body.name is not None:
        nm = str(body.name or "").strip()
        if len(nm) < 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="NAME_MIN_2_CHARS")
        set_up["name"] = nm
        set_up["fullname"] = nm
    if body.email is not None:
        em = str(body.email or "").strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", em):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_EMAIL_FORMAT")
        # check dup (non self)
        dup = await db["users"].find_one(
            {"email": {"$regex": f"^{re.escape(em)}$", "$options": "i"}, "_id": {"$ne": target_oid}}
        )
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="EMAIL_ALREADY_EXISTS")
        set_up["email"] = em
    if body.role is not None:
        canon_role = _canonicalize_role(body.role)
        target_current_role = _canonicalize_role(target.get("role") or "")
        # --- SUPER ROLE privacy gates -------------------------------------------------
        # TENANT_ADMIN → NON può promuovere QUALCUNO a superuser
        if (not is_super) and (canon_role in ROLES_FORBIDDEN_NON_SUPER):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="SUPERUSER_ROLE_ASSIGNMENT_REQUIRES_SUPERUSER_CREATOR")
        # TENANT_ADMIN → NON può retrocedere o modificare UTENTI che sono GIÀ SUPERUSER (declassare)
        if (not is_super) and (target_current_role in ROLES_FORBIDDEN_NON_SUPER):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CANNOT_DEMOTE_SUPERUSER_REQUIRES_SUPER_CREATOR")
        set_up["role"] = canon_role
        set_up["legacy_role"] = canon_role
        # authz_v2.roles[0] = canon_role (sovrascrivi il primo, lista vuota → appendi)
        av2: dict[str, Any] = target.get("authz_v2") or {}
        cur_roles = list(av2.get("roles") or [])
        if not cur_roles:
            cur_roles = [canon_role]
        else:
            cur_roles[0] = canon_role
        av2["roles"] = cur_roles
        set_up["authz_v2"] = av2
    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PASSWORD_MIN_6_CHARS")
        ph = get_password_hash(body.password)
        set_up["password"] = ph
        set_up["passwordHash"] = ph
        set_up["password_hash"] = ph
    if body.isActive is not None:
        set_up["isActive"] = bool(body.isActive)
    # Update cache version
    cur_cache = int(target.get("cache_version") or target.get("cacheVersion") or 0)
    set_up["cache_version"] = cur_cache + 1
    set_up["cacheVersion"] = cur_cache + 1
    set_up["updatedAt"] = dt.datetime.utcnow()
    set_up["updated_at"] = dt.datetime.utcnow()

    if set_up:
        upd_res = await db["users"].update_one({"_id": target_oid}, {"$set": set_up})
        if upd_res.matched_count != 1:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="USER_UPDATE_FAILED")

    # Merge updated doc
    merged = dict(target)
    merged.update(set_up)
    final_role = _canonicalize_role(merged.get("role") or "")
    fields_changed = sorted(set(set_up.keys()) - {"cache_version", "cacheVersion", "updatedAt", "updated_at"})
    try:
        target_oid = ObjectId(user_id) if (user_id and ObjectId.is_valid(user_id)) else None
        await db["auditoria_log"].insert_one({
            "organizacion_id": creator_org_oid,
            "usuario_id": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "usuario_email": getattr(_user, "email", "") or "",
            "accion": "admin.users.update",
            "entidad_tipo": "user",
            "entidad_id": target_oid,
            "ts": time.time(),
            "permitir": True,
            "paso_fallido": None,
            "motivo_denegacion": "",
            "permiso_origen": "SCOPED_TENANT_UPDATE",
            "scope_match": "ORG" if creator_org_oid else "NONE",
            "nivel_info_autorizado": "INFO_COMPLETA",
            "valor_anterior": None,
            "valor_nuevo": {
                "fields_changed": fields_changed,
                "scoped_creator_role": user_role_raw,
                "final_role": final_role,
            },
            "origen": "API_SCOPED_TENANT_USERS",
        })
    except Exception as _ex:
        logger.warning("audit scoped update user failed: %s", str(_ex))

    out: dict[str, Any] = {
        "id": user_id,
        "_id": user_id,
        "name": str(merged.get("name") or ""),
        "email": str(merged.get("email") or ""),
        "role": final_role,
        "isActive": bool(merged.get("isActive") if merged.get("isActive") is not None else True),
        "createdAt": _iso_z(merged.get("createdAt") or merged.get("created_at")),
    }
    return out


# ---------------------------------------------------------------------------
# ENDPOINT 11.10: RESET PASSWORD TENANT-SCOPED (TENANT_ADMIN resetta password utenti della sua org)
# ---------------------------------------------------------------------------


@router.patch(
    "/scoped-tenant/users/{user_id}/reset-password",
    summary="TENANT_ADMIN resetea contraseña de usuario de su misma organización",
    operation_id="admin_compat_scoped_tenant_reset_password",
)
async def scoped_tenant_reset_password(
    user_id: str,
    body: _SuperadminResetPasswordIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PATCH /scoped-tenant/users/{id}/reset-password → Reset password tenant-scoped.
       Gates: (1) ADMIN_OR_SUPERUSER_REQUIRED 403; (2) INVALID_USER_ID 400;
              (3) NON_AUTO_RESET 400; (4) USER_NOT_FOUND 404;
              (5) CROSS_ORG_FORBIDDEN 403 (tenant admin resetta solo utenti stessa org);
              (6) CANNOT_RESET_SUPERUSER 403 (solo superuser può resettare superuser);
              (7) NEW_PASSWORD_INVALID 422 (min 6 chars).
       Side effects: set campo 'password' (usato da login) + cache_version + 2 (invalida JWT)."""
    is_super = _is_superuser(_user)
    user_role_raw = str(getattr(_user, "role", "") or "").lower()
    user_roles_list = list(getattr(_user, "roles", []) or [])
    allowed_self = {"tenant_admin", "administrador", "admin", "superadmin", "superuser"}
    has_manage_perm = any(
        isinstance(r, str) and ("tenant:users:manage" in r or "admin.users" in r or "user:manage" in r or "user:update" in r)
        for r in user_roles_list
    )
    if (not is_super) and (user_role_raw not in allowed_self) and (not has_manage_perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="ADMIN_OR_SUPERUSER_REQUIRED_TO_RESET_PASSWORD")

    if not (user_id and ObjectId.is_valid(user_id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_USER_ID_OID")

    creator_uid = str(getattr(_user, "id", None) or "")
    if str(user_id) == creator_uid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="NON_AUTO_RESET_USE_CHANGE_PASSWORD")

    new_pwd = (body.newPassword or "").strip()
    if len(new_pwd) < 6 or len(new_pwd) > 128:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="NEW_PASSWORD_INVALID")

    # Resolve org chiamante
    creator_org_oid: Optional[ObjectId] = None
    if creator_uid and ObjectId.is_valid(creator_uid):
        cdoc = await db["users"].find_one({"_id": ObjectId(creator_uid)})
        if cdoc:
            creator_org_oid = await _me_resolve_org(_user, cdoc)

    # Find target user
    target_oid = ObjectId(user_id)
    target = await db["users"].find_one({"_id": target_oid}, {"_id": 1, "email": 1, "role": 1, "cache_version": 1, "organizacion_id": 1, "tenant": 1, "tenantId": 1, "organizacionId": 1})
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")

    # Privacy ORG: TENANT_ADMIN resetta SOLO utenti della STESSA org
    target_org_oid: Optional[ObjectId] = None
    for k in ("organizacion_id", "tenant", "tenantId", "organizacionId"):
        v = target.get(k)
        if isinstance(v, ObjectId):
            target_org_oid = v
            break
        if isinstance(v, str) and ObjectId.is_valid(v):
            target_org_oid = ObjectId(v)
            break
    if not is_super and creator_org_oid and target_org_oid and (str(creator_org_oid) != str(target_org_oid)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CROSS_ORG_RESET_FORBIDDEN_NOT_SUPER")
    if not is_super and creator_org_oid and (not target_org_oid):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="TARGET_HAS_NO_ORG_RESET_SUPER_REQUIRED")

    # SUPERUSER role gate: TENANT_ADMIN NON può resettare password di SUPERUSER
    target_role = _canonicalize_role(target.get("role") or "")
    if (not is_super) and (target_role in ROLES_FORBIDDEN_NON_SUPER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CANNOT_RESET_SUPERUSER_REQUIRES_SUPER_CREATOR")

    # Hash + update (campo 'password' è quello usato dal login)
    hashed = get_password_hash(new_pwd)
    cur_cache = int(target.get("cache_version") or target.get("cacheVersion") or 0)
    new_cache = cur_cache + 2
    now = dt.datetime.utcnow()
    await db["users"].update_one(
        {"_id": target_oid},
        {"$set": {
            "password": hashed,
            "passwordHash": hashed,
            "password_hash": hashed,
            "updatedAt": now,
            "updated_at": now,
            "cache_version": new_cache,
            "cacheVersion": new_cache,
            "lastPasswordResetBy": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "lastPasswordResetAt": now,
        }}
    )

    # Audit log diretto (stesso pattern di POST/PUT scoped)
    try:
        await db["auditoria_log"].insert_one({
            "organizacion_id": creator_org_oid,
            "usuario_id": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "usuario_email": getattr(_user, "email", "") or "",
            "accion": "admin.users.reset_password",
            "entidad_tipo": "user",
            "entidad_id": target_oid,
            "ts": time.time(),
            "permitir": True,
            "paso_fallido": None,
            "motivo_denegacion": "",
            "permiso_origen": "SCOPED_TENANT_RESET_PASSWORD",
            "scope_match": "ORG" if creator_org_oid else "NONE",
            "nivel_info_autorizado": "INFO_COMPLETA",
            "valor_anterior": {"cache_version": cur_cache},
            "valor_nuevo": {"cache_version": new_cache, "password_changed": True},
            "origen": "API_SCOPED_TENANT_USERS",
        })
    except Exception as _ex:
        logger.warning("audit scoped reset password failed: %s", str(_ex))

    return {
        "ok": True,
        "_id": user_id,
        "email": target.get("email"),
        "cache_version_bumped_to": new_cache,
    }


# ---------------------------------------------------------------------------
# ENDPOINT 11.10: RESET PASSWORD TENANT-SCOPED (TENANT_ADMIN resetta password utenti della sua org)
# ---------------------------------------------------------------------------


@router.patch(
    "/scoped-tenant/users/{user_id}/reset-password",
    summary="TENANT_ADMIN resetea contraseña de usuario de su misma organización",
    operation_id="admin_compat_scoped_tenant_reset_password",
)
async def scoped_tenant_reset_password(
    user_id: str,
    body: _SuperadminResetPasswordIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """PATCH /scoped-tenant/users/{id}/reset-password → Reset password tenant-scoped.
       Gates: (1) ADMIN_OR_SUPERUSER_REQUIRED 403; (2) INVALID_USER_ID 400;
              (3) NON_AUTO_RESET 400; (4) USER_NOT_FOUND 404;
              (5) CROSS_ORG_FORBIDDEN 403 (tenant admin resetta solo utenti stessa org);
              (6) CANNOT_RESET_SUPERUSER 403 (solo superuser può resettare superuser);
              (7) NEW_PASSWORD_INVALID 422 (min 6 chars).
       Side effects: set campo 'password' (usato da login) + cache_version + 2 (invalida JWT)."""
    is_super = _is_superuser(_user)
    user_role_raw = str(getattr(_user, "role", "") or "").lower()
    user_roles_list = list(getattr(_user, "roles", []) or [])
    allowed_self = {"tenant_admin", "administrador", "admin", "superadmin", "superuser"}
    has_manage_perm = any(
        isinstance(r, str) and ("tenant:users:manage" in r or "admin.users" in r or "user:manage" in r or "user:update" in r)
        for r in user_roles_list
    )
    if (not is_super) and (user_role_raw not in allowed_self) and (not has_manage_perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="ADMIN_OR_SUPERUSER_REQUIRED_TO_RESET_PASSWORD")

    if not (user_id and ObjectId.is_valid(user_id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_USER_ID_OID")

    creator_uid = str(getattr(_user, "id", None) or "")
    if str(user_id) == creator_uid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="NON_AUTO_RESET_USE_CHANGE_PASSWORD")

    new_pwd = (body.newPassword or "").strip()
    if len(new_pwd) < 6 or len(new_pwd) > 128:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="NEW_PASSWORD_INVALID")

    # Resolve org chiamante
    creator_org_oid: Optional[ObjectId] = None
    if creator_uid and ObjectId.is_valid(creator_uid):
        cdoc = await db["users"].find_one({"_id": ObjectId(creator_uid)})
        if cdoc:
            creator_org_oid = await _me_resolve_org(_user, cdoc)

    # Find target user
    target_oid = ObjectId(user_id)
    target = await db["users"].find_one({"_id": target_oid}, {"_id": 1, "email": 1, "role": 1, "cache_version": 1, "organizacion_id": 1, "tenant": 1, "tenantId": 1, "organizacionId": 1})
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="USER_NOT_FOUND")

    # Privacy ORG: TENANT_ADMIN resetta SOLO utenti della STESSA org
    target_org_oid: Optional[ObjectId] = None
    for k in ("organizacion_id", "tenant", "tenantId", "organizacionId"):
        v = target.get(k)
        if isinstance(v, ObjectId):
            target_org_oid = v
            break
        if isinstance(v, str) and ObjectId.is_valid(v):
            target_org_oid = ObjectId(v)
            break
    if not is_super and creator_org_oid and target_org_oid and (str(creator_org_oid) != str(target_org_oid)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CROSS_ORG_RESET_FORBIDDEN_NOT_SUPER")
    if not is_super and creator_org_oid and (not target_org_oid):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="TARGET_HAS_NO_ORG_RESET_SUPER_REQUIRED")

    # SUPERUSER role gate: TENANT_ADMIN NON può resettare password di SUPERUSER
    target_role = _canonicalize_role(target.get("role") or "")
    if (not is_super) and (target_role in ROLES_FORBIDDEN_NON_SUPER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CANNOT_RESET_SUPERUSER_REQUIRES_SUPER_CREATOR")

    # Hash + update (campo 'password' è quello usato dal login)
    hashed = get_password_hash(new_pwd)
    cur_cache = int(target.get("cache_version") or target.get("cacheVersion") or 0)
    new_cache = cur_cache + 2
    now = dt.datetime.utcnow()
    await db["users"].update_one(
        {"_id": target_oid},
        {"$set": {
            "password": hashed,
            "passwordHash": hashed,
            "password_hash": hashed,
            "updatedAt": now,
            "updated_at": now,
            "cache_version": new_cache,
            "cacheVersion": new_cache,
            "lastPasswordResetBy": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "lastPasswordResetAt": now,
        }}
    )

    # Audit log diretto (stesso pattern di POST/PUT scoped)
    try:
        await db["auditoria_log"].insert_one({
            "organizacion_id": creator_org_oid,
            "usuario_id": ObjectId(creator_uid) if (creator_uid and ObjectId.is_valid(creator_uid)) else None,
            "usuario_email": getattr(_user, "email", "") or "",
            "accion": "admin.users.reset_password",
            "entidad_tipo": "user",
            "entidad_id": target_oid,
            "ts": time.time(),
            "permitir": True,
            "paso_fallido": None,
            "motivo_denegacion": "",
            "permiso_origen": "SCOPED_TENANT_RESET_PASSWORD",
            "scope_match": "ORG" if creator_org_oid else "NONE",
            "nivel_info_autorizado": "INFO_COMPLETA",
            "valor_anterior": {"cache_version": cur_cache},
            "valor_nuevo": {"cache_version": new_cache, "password_changed": True},
            "origen": "API_SCOPED_TENANT_USERS",
        })
    except Exception as _ex:
        logger.warning("audit scoped reset password failed: %s", str(_ex))

    return {
        "ok": True,
        "_id": user_id,
        "email": target.get("email"),
        "cache_version_bumped_to": new_cache,
    }


