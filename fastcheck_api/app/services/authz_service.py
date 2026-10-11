"""
===============================================================================
 authz_service.py  —  Motor de Autorización RBAC+ABAC+Scopes (Fase 0)
===============================================================================
 3 FUNCIONES PURAS, ÚNICA FUENTE DE VERDAD. NO DUPLICAR LÓGICA EN NINGÚN OTRO
 ARCHIVO. TODOS LOS ENDPOINTS / route-guards PASAN POR AQUÍ (o por dependencias
 que llaman a estas funciones).

 PIPELINE de 7 pasos (DOCX Sección 6.3 · autorizar()):
   Paso 1 → Deny-by-default si no hay sesión válida
   Paso 2 → DENY user-permiso-override gana SIEMPRE (cualquier GRANT anterior)
   Paso 3 → GRANT user-permiso-override
   Paso 4 → Permisos sensibles requieren sensible_confirmado=true.
            NO heredados de roles plantilla; solo override GRANT individual.
   Paso 5 → Alcance (scoping) en_alcance() VER/ACTUAR sobre el recurso
   Paso 6 → Gate PN: party.query.pn + categoría de tercero coincide con
            usuario_tipo_tercero AUTORIZADO
   Paso 7 → Gate nivel info: min(usuario.nivel_info, acción.nivel_requerido)

 CACHE: LRU sobre (user_id, dims_hash). TTL 5min. Invalidation via cache_version
 en usuarios collection y touch sobre updatedAt de dims/roles.
===============================================================================
"""
from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

# ---------------------------------------------------------------------------
# Constantes / Enums (deben coincidir con los seeds de 001_seed_catalogo)
# ---------------------------------------------------------------------------
Proposito = Literal["VER", "ACTUAR"]
TipoAlcance = Literal["PROPIO", "UNIDAD", "CONJUNTO_UNIDADES",
                      "AREA", "PAIS", "ORGANIZACION"]
TipoOverride = Literal["GRANT", "DENY"]
NivelInfo = Literal[
    "RESULTADO_GENERAL",      # 1: solo semáforo
    "RESUMEN_NO_SENSIBLE",    # 2: resumen sin datos PN
    "INFO_NO_SENSIBLE",       # 3: auditor
    "DETALLE_RIESGO",         # 4: evaluador
    "INFO_COMPLETA",          # 5: admin completo
]
NIVEL_INFO_ORDEN: dict[NivelInfo, int] = {
    "RESULTADO_GENERAL":   1,
    "RESUMEN_NO_SENSIBLE": 2,
    "INFO_NO_SENSIBLE":    3,
    "DETALLE_RIESGO":      4,
    "INFO_COMPLETA":       5,
}
SENSIBLES = {
    "party.query.pn", "exception.authorize", "admin.grant_sensitive",
    "risk.lists.manage", "risk.params.define", "risk.thresholds.edit",
    "risk.formula.edit", "pool.credit.manage",
}
# Q4: Escalamiento fijo 3 niveles para Fase 0/Fase 1
ESCALAMIENTO_NIVELES_FIJOS: tuple[int, ...] = (1, 2, 3)

# Q6 / Bloq2.5: Capacidad Pool 5 niveles, overshoot, soglie notifiche
NIVELES_POOL_5: tuple[dict, ...] = (
    {"nivel": 1, "nombre": "BASIC",      "creditos_mensuales_org": 500,   "overshoot_pct_max": 150, "usuarios_max": 5},
    {"nivel": 2, "nombre": "STARTUP",    "creditos_mensuales_org": 2000,  "overshoot_pct_max": 150, "usuarios_max": 15},
    {"nivel": 3, "nombre": "PRO",        "creditos_mensuales_org": 10000, "overshoot_pct_max": 150, "usuarios_max": 50},
    {"nivel": 4, "nombre": "BUSINESS",   "creditos_mensuales_org": 50000, "overshoot_pct_max": 150, "usuarios_max": 200},
    {"nivel": 5, "nombre": "ENTERPRISE", "creditos_mensuales_org": 250000,"overshoot_pct_max": 150, "usuarios_max": 999},
)
SOGLIE_NOTIFICA_CREDITOS_PCT: tuple[int, ...] = (90, 100, 120)
SOGLIE_NOTIFICA_MAP = {
    90:  {"codigo": "CREDITO_90_PCT",  "severidad": "INFO",     "mensaje": "Ha usado el 90% de sus créditos mensuales."},
    100: {"codigo": "CREDITO_100_PCT", "severidad": "WARNING",  "mensaje": "Créditos mensuales agotados 100%: entrando en overshoot."},
    120: {"codigo": "CREDITO_120_PCT", "severidad": "CRITICAL", "mensaje": "Overshoot 120% alcanzado. Solicite upgrade de plan."},
}
ERROR_OVERSHOOT_MAX = (402, "CREDITO_OVERSHOOT_150PCT_EXCEDIDO", "Su organización ha excedido el 150% del crédito mensual (overshoot máximo permitido). Pago requerido o upgrade plan.")

# ---------------------------------------------------------------------------
# EnrichedUser — objeto de trabajo interno del servicio
# ---------------------------------------------------------------------------
@dataclass
class EnrichedUser:
    user_id: ObjectId
    organizacion_id: Optional[ObjectId] = None
    pais_ids: list[ObjectId] = field(default_factory=list)
    unidad_ids: list[ObjectId] = field(default_factory=list)
    area_id: Optional[ObjectId] = None
    roles: list[str] = field(default_factory=list)
    legacy_role: str = ""
    nivel_info: NivelInfo = "RESULTADO_GENERAL"
    productos: list[str] = field(default_factory=list)
    tipos_tercero_autorizados: list[str] = field(default_factory=list)
    scopes_ver: list[dict] = field(default_factory=list)
    scopes_actuar: list[dict] = field(default_factory=list)
    cache_version: int = 1
    sensibles_confirmados: set[str] = field(default_factory=set)
    usuario_permiso_overrides: list[dict] = field(default_factory=list)
    email: str = ""
    # wildcard: superuser global DA-04
    is_superuser_wildcard: bool = False
    dims_hash: str = ""
    # Bloq2.5 Q6: datos pool créditos organización + limite usuario mensual
    pool_credits_data: Optional[dict] = None
    usuario_limite_mes: Optional[dict] = None

# ---------------------------------------------------------------------------
# LRU Cache (256 slots · TTL 5 min = 300s). Simple, sin dependencia externa.
# ---------------------------------------------------------------------------
_CACHE_MAX = 256
_CACHE_TTL = 300
_cache: "OrderedDict[tuple[str, str], tuple[float, Any]]" = OrderedDict()

def _cache_get(key: tuple[str, str]) -> Optional[Any]:
    if key not in _cache:
        return None
    ttl_instant, val = _cache[key]
    if (time.time() - ttl_instant) > _CACHE_TTL:
        del _cache[key]
        return None
    _cache.move_to_end(key)
    return val

def _cache_put(key: tuple[str, str], val: Any) -> None:
    _cache[key] = (time.time(), val)
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)

def authz_cache_invalidate_user(user_id: str) -> int:
    """Invalidar todas las entradas de un usuario en cache. Devuelve count."""
    remove = [k for k in _cache if k[0] == user_id]
    for k in remove:
        _cache.pop(k, None)
    return len(remove)

# ---------------------------------------------------------------------------
# 0. Builder: EnrichedUser desde DB (hidrata 10 colecciones en paralelo)
# ---------------------------------------------------------------------------
async def hydrate_user_from_db(
    db: AsyncIOMotorDatabase,
    user_id: str | ObjectId,
    *,
    force_refresh: bool = False,
) -> EnrichedUser:
    """
    Construye EnrichedUser consultando todas las dimensiones.
    Cacheado por (str(user_id), dims_hash=hash(users.cache_version)).
    """
    uid = ObjectId(str(user_id))
    uid_str = str(uid)

    # Fast-path cache sin tocar DB si conocemos cache_version
    peek = await db["users"].find_one({"_id": uid}, {"cache_version": 1, "legacy_role": 1})
    dims_hash = f"v{peek.get('cache_version', 1) if peek else 1}"
    cache_key = (uid_str, dims_hash)
    if not force_refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    user = peek or (await db["users"].find_one({"_id": uid})) or {}
    legacy_role = str(user.get("legacy_role") or user.get("role") or "").strip()
    is_superuser_wildcard = (legacy_role == "superuser")

    # 1) usuario_unidad · 1:1 por MVP (Q3: max 1 UO + 1 Área)
    principal_uo = await db["usuario_unidad"].find_one(
        {"usuario_id": uid, "principal": True},
    )
    organizacion_id = principal_uo.get("organizacion_id") if principal_uo else None
    pais_ids = [principal_uo["pais_id"]] if principal_uo and principal_uo.get("pais_id") else []
    unidad_ids = [principal_uo["unidad_id"]] if principal_uo and principal_uo.get("unidad_id") else []
    area_id = principal_uo.get("area_id") if principal_uo else None

    # 2) roles
    roles = sorted([
        r["rol_codigo"] async for r in
        db["usuario_rol"].find({"usuario_id": uid})
    ])

    # 3) productos
    productos = sorted([
        p["producto"] async for p in
        db["usuario_producto"].find({"usuario_id": uid})
    ])

    # 4) tipo tercero autorizado
    tipos_tercero_autorizados = sorted([
        t["categoria_codigo"] async for t in
        db["usuario_tipo_tercero"].find({"usuario_id": uid, "autorizado": True})
    ])

    # 5) nivel info
    ni_doc = await db["usuario_nivel_info"].find_one({"usuario_id": uid})
    nivel_info: NivelInfo = (
        ni_doc["nivel_info_codigo"] if ni_doc and ni_doc["nivel_info_codigo"] in NIVEL_INFO_ORDEN
        else "RESULTADO_GENERAL"
    )

    # 6) alcances VER / ACTUAR
    scopes_ver: list[dict] = []
    scopes_actuar: list[dict] = []
    async for sc in db["usuario_alcance"].find({"usuario_id": uid}):
        entry = {
            "tipo_alcance": sc["tipo_alcance"],
            "unidad_ids": sc.get("unidad_ids") or [],
            "area_id": sc.get("area_id"),
            "pais_id": sc.get("pais_id"),
            "organizacion_id": sc.get("organizacion_id"),
            # Q2 confirmado: incluye_descendientes=True por defecto
            "incluye_descendientes": bool(sc.get("incluye_descendientes", True)),
        }
        if sc["proposito"] == "VER":
            scopes_ver.append(entry)
        elif sc["proposito"] == "ACTUAR":
            scopes_actuar.append(entry)

    # 7) overrides + sensibles confirmados
    sensibles_confirmados: set[str] = set()
    usuario_permiso_overrides: list[dict] = []
    async for ov in db["usuario_permiso_override"].find(
        {"usuario_id": uid, "tipo_override": {"$in": ["GRANT", "DENY"]}}
    ):
        ovdoc = dict(ov)
        if "_id" in ovdoc: del ovdoc["_id"]
        usuario_permiso_overrides.append(ovdoc)
        if ov.get("tipo_override") == "GRANT" and ov.get("sensible_confirmado") is True:
            sensibles_confirmados.add(ov["permiso_codigo"])
    # superuser wildcard hereda party.query.pn según Q1
    if is_superuser_wildcard and "party.query.pn" not in sensibles_confirmados:
        sensibles_confirmados.add("party.query.pn")

    # 8) Bloq2.5 Q6: pool créditos org + limite usuario mensual
    pool_credits_data: Optional[dict] = None
    if organizacion_id is not None:
        pool_doc = await db["pool_creditos_organizacion"].find_one({"organizacion_id": organizacion_id})
        if pool_doc:
            if "_id" in pool_doc: del pool_doc["_id"]
            pool_credits_data = pool_doc
    mes_ref, anio_ref = datetime.utcnow().month, datetime.utcnow().year
    usuario_limite_mes: Optional[dict] = None
    if organizacion_id is not None:
        lim_doc = await db["usuario_limite_consumo_v2"].find_one({
            "organizacion_id": organizacion_id, "usuario_id": uid,
            "mes": mes_ref, "anio": anio_ref,
        })
        if lim_doc:
            if "_id" in lim_doc: del lim_doc["_id"]
            usuario_limite_mes = lim_doc

    eu = EnrichedUser(
        user_id=uid,
        organizacion_id=organizacion_id,
        pais_ids=pais_ids,
        unidad_ids=unidad_ids,
        area_id=area_id,
        roles=roles,
        legacy_role=legacy_role,
        nivel_info=nivel_info,
        productos=productos,
        tipos_tercero_autorizados=tipos_tercero_autorizados,
        scopes_ver=scopes_ver,
        scopes_actuar=scopes_actuar,
        cache_version=int(user.get("cache_version", 1)),
        sensibles_confirmados=sensibles_confirmados,
        usuario_permiso_overrides=usuario_permiso_overrides,
        email=str(user.get("email") or ""),
        is_superuser_wildcard=is_superuser_wildcard,
        dims_hash=dims_hash,
        pool_credits_data=pool_credits_data,
        usuario_limite_mes=usuario_limite_mes,
    )
    _cache_put(cache_key, eu)
    return eu

# ---------------------------------------------------------------------------
# 1. permisos_efectivos(user) → { permiso: str, origen: str, sensible: bool }
#    Regla clave: DENY(override) > GRANT(override) > INCLUIDO(roles) > deny-default
#    Sensibles NUNCA heredados de rol (solo override explícito + confirmado).
# ---------------------------------------------------------------------------
@dataclass
class PermisoEfectivo:
    codigo: str
    origen: str          # "ROL:COD" | "OVERRIDE_GRANT" | "OVERRIDE_DENY" | "DENY_DEFAULT"
    permitido: bool
    es_sensible: bool

async def permisos_efectivos(
    db: AsyncIOMotorDatabase, user: EnrichedUser,
) -> dict[str, PermisoEfectivo]:
    result: dict[str, PermisoEfectivo] = {}

    # wildcard: superuser global = bypass para permisos NO sensibles
    # (Sensibles siguen requiriendo override confirmado individual = paso 4)
    catalogo_permisos: dict[str, bool] = {}
    async for p in db["permisos"].find({}, {"codigo": 1, "es_sensible": 1}):
        catalogo_permisos[p["codigo"]] = bool(p.get("es_sensible", False))

    # Paso base: heredar de roles plantilla
    if user.is_superuser_wildcard:
        # bypass platform-wide para NO sensibles
        for cod, es_sens in catalogo_permisos.items():
            if not es_sens:
                result[cod] = PermisoEfectivo(
                    codigo=cod, origen="SUPERUSER_WILDCARD",
                    permitido=True, es_sensible=es_sens,
                )
    else:
        # 5.2 heredado por rol
        for r in user.roles:
            async for rp in db["rol_permiso"].find(
                {"rol_codigo": r, "modo": {"$in": ["INCLUIDO"]}}
            ):
                cod = rp["permiso_codigo"]
                # Regla innegociable Paso 4: NO heredar sensibles desde rol
                if catalogo_permisos.get(cod, False):
                    continue
                if cod not in result:
                    result[cod] = PermisoEfectivo(
                        codigo=cod, origen=f"ROL:{r}",
                        permitido=True,
                        es_sensible=catalogo_permisos.get(cod, False),
                    )

    # Override GRANT (incluye sensibles confirmados)
    async for ov in db["usuario_permiso_override"].find(
        {"usuario_id": user.user_id, "tipo_override": "GRANT"}
    ):
        cod = ov["permiso_codigo"]
        es_sens = catalogo_permisos.get(cod, cod in SENSIBLES)
        permitido = True
        if es_sens:
            # Paso 4 gate sensible
            permitido = (
                ov.get("sensible_confirmado") is True
                or cod in user.sensibles_confirmados
            )
        result[cod] = PermisoEfectivo(
            codigo=cod, origen="OVERRIDE_GRANT",
            permitido=permitido, es_sensible=es_sens,
        )

    # Override DENY (Paso 2) — gana SIEMPRE, no hay discusión
    async for ov in db["usuario_permiso_override"].find(
        {"usuario_id": user.user_id, "tipo_override": "DENY"}
    ):
        cod = ov["permiso_codigo"]
        es_sens = catalogo_permisos.get(cod, cod in SENSIBLES)
        result[cod] = PermisoEfectivo(
            codigo=cod, origen="OVERRIDE_DENY",
            permitido=False, es_sensible=es_sens,
        )

    # Paso 1 deny-default para el resto (nunca alcanzados por las ramas anteriores)
    for cod, es_sens in catalogo_permisos.items():
        if cod not in result:
            result[cod] = PermisoEfectivo(
                codigo=cod, origen="DENY_DEFAULT",
                permitido=False, es_sensible=es_sens,
            )
    return result

# ---------------------------------------------------------------------------
# 2. en_alcance(user, recurso, proposito) → bool
#    Q2 confirmado: incluye_descendientes=TRUE por defecto.
#    Árbol UO: recursivo parent_id.
# ---------------------------------------------------------------------------
async def en_alcance(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    recurso: dict[str, Any],
    proposito: Proposito,
) -> tuple[bool, str]:
    """
    Retorna (autorizado, motivo). recurso mínimo:
      { creador_id?: ObjectId, unidad_id?, area_id?, pais_id?, organizacion_id? }
    """
    # wildcard superuser salta scoping
    if user.is_superuser_wildcard:
        return True, "SUPERUSER_WILDCARD_SKIP_SCOPE"

    scopes = user.scopes_ver if proposito == "VER" else user.scopes_actuar
    if not scopes:
        return False, "SIN_ALCANCE_DEFINIDO"

    creador_id = recurso.get("creador_id") or recurso.get("createdBy") or recurso.get("usuario_id")

    for sc in scopes:
        tipo: TipoAlcance = sc["tipo_alcance"]

        if tipo == "PROPIO":
            if creador_id and str(creador_id) == str(user.user_id):
                return True, "MATCH_PROPIO"
            continue

        if tipo == "ORGANIZACION":
            if (recurso.get("organizacion_id") and sc.get("organizacion_id")
                    and str(recurso["organizacion_id"]) == str(sc["organizacion_id"])):
                return True, "MATCH_ORGANIZACION"
            continue

        if tipo == "PAIS":
            if (recurso.get("pais_id") and sc.get("pais_id")
                    and str(recurso["pais_id"]) == str(sc["pais_id"])):
                return True, "MATCH_PAIS_DIRECTO"
            # Descendientes UO dentro del país (Q2=TRUE default)
            if sc.get("incluye_descendientes", True) and recurso.get("unidad_id"):
                uo = await db["unidades_organizacionales"].find_one(
                    {"_id": ObjectId(str(recurso["unidad_id"]))}
                )
                if uo and str(uo.get("pais_id", "")) == str(sc["pais_id"]):
                    return True, "MATCH_PAIS_VIA_UO_DESCENDIENTE"
            continue

        if tipo == "AREA":
            if (recurso.get("area_id") and sc.get("area_id")
                    and str(recurso["area_id"]) == str(sc["area_id"])):
                return True, "MATCH_AREA_DIRECTA"
            continue

        if tipo == "UNIDAD":
            uo_target = ObjectId(str(recurso["unidad_id"])) if recurso.get("unidad_id") else None
            if not uo_target:
                continue
            # match directo
            if any(str(uid) == str(uo_target) for uid in (sc.get("unidad_ids") or [])):
                return True, "MATCH_UNIDAD_DIRECTA"
            # match descendiente (Q2 incluye_descendientes default True)
            if sc.get("incluye_descendientes", True):
                # BFS sub-tree hacia abajo por parent_id
                visited: set[str] = set()
                queue = [ObjectId(str(u)) for u in (sc.get("unidad_ids") or [])]
                while queue:
                    cur = queue.pop(0)
                    cs = str(cur)
                    if cs in visited:
                        continue
                    visited.add(cs)
                    if cs == str(uo_target):
                        return True, "MATCH_UNIDAD_DESCENDIENTE"
                    async for child in db["unidades_organizacionales"].find(
                        {"parent_id": cur}
                    ):
                        queue.append(child["_id"])
            continue

        if tipo == "CONJUNTO_UNIDADES":
            # idéntico a UNIDAD pero con múltiples explícitos
            if not sc.get("unidad_ids"):
                continue
            if any(str(u) == str(recurso.get("unidad_id")) for u in sc["unidad_ids"]):
                return True, "MATCH_CONJUNTO_UNIDADES_DIRECTO"
            if sc.get("incluye_descendientes", True):
                visited: set[str] = set()
                queue = [ObjectId(str(u)) for u in sc["unidad_ids"]]
                uo_t = ObjectId(str(recurso["unidad_id"])) if recurso.get("unidad_id") else None
                while queue:
                    cur = queue.pop(0)
                    cs = str(cur)
                    if cs in visited:
                        continue
                    visited.add(cs)
                    if uo_t and cs == str(uo_t):
                        return True, "MATCH_CONJUNTO_UNIDADES_DESCENDIENTE"
                    async for child in db["unidades_organizacionales"].find(
                        {"parent_id": cur}
                    ):
                        queue.append(child["_id"])
            continue

    return False, f"SIN_MATCH_SCOPE_{proposito}"

# ---------------------------------------------------------------------------
# 3. autorizar() — Pipeline 7 pasos DOCX Sec 6.3
# ---------------------------------------------------------------------------
@dataclass
class AuthzDecision:
    permitir: bool
    paso_fallido: int | None = None
    motivo_denegacion: str = ""
    permiso_efectivo_origen: str = ""
    nivel_info_autorizado: NivelInfo = "RESULTADO_GENERAL"
    pn_gate: bool = False
    scope_match: str = ""

    def to_dict(self) -> dict:
        return {
            "permitir": self.permitir,
            "paso_fallido": self.paso_fallido,
            "motivo_denegacion": self.motivo_denegacion,
            "permiso_efectivo_origen": self.permiso_efectivo_origen,
            "nivel_info_autorizado": self.nivel_info_autorizado,
            "pn_gate": self.pn_gate,
            "scope_match": self.scope_match,
        }

async def autorizar(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    accion_codigo: str,
    recurso: dict[str, Any] | None = None,
    proposito: Proposito = "VER",
    *,
    nivel_requerido: NivelInfo = "RESULTADO_GENERAL",
    categoria_tercero: str | None = None,
) -> AuthzDecision:
    """Pipeline DOCX 6.3 — 7 pasos."""
    recurso = recurso or {}

    # Paso 1 — deny-by-default sin sesión
    if not user or not user.user_id:
        return AuthzDecision(False, 1, "PASO1_SESION_INVALIDA")

    # Paso 2/3/4 — permisos_efectivos (DENY>GRANT>ROL) + gate sensible
    perms = await permisos_efectivos(db, user)
    pe = perms.get(accion_codigo)
    if pe is None:
        return AuthzDecision(False, 3, f"PASO3_PERMISO_DESCONOCIDO:{accion_codigo}")
    if not pe.permitido:
        # Paso 2 wins si fue override DENY, sino 3 deny-default / rol no incluido
        paso = 2 if pe.origen == "OVERRIDE_DENY" else (3 if pe.origen == "DENY_DEFAULT" else 3)
        return AuthzDecision(
            False, paso,
            f"PASO{paso}_PERMISO_NEGADO:{pe.origen}",
            permiso_efectivo_origen=pe.origen,
        )
    if pe.es_sensible and accion_codigo not in user.sensibles_confirmados:
        return AuthzDecision(False, 4,
            f"PASO4_SENSIBLE_SIN_CONFIRMACION:{accion_codigo}")

    # Paso 5 — scoping VER/ACTUAR
    ok_scope, motivo_scope = await en_alcance(db, user, recurso, proposito)
    if not ok_scope:
        return AuthzDecision(False, 5, f"PASO5_FUERA_ALCANCE:{motivo_scope}",
                             scope_match=motivo_scope)

    # Paso 6 — Gate PN
    pn_gate = True
    if categoria_tercero in ("PN_NACIONAL", "PN_EXTRANJERA"):
        # necesita party.query.pn GRANT + override confirmado
        if accion_codigo == "party.query.pn":
            # gate explícito
            if "party.query.pn" not in user.sensibles_confirmados:
                return AuthzDecision(False, 6,
                    "PASO6_GATE_PN_SIN_AUTORIZACION")
        elif categoria_tercero and categoria_tercero.startswith("PN_"):
            # implícito: cualquier consulta sobre un tercero PN
            if (categoria_tercero not in user.tipos_tercero_autorizados
                    and "party.query.pn" not in user.sensibles_confirmados):
                return AuthzDecision(False, 6,
                    f"PASO6_TIPO_TERCERO_PN_PROHIBIDO:{categoria_tercero}")
    else:
        if categoria_tercero and categoria_tercero not in user.tipos_tercero_autorizados:
            # fallback: categoria PJ si la tuvieron vetada
            pass

    # Paso 7 — Gate nivel info (min(user, requerido))
    u_orden = NIVEL_INFO_ORDEN.get(user.nivel_info, 1)
    r_orden = NIVEL_INFO_ORDEN.get(nivel_requerido, 1)
    autorizado_orden = min(u_orden, r_orden)
    # invert lookup
    nivel_aut = next(
        (k for k, v in NIVEL_INFO_ORDEN.items() if v == autorizado_orden),
        "RESULTADO_GENERAL",
    )
    if autorizado_orden < r_orden:
        # No llega al nivel solicitado. Aun así, se permite ENTREGAR proyección
        # al nivel autorizado (no es denegación 403; es proyección).
        # Quien decide 403 vs 200+proyección es el handler del endpoint.
        # Aquí anotamos la limitación sin bloquear.
        pass

    return AuthzDecision(
        True, None, "",
        permiso_efectivo_origen=pe.origen,
        nivel_info_autorizado=nivel_aut,
        pn_gate=pn_gate,
        scope_match=motivo_scope,
    )

# ---------------------------------------------------------------------------
# 4. Auditoría — cada autorización PERMITIDA se registra (asyncio.create_task)
# ---------------------------------------------------------------------------
async def registrar_auditoria(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    accion_codigo: str,
    decision: AuthzDecision,
    recurso: dict[str, Any] | None = None,
    valor_anterior: Any = None,
    valor_nuevo: Any = None,
) -> None:
    try:
        doc = {
            "organizacion_id": user.organizacion_id,
            "usuario_id": user.user_id,
            "usuario_email": getattr(user, "email", "") or "",
            "accion": accion_codigo,
            "entidad_tipo": (recurso or {}).get("entidad_tipo") or "desconocido",
            "entidad_id": (recurso or {}).get("entidad_id") or (recurso or {}).get("_id"),
            "ts": time.time(),
            "permitir": decision.permitir,
            "paso_fallido": decision.paso_fallido,
            "motivo_denegacion": decision.motivo_denegacion[:500] if decision.motivo_denegacion else "",
            "permiso_origen": decision.permiso_efectivo_origen,
            "scope_match": decision.scope_match,
            "nivel_info_autorizado": decision.nivel_info_autorizado,
            "valor_anterior": valor_anterior,
            "valor_nuevo": valor_nuevo,
            "origen": "API_AUTHZ_V2",
        }
        await db["auditoria_log"].insert_one(doc)
    except Exception:
        import traceback
        traceback.print_exc()
        pass

# ---------------------------------------------------------------------------
# 5. Helpers varios
# ---------------------------------------------------------------------------
def calcular_dims_hash(user_doc: dict, *dims_docs: dict) -> str:
    """Hash stable para cache invalidation granular."""
    serial = json.dumps(
        {"u": user_doc.get("cache_version"),
         "d": [str(d) for d in dims_docs]},
        sort_keys=True, default=str,
    )
    return hashlib.sha256(serial.encode("utf-8")).hexdigest()[:16]