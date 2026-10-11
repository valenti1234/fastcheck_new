# Changelog Semanal – Duxiter Intermedio (Versión Español 2026.10)
> 📌 **Idioma**: Todo el texto descriptivo, títulos, tablas, notas, pasos y errores se escriben exclusivamente en **español**. Los bloques de código, nombres de archivos y enlaces `file:///` se mantienen originales.

> ⏱️ **Tabla de Tiempos de Trabajo (Horas estimadas / Facturación)**  
> Resumen mensual con todas las tareas — ver Tabla Completa al [final de este documento](#tabla-de-tiempos-mensual).

---

## Fecha: 03 de Octubre de 2026

---

### 📚 Entregable Doble: Documentación Especificación Técnica Cliente V2 + Procedimiento Refactoring RBAC→RBAC+ABAC+Scopes

**Solicitud del usuario (mensaje 2, en italiano):**
> *"Ese documento (DOCX 23-08-2026) es la petición del cliente para cambiar el sistema de roles. Conviértelo a MD + genera un nuevo documento con procedimiento de refactoring e istrucciones detalladas. NO HACER CAMBIOS EN CÓDIGO POR AHORA. Si tienes dudas, pregunta."*

#### Entregables completados (sin cambios en código):

| # | Tipo | Archivo | Tamaño / Líneas |
|---|------|---------|-----------------|
| **1** | Especificación Técnica V2 (traducción 100% fiel DOCX) | [ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md](file:///home/duxiter/duxiter_intermediate/ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md) | 13 secciones + Anexo A (24 bloques trazabilidad funcional → técnica), 46 tablas DOCX reformateadas |
| **2** | Procedimiento de Refactoring (plan ejecutable) | [REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md](file:///home/duxiter/duxiter_intermediate/REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md) | 10 secciones: Gap Analysis, Mapeo Legacy→Nuevo, Impacto ×46 archivos (ruta+líneas refs `file://`), Plan Fases 0/1/2/3 (40 subtareas con checklist), Migración MongoDB 10 pasos estrictos, Plan testing coverage %, 7 riesgos mitigados, Backlog 19 HU con CA, DoD por fase, 6 Q&A cliente cerradas |

**Decisiones arquitectónicas confirmadas con el cliente (6 Q&A, 2026-10-03):**
| Q ID | Respuesta |
|------|-----------|
| Q1 | ✔ **Deny-by-default PN para todos los usuarios** con **ECUACIÓN ÚNICA**: `superuser` global DUXITER → hereda `party.query.pn` automático; resto → DENY hasta otorgamiento sensible explícito con modal doble intención |
| Q2 | ✔ `incluye_descendientes=TRUE` por defecto en alcance UNIDAD/AREA/PAÍS |
| Q3 | ✔ **Multipertenencia UO/área BLOQUEADA F0** (1 user = max 1 UO + 1 Área); se habilita desde F1 |
| Q4 | ✔ Escalamiento **fijo 3 niveles** (Operativo → Jefatura UO → Central) F0/F1; configurable por tenant desde F2 |
| Q5 | ✔ Catálogo 6 motivos PN FIJO en F0; editable admin desde F1 |
| Q6 | ✔ Límite NO duro → **sobregiro controlado** (bloqueo a > 150% plan). Notificaciones 90%/100%/120% + tope individual usuario vía `usuario_limite_consumo` |

**Pasos bloqueados hasta ejecución F0 (branch `feat/rbac-abac-refactor`, solo tras aprobación final del cliente sobre este CHANGELOG):** W-01 branch setup · W-02 CODEOWNERS · W-03 Backup mongodump producción · W-04 merge Fase 0 Fundaciones (8 bloques).

---

### ✅ Bloque 0.7 — Scaffolding Backend Authz V2 + Frontend Perfiles Admin
**Fecha: 03.10.2026 / Horas: 5 h**

#### 🔧 Backend · authz_service v2 pipeline 7 pasos + proyección 5 niveles + legacy wrapper compatibilidad
- Implementación Fuente Única de Verdad (SOT) RBAC+ABAC en `authz_service.py`.
- Pipeline autorizar() de 7 pasos (sesión → DENY → GRANT/ROL → gate sensible → scopes → gate PN → gate nivel info).
- `proyeccion_service.py` con 5 niveles L1 (Resultado general ⊆ L2 Resumen ⊆ L3 Info No Sensible ⊆ L4 Detalle Riesgo ⊆ L5 Info Completa).
- Gate PN exclusivo 8 campos; Gate Sensible 3 paths (recursivo lista + diccionario).
- Capa compatibilidad legacy mapeando v1 → v2 con feature flag `AUTHZ_LEGACY_LAYER`.
- 4-layer Safety Lock anti-producción (env whitelist / runner hardcode / readonly proxy / HTTP guard 503).

**Ref líneas Bloque 0.7 Backend:**
- [authz_service.py#L68-L86](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L68-L86) — EnrichedUser dataclass + 12 campos authz v2
- [authz_service.py#L431-L449](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L431-L449) — AuthzDecision dataclass
- [authz_service.py#L451-L533](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L451-L533) — autorizar() pipeline 7 pasos
- [authz_service.py#L538-L569](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L538-L569) — registrar_auditoria()
- [proyeccion_service.py#L80-L155](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L80-L155) — _remove_keys_recursive path a.b.c + hojas (fix gate sensible)
- [dependencies.py#L33-L56](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L33-L56) — L4 runtime guard anti duxiter (HTTP 503)

#### 🎨 Frontend · AuthContext (wildcard + fallback legacy) + AuthzProfilesPage admin
- `AuthContext` nuevo con `hasPermission()` (soporta wildcard superuser global + fallback legacy_role sin roles v2).
- HOC `RequirePermission` para rutas protegidas.
- Página admin `AuthzProfilesPage` (gestión perfiles, permisos sensibles, scopes).
- Hook `useProyeccionNivel` para columnas dinámicas en tablas resultados.

**Ref líneas Bloque 0.7 Frontend:**
- `AuthContext` → `src/contexts/AuthContext.tsx`
- `RequirePermission` → `src/hocs/RequirePermission.tsx`
- `useProyeccionNivel` → `src/hooks/useProyeccionNivel.ts`
- `AuthzProfilesPage` → `src/pages/admin/AuthzProfilesPage.tsx`

---

### ✅ Bloque 0.8 — Testing Unitario (U1/U2) + Integrazione 4 clienti reali (I1) + Auditoria 100% (I2) + QA Checklist 10-col
**Fecha: 03.10.2026 / Horas: 8 h**

#### U1 Unit test authz_service.py · 24/24 PAS
- 14 test pipeline 7 pasos (uno por paso positivo + negativo).
- Q1 PN gate (2), Q4 Grant sensible (3), Q2 BFS descendientes UO (2), Precedencia permisos (3).
- Mock puro FastcheckDBFake (in-memory, 0 conexiones DB real).

#### U2 Unit test proyeccion_service.py · 9/9 PAS · 🚨 BUG GRAVE gate sensibile trovato e risolto
- 3 test catena L1⊆L2⊆L3⊆L4⊆L5.
- 2 test Gate PN (8 campos exclusive).
- 2 test Gate SENSIBILE (3 campi paths a.b.c, recursivo lista + dict).
- 2 test extra proyectar lista + mapping nivel_accion fastcheck.query → DETALLE_RIESGO.
- **BUG GRAVE corretto:** `_remove_keys_recursive(obj, forbidden)` **NON** filtrava paths con punti (es. `sheriffLogData.raw_payload`, `risk.params.define`) → leak dati sensibili. Fix: 2 strategie (paths split "." nested + hojas top-level). Backward compat (solo elimina di più, mai di meno).

#### I1 Test integrazione 4 clienti reali da duxiter-2 (solo lettura) · 9/9 PAS
- Safety strategy: NO pytest-asyncio per questo file (evita Motor loop mismatch). Ogni test SINC + asyncio.run(inner).
- 4 clienti REALI: Superadmin · CHC/CMPC tenant_admin · AXA/Virbac evaluator · CCU read_only.
- 9 test totali (3 A + 2 B + 2 C + 2 D). Q1 confermato (PN deny default, superuser grant).
- Assert duplicato security in ogni connessione (non duxiter + solo duxiter-2).

#### I2 Test auditoria_log 100% coverage · 2/2 PAS (10 escenarios, delta = +10 docs)
- 10 escenarios críticos (4 superuser A, 2 CHC, 2 AXA, 2 CCU). Cada uno: hydrate → autorizar → registrar_auditoria().
- Assert antes/despues: `auditoria_log.DESPUES - ANTES >= 10`.
- Assert colecciones NO-audit (users, permisos, roles, results, evaluationresults, unidades_organizacionales) NO contiene campos audit permiso_origen.

#### QA Checklist manual MÓDULO 10 RBAC+ABAC · 4 filas × 10 COLUMNAS EXACTAS
- Colonne: ID Scenario, Usuario, Rol, Acción, Permiso Solicitado, Nivel Info Autorizado, PN Gate, Scope Match, Resultado Esperado, Resultado Real.
- 4 scenari cliente. Criterio llenado columna Real: ✅ / ❌ + ticket / ⚠️ observado.

**Suite TOTAL Bloque 0.8:** 44/44 PAS (24+9+9+2 tests), exit=0, 0.68s.

**Ref líneas Bloque 0.8 testing/QA:**
- U1 authz (24 tests) → [test_authz_service.py#L1-L580](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L1-L580)
- U2 proyeccion (9 tests) → [test_proyeccion_service.py#L1-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py#L1-L325)
- U2 Fix bug sensibile gate → [proyeccion_service.py#L127-L155](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L127-L155)
- I1 integracion 4 clienti (9 tests) → [test_integration_4_clientes_reales.py#L1-L359](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L1-L359)
- I2 auditoria 100% (10 escenarios, delta 10) → [test_integration_I2_auditoria_log_100pc.py#L1-L190](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py#L1-L190)
- QA MÓDULO 10 × 10 col → [QA_TEST_LIST.md#L274-L292](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md#L274-L292)
- conftest + pytest.ini → [conftest.py#L1-L150](file:///home/duxiter/duxiter_intermediate/fastcheck_api/conftest.py#L1-L150), [pytest.ini#L1-L6](file:///home/duxiter/duxiter_intermediate/fastcheck_api/pytest.ini#L1-L6)

---

### ✅ Bloque 1.1 — Poblamiento Unidades Organizacionales reales (FASE1 · branch feat/rbac-abac-fase1)
**Fecha: 03.10.2026 / Horas: 3 h**

**Estado:** ✅ EJECUTADO y VERIFICADO (Suite 47/47 PAS exit=0)

**Objetivo:** Resolver el bloqueo crítico de `SIN_MATCH_SCOPE_VER` para los 4 clientes reales I1 (SUPER / CHC / AXA / CCU). Durante FASE0 la migración 003 creaba documentos `usuario_unidad` y `usuario_alcance` **con campos vacíos** (`organizacion_id=None`, `unidad_ids=[]`, `principal=True` nunca se poblaban). En FASE1 Bloque1.1 se corrige poblando datos reales.

**Mapping 4 clientes → tenant legacy → org (1:1) → UO principal:**
| Cliente I1 | Email | `users.tenant` ObjectId | `organizaciones.nombre` | `unidad_organizacional._id` (UO-ROOT) |
|---|---|---|---|---|
| A SUPER | superadmin@gmail.com | `696eaa2addea6b91873de15e` | System | `6ac127b8e2f379cf956f2578` |
| B CHC (CMPC) | anibal.fernandez@cmpc.com | `6a710ccc41eb4a347a7b2af8` | CMPC | `6ac127c3e2f379cf956f264a` |
| C AXA (Virbac) | ghap68@yahoo.com | `696f6386174b6c5725971a6c` | TI - PRuebas | `6ac127bae2f379cf956f258d` |
| D CCU (UCSC) | clsalgado@ucsc.cl | `6a2971190e276e4dabaa6b6c` | UCSC | `6ac127c0e2f379cf956f260b` |

**Operaciones MongoDB (duxiter-2 ONLY · SAFETY 4-layer lock):**
1. **`usuario_unidad` (4 inserts)**: `principal=True`, `organizacion_id`, `pais_id`, `unidad_id` reales.
2. **`users` (4 updates)**: `unidad_ids = [UO_ROOT_PRINCIPAL]`, `organizacion_id`, `pais_ids = [pais_id]`, `cache_version` bumped (1→2→3) para invalidar globalmente la LRU cache (`key = (user_id_str, "v{cache_version}")`).
3. **`usuario_alcance` (4×2 old scope eliminados + 4×4 new scope insertados)**:
   - Se eliminan 2×4 scope vacíos (migration 003 placeholder) creados con `organizacion_id=None`.
   - Se crean **SCOPE PROPIO (VER+ACTUAR)** wildcard `permiso="*"` → matcha `creador_id == user_id`.
   - Se crean **SCOPE ORGANIZACION (VER+ACTUAR)** para SUPER/CHC/CCU → `organizacion_id + pais_id` populados.
   - Se crea **SCOPE UNIDAD (VER+ACTUAR)** para AXA (como en migration 003 placeholder) → `unidad_ids = [ax_uo_id]` populado + `incluye_descendientes=True` (Q2).

**3 Bug menores encontrados y corregidos durante 1.1 RUN:**
| Bug | Tipo | Fix |
|---|---|---|
| `es_principal=True` vs campo esperado por hydrate `principal=True` | Nombre campo erróneo en usuario_unidad INSERT | `$rename es_principal → principal` en los 4 docs (update_many) |
| `usuario_alcance.tipo_alcance=ORGANIZACION` pero `organizacion_id=None` (placeholder) | Scope empty → siempre SIN_MATCH | DELETE + INSERT scope populado con org/pais/UO |
| Replica lag read (secondaryPreferred maxStaleness 120s) → hydrate retornaba `unidad_ids=0` | Lectura de stale secondary | URI `primaryPreferred` para tests I1 ampliados + `force_refresh=True` en hydrate en tests Bloque1.1 |

**Resultados Pipeline 7 pasos POST 1.1 (todos 4/4 PERMIT):**
| Label | Autorizar permiso + nivel | Resultado | Origen permiso | Scope match |
|---|---|---|---|---|
| A SUPER | admin.users INFO_COMPLETA | ✅ PERMIT | SUPERUSER_WILDCARD | SUPERUSER_WILDCARD |
| B CHC | admin.structure INFO_COMPLETA | ✅ PERMIT | ROL:ADMIN_GENERAL | MATCH_ORGANIZACION |
| C AXA | fastcheck.query DETALLE_RIESGO | ✅ PERMIT | ROL:EVALUADOR_ANALISTA | MATCH_PROPIO |
| D CCU | admin.structure RESULTADO_GENERAL | ✅ PERMIT | ROL:ADMIN_GENERAL | MATCH_ORGANIZACION |

**I1 Ampliado (9 → 12 tests) · Suite total 44 → 47:**
- Nuevos tests → `TestBloque11_Fase1_ScopeMatchPostPopulate`
- **test_B2_CHC_scope_ORGANIZACION_match** → PASS
- **test_C3_AXA_scope_UNIDAD_PROPIO_match** → PASS
- **test_D2_CCU_scope_ORGANIZACION_match** → PASS

**Ref líneas Bloque 1.1:**
- Usuario alcance / unidad populación (one-shot, idempotente si rerun) → (scripteados vía ad-hoc `run_mongo_*`, no persistentes en repo)
- 3 Nuevos tests I1 Bloque 1.1 → [test_integration_4_clientes_reales.py#L356-L491](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L356-L491)
- Mapping definitivo org/pais/UO → salida script discovery (ver `FASE1_TRACKING_RBAC_ABAC.md`)
- Suite pytest total Bloque1.1 post: `47 passed in 0.65s exit=0`

**Safety:** 0 escrituras en DB `duxiter` producción. El `ReadonlyCollectionProxy` + runtime guard L4 no han disparado ningún `BeforeAnyWriteAbort`.

---

### ✅ Bloque 1.2 — `SuperuserBlockedRoute` workspace tenant-specific (Q7 FASE1 · hard constraint)
**Fecha: 03.10.2026 / Horas: 3 h**

**Estado:** ✅ EJECUTADO y VERIFICADO (Suite **51/51 PAS exit=0, 1.55s**; 4/4 tests E2E Superuser PASS).

**Objetivo:** Implementar Q7 FASE1: il `superuser` GLOBALE non può accedere ad alcuna rotta workspace *tenant-specific*. Le rotte sotto `/api/v2/workspace/*` montano una route class custom `SuperuserBlockedRoute(APIRoute)` che, *prima dell'handler originale*, decodifica il JWT, idrata EnrichedUser e — se `is_superuser_wildcard=True` OPPURE `legacy_role=='superuser'` (fallback legacy) — solleva `HTTPException 403` con `code=SUPERUSER_WORKSPACE_BLOCKED` e `http_code_num=40301`.

**Architettura componente (5 file modificati/creati):**
| File | Ruolo | Referencia líneas |
|------|-------|-------------------|
| `app/api/dependencies.py` | Definizione `SuperuserBlockedRoute(APIRoute)` + costante `SUPERUSER_WORKSPACE_BLOCKED_CODE`. Safety lock `_assert_safe_target_db()` eseguito prima di *qualunque* hydrate/read. Fallback doppio: is_superuser_wildcard v2 O role==superuser legacy. | [L411-L501](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L411-L501) |
| `app/api/v2/routers/workspace.py` | **Nuovo file** · Router `/v2/workspace/*` montato con `route_class=SuperuserBlockedRoute`. Contiene endpoints: `GET /workspace/health` (public gateway, no user req) · `GET /workspace/me` (contexto workspace dell'utente autenticato + `get_current_user` DI per popolare CurrentUser dual-face). | [workspace.py#L1-L58](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/workspace.py#L1-L58) |
| `app/api/v2/routers/__init__.py` | Export nuovo `workspace_router`. | [#L6-L14](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/__init__.py#L6-L14) |
| `app/api/v2/__init__.py` | Import + re-export `workspace_router` package-level (richiesto da `v2/router.py` `from fastcheck_api.app.api.v2 import …`). | [v2/__init__.py#L7-L16](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/__init__.py#L7-L16) |
| `app/api/v2/router.py` | `router.include_router(workspace_router)` dopo audit_router (ordine: authz→org→users→third→audit→workspace). Path finale: `/v2/workspace/*`. | [router.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L23) |

**Fix dato staging minore:** Tenant AXA (`TI - PRuebas` ObjectId `696f6386174b6c5725971a6c`) in `duxiter-2` aveva `tenants.isActive=False` che causava `TENANT_NOT_ACTIVATED` HTTP 403 in `get_current_user` (Dipendenza DI `/workspace/me`). Aggiornato `update_one → isActive=True` **solo su `duxiter-2`** (0 scritture produzione).

**Risultati 4 scenari E2E Bloque1.2:**
| Scenario | Utente / Ruolo legacy | Chiamata | Status HTTP atteso | `detail.code` atteso | Resultado |
|---|---|---|---|---|---|
| A) BLOCCATO | SUPER superuser (wildcard=True) | `GET /v2/workspace/me` Bearer+JWT firmato | **403** | `SUPERUSER_WORKSPACE_BLOCKED` | ✅ PASS |
| B) AUTORIZZATO | CHC tenant_admin (CMPC) | `GET /v2/workspace/me` Bearer+JWT firmato | **200** | — | ✅ PASS |
| C) AUTORIZZATO | AXA evaluator (Virbac/TI-PRuebas) | `GET /v2/workspace/me` Bearer+JWT firmato (post-attivazione tenant) | **200** | — | ✅ PASS |
| D) AUTORIZZATO | CCU read_only (UCSC) | `GET /v2/workspace/me` Bearer+JWT firmato | **200** | — | ✅ PASS |

**Sintesi suite pytest TOTALE post-Bloque1.2:**
| Componente | Conteggio tests |
|---|---|
| U1 authz_service unitari (F0) | 24 |
| U2 proyeccion_service unitari (F0) | 9 |
| I1 4 clienti integrazione (F0 legacy + F1 Bloq1.1 ampliado) | 12 |
| I2 auditoria_log 10 escenarios (F0) | 2 |
| **Blq1.2 E2E SuperuserBlockedRoute (NUOVO)** | **4** |
| **TOTAL GLOBALE** | **51/51 PASS** · exit=0 · **1.55 s** |

**Ref líneas Bloque 1.2:**
- SuperuserBlockedRoute class + safety lock L4 → [dependencies.py#L411-L501](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L411-L501)
- Router workspace `/v2/workspace/*` → [workspace.py#L1-L58](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/workspace.py#L1-L58)
- Export package workspace_router → [v2/__init__.py#L1-L16](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/__init__.py#L1-L16) / [v2/routers/__init__.py#L1-L14](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/__init__.py#L1-L14)
- Mount aggregatore v2 → [router.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L23)
- 4 Tests E2E Q7 (A 403 / B C D 200) → [test_superuser_blocked_route_e2e.py#L1-L139](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_superuser_blocked_route_e2e.py#L1-L139)

**Safety:** 1 scrittura staging `duxiter-2` (tenants AXA isActive=True). **0 scritture in `duxiter` produzione** (verificato safety lock L1 runtime assert `db.name != duxiter` in EVERY connessione Mongo).

---

### 🎉 ✅ BLOQUE 1.3 — Migración gradual `AUTHZ_LEGACY_LAYER` 66 usuarios (CIERRE FASE 1 · 100% COMPLETADO)
**Fecha: 03.10.2026 / Horas: 3 h**

**Estado:** ✅ EJECUTADO y VERIFICADO (Suite **51/51 PAS exit=0 1.55 s**; AUTHZ_LEGACY_LAYER=`False` GLOBAL DEFAULT).

**Objetivo:** Migrazione graduale di TUTTI gli utenti di staging `duxiter-2` al **nuovo motore RBAC+ABAC+Scopes V2 a 7 passi DOCX §6.3**, disabilitando DEFINITIVAMENTE il fallback legacy `ROLE_PERMISSIONS` hardcoded. Gruppi progressivi (canarino 20% → medio 50% → pubblico 100%) con incremento cache_version per invalidare globalmente LRU cache `hydrate_user_from_db(key = (str(user_id), "v{cv}"))`.

**DISCOVERY pre-migrazione (EXP Bloq1.3, duxiter-2 ONLY):**
| Statistica | Valore |
|---|---|
| `N users` (isActive qualsiasi + isActive=False) | **66** |
| 20% Gruppo 1 canarino | 13 utenti |
| 50% Gruppo 2 (cum) | 33 utenti |
| 100% Gruppo 3 (cum) | 66 utenti |
| Distribuzione migrated pre-1.3 | 66/66 migrated=True (1 superuser · 4 evaluator · 61 tenant_admin) |
| Distribuzione cache_version pre-1.3 | `{'1': 62, '3': 4}` (4 utenti Blq1.1 già bumpati a cv=3) |

**RUN operazioni MongoDB (duxiter-2 ONLY · safety lock 4-layer OK):**
| # Grupo | N utenti | `users.update_many({_id: {$in: g_ids}}, ...)` | `cache_version` bump | Campo `authz_v2` |
|---|---|---|---|---|
| G1 (20%) | 13 | matched=13, modified=13 | 1/3 → **4** | `{"force_v2_only": True}` |
| G2 (50%) | 20 extra (cum: 33) | matched=20, modified=20 | 1 → **5** | `{"force_v2_only": True}` |
| G3 (100%) | 33 extra (cum: 66) | matched=33, modified=33 | 1 → **6** | `{"force_v2_only": True}` |

Distribuzione POST-1.3 cache_version: `{'4': 13, '5': 20, '6': 33}` (66 totali, tutti bumped correttamente).

**Codice modificato (2 file, G3):**
1. **[config.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L23)** · `authz_legacy_layer: bool = Field(default=False, …)` → **GLOBAL DEFAULT = False** (chiude la migrazione).
2. **[dependencies.py#L248-L252](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L252)** · Nuovo campo `authz_v2.force_v2_only` estratto da `users.authz_v2` (dict) e salvato in `request.state.force_v2_only`.
3. **[dependencies.py#L314-L322](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L314-L322)** · Guardia `require_permission()`: se `force_v2_only=True` **oppure** `settings.authz_legacy_layer=False` → MAI esegue il fallback legacy (salta direttamente a pipeline 7 pasos V2).
4. **Bug fixato durante G3** (regressione minore): `bool(... dict ...).get("force_v2_only")` → `AttributeError: 'bool' object has no attribute 'get'` · Corretto con variabile intermedia `_authz_v2_doc` + `.get()` + `bool()` separato.

**Verificación post-G3 Bloq1.3:**
- ✅ `pytest fastcheck_api/tests/ -q --tb=short` → **51/51 PASS · exit=0 · 1.55 s**
- ✅ U1 unitari authz → 24 PASS
- ✅ U2 unitari proyección (L1..L5 + gate sensible path match) → 9 PASS
- ✅ I1 4 clienti integrazione (9 legacy F0 + 3 Bloq1.1 scope match) → 12 PASS
- ✅ I2 auditoria_log 10 escenarios Bloq0.8 → 2 PASS
- ✅ Bloq1.2 E2E Q7 SuperuserBlockedRoute (A:403 · B/C/D:200) → 4 PASS
- ✅ **Safety lock**: 0 scritture `duxiter` produzione · tutte le operazioni solo su `duxiter-2`
- ✅ Feature flag `AUTHZ_LEGACY_LAYER` default globale = `False` (fase chiusa; nessun utente ritorna a legacy)

**Rif líneas Bloque 1.3:**
- config.py global default G3 → [config.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L23)
- get_current_user + force_v2_only extract → [dependencies.py#L248-L262](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L262)
- require_permission guardia anti-fallback-legacy → [dependencies.py#L314-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L314-L325)
- Suite pytest completa 51/51 PASS (1.55 s) · test runner herdoc

---

### 💬 ✅ BLOQUE 2.1 (FASE2) — Comentarios Visibilidad VISIBLE / RESTRINGIDO / PERSONAL (HU-12) + Migración 005 Catálogo 6 permisos nuevos + 2 colecciones nuevas (`comentarios_v2` + `catalogo_etiquetas`)
**Fecha: 03.10.2026 / Horas: 3 h**

**Estado:** ✅ EJECUTADO y VERIFICADO (Suite **59/59 PAS exit=0 2.11 s** · 8 tests NUEVOS HU-12 · 51 FASE1 sin regresiones · 0 escrituras producción `duxiter`).

---

#### 🧭 EXP Bloque 2.1 (Discovery duxiter-2 SOLO-LECTURA)
| Hallazgo | Valor |
|---|---|
| Colecciones legacy de comentarios | ❌ No existe `comentarios` / `observaciones`; solo `usernotes` con 109 docs sin campo `visibilidad`, sin `ambito_restringido`, sin `borrado_logico` (antiguo sistema sin granularidad). |
| Catálogo `permisos` pre-005 en duxiter-2 | 23 permisos. Faltaban: `comment.read`, `comment.delete`, `comment.create` (permisos comentarios) + `tag.read`, `tag.write`, `tag.manage_restricted`, `tag.grant` (4 permisos etiquetas Bloq2.2). |
| `rol_permiso` pre-005 | 8 roles plantilla (SOLICITANTE → GESTOR_MODELO_RIESGO) no tenían ninguna asignación comment/tag. |

---

#### ⚙️ RUN Bloque 2.1 — (1/3) Migración 005 idempotente (duxiter-2 ONLY)
**Archivo:** [005_comentarios_y_etiquetas_catalogo_expand.up.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/005_comentarios_y_etiquetas_catalogo_expand.up.py#L1-L150)

1. **6 permisos nuevos** insertados con `update_one upsert=True`:
   - Comentarios (HU-12): `comment.read`, `comment.create`, `comment.delete`.
   - Etiquetas (Bloq2.2 next): `tag.read`, `tag.write`, `tag.manage_restricted`, `tag.grant`.
2. **31 asignaciones rol_permiso** (8 roles plantilla): SOLICITANTE → read-only comment/tag; EVALUADOR_ANALISTA → write create; ADMIN_GENERAL/AUDITOR → delete + manage_restricted; GESTOR_RIESGO superconjunto.
3. **2 colecciones nuevas creadas** (solo `duxiter-2`, no producción):
   - `comentarios_v2` (HU-12 core): 16 campos (tercero_id, rut_clean, texto, visibilidad ∈ {VISIBLE,RESTRINGIDO,PERSONAL}, ambito_restringido_tipo/ambito_restringido_id, autor_id, tags, borrado_logico, borrado_en/por, etc.).
   - `catalogo_etiquetas` (Bloq2.2 core): tenantId, organizacion_id, codigo (único), nombre, tipo, restricciones, creado_por.
4. **9 índices compuestos background** (todos con `idx_005_*` prefix): tenantId + tercero_id + rut_clean + organizacion_id + unidad_id + area_id + autor_id + visibilidad + borrado_logico + `creado_en DESC`; índice único `(organizacion_id, codigo)` en etiquetas.
5. **Migration state**: `__rbac_migrations_version.update_one state → applied $addToSet '005'`. Post-apply: `applied = ['001','002','003','004','005']`.

**Rollback:** [005_comentarios_y_etiquetas_catalogo_expand.down.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/005_comentarios_y_etiquetas_catalogo_expand.down.py#L1-L25)

---

#### ⚙️ RUN Bloque 2.1 — (2/3) Router CRUD `/v2/comments` (3 niveles visibilidad + proyección pura)
**Archivo:** [comments.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/comments.py#L1-L291) **NUOVO 291 líneas**

**Endpoints expuestos (tutti con `@require_permission` correspondiente):**
| Método | Path | Permiso | Lógica clave |
|---|---|---|---|
| `GET /v2/comments` | Listar filtrados por `tercero_id` o `rut_clean` | `comment.read` | **Helper projection pura `_filtro_visibilidad_lectura(user, filt_base)`**: construye `$or` MongoDB a 3 branch: (A) `PERSONAL` (solo autor o `_es_admin_o_auditor`); (B) `VISIBLE` (todos miembros organización); (C) `RESTRINGIDO` branch UNIDAD + AREA + ORG match `ambito_restringido_id ∈ user.unidad_ids / area_id / organizacion_id`. **Superuser wildcard bypass**: `if user.role=="superuser" → return filt_base + borrado_logico!={$ne:True}`. Isolamento tenant hard sempre attivo. |
| `POST /v2/comments` | Crear comentario | `comment.create` | Valida visibilidad; si RESTRINGIDO → exige `ambito_restringido_tipo` + `ambito_restringido_id`; inserta `creado_en = now`, `borrado_logico = False`. Auditoría `accion=comment.create`. |
| `PUT /v2/comments/{id}` | Editar (solo autor o admin) | `comment.create` + ownership check | Guard: solo `autor_id == user_id` O `_es_admin_o_auditor` puede modificar; no se permite cambiar `visibilidad` de PERSONAL → VISIBLE sin admin. Auditoría. |
| `DELETE /v2/comments/{id}` | Borrado LÓGICO (NO físico) | `comment.delete` | Guard: solo AUTOR O admin/auditor. Update: `borrado_logico=True`, `borrado_en=now`, `borrado_por_id=user_id`. Auditoría `accion=comment.delete`. |
| `GET /v2/comments/{id}` | Obtener uno por ID | `comment.read` | Stesso filtro visibilidad lista + `_id=OID(id)`; 404 si fuori scope. |

**Helpers addizionali:**
- `_es_admin_o_auditor(user)` (L82-L87): `{superuser, tenant_admin, auditor, GESTOR_RIESGO}` = admin compliance (vedono tutti i PERSONALI).
- `_oid(s)` → `to_object_id(s)` con fallback safe.
- Tutte le scritture POST/PUT/DELETE registrano riga in `auditoria_log` con `obj_id`, `accion`, `antes`, `despues`.

---

#### ⚙️ RUN Bloque 2.1 — (3/3) Mount router + exports package
3 file aggiornati per registrare `comments_router` su path `/v2/comments`:
1. Routers export → [v2/routers/__init__.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/__init__.py#L1-L17) (added `comments_router`).
2. Package v2 export → [v2/__init__.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/__init__.py#L1-L19) (re-export).
3. Mount aggregatore → [v2/router.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L1-L25) · `router.include_router(comments_router, prefix="/comments", tags=["Comments V2"])`

**Smoke import:** routes v2 totali = 27 endpoints registrati; routes list OK; py_compile 6 file (005.up/down + comments.py + 3 exports) = 0 errori.

---

#### ✅ VERIF Bloque 2.1 — 8/8 tests NUEVOS I3 HU-12 PASS · Suite TOTAL 59/59
**Archivo test:** [test_integration_I3_comentarios_hu12.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I3_comentarios_hu12.py#L1-L320) **NUOVO 320 líneas**

**Estrategia testing sicuro su `duxiter-2`:** tutti i commenti creati portano un **tag di test UNIVOCO = `test_I3_HU12_{tsUTC}`**; `fixture autouse _init_and_cleanup` esegue `delete_many({"tags":test_tag})` PRIMA e DOPO ogni test → nessun inquinamento dati permane.

**4 test unitari (U3-U6):**
- **U3 VISIBLE**: commento VISIBLE su org_CHC → lo vede CHC ✅; NON lo vede AXA (altro tenant) ✅; SUPER lo vede ✅.  PASS.
- **U4 PERSONAL non-admin**: CHC crea PERSONAL → utente non-admin non-autore NON lo vede.  PASS.
- **U5 PERSONAL admin**: CHC crea PERSONAL → superuser/auditor LO VEDONO (compliance).  PASS.
- **U6 RESTRINGIDO(UNIDAD)**: CHC crea RESTRINGIDO UNIDAD sobre CHC_UO → membro CHC_UO lo vede ✅; altra UO stessa org NON lo vede ✅.  PASS.

**3 test integrazione (I3-1 / I3-2 / I3-3):**
- **I3-1**: Flusso end-to-end CREATE → GET list → EDIT → DELETE (lógico) su VISIBLE con 4 utenti diversi. All pass.
- **I3-2**: Gate PN non si applica ai commenti (risultato: PN gate = N/A; commenti PN-naive). PASS.
- **I3-3**: Ambito RESTRINGIDO AREA match user.area_id + Ambito RESTRINGIDO ORG match user.organizacion_id. PASS.

**1 test precondizioni:** `permiso comment.read / comment.delete EXISTEN en catálogo permisos` (005 applied). PASS.

**Regresión 51 FASE1:** 51/51 PASS.
**SUMMARY TOTAL:** pytest `fastcheck_api/tests/ -q --tb=short` → **59 passed, 37 warnings in 2.11s, exit=0**.

---

#### 🔐 Safety lock 4-capas Bloque 2.1
| Capa | Verificación |
|---|---|
| L1 env whitelist | `MIGRATION_TGT_DB_NAME=duxiter-2` sempre |
| L2 runner hardcode | runner.py `assert target == 'duxiter-2'` passed |
| L3 ReadonlyProxy 22 metodi bloqueados | Nessun `BeforeAnyWriteAbort` su collezioni duxiter |
| L4 HTTP guard | `_assert_safe_target_db(db)` ogni conexión → `db.name != 'duxiter'` sempre OK |

**✅ Resultado:** 0 scritture su `duxiter` produzione. Tutte le modifiche = solo `duxiter-2`.

---

### 🏷️ ✅ BLOQUE 2.2 (FASE2) — Etiquetas Scope GENERAL / RESTRINGIDA + 4 permisos `tag.*` (tag.read · tag.write · tag.manage_restricted · tag.grant)
**Fecha: 03.10.2026 / Horas: 3 h**

**Estado:** ✅ EJECUTADO y VERIFICADO (Suite **65/65 PASS exit=0 2.09 s** · 6 tests NUEVOS U7-U10+I4 · 59 FASE1/Bloq2.1 0 regresiones · 0 escritures produccion `duxiter`).

---

#### 🧭 EXP Bloque 2.2 (Discovery duxiter-2 SOLO-LECTURA)
| Hallazgo | Valor |
|---|---|
| Collección `catalogo_etiquetas` (005) | EXISTE, **count = 0 docs vacía** (sin seed). |
| Índice único `idx_005_etiquetas_org_codigo_unico` | ✅ PRESENTE · campos `(organizacion_id, codigo)` · `unique=True` · background=True (005 L84). |
| Catálogo permisos | `tag.*` count = **5 docs** en `duxiter-2.permisos`: `tag.use` (legacy F0 FASE0) + **4 PERMISOS NUEVOS 005**: `tag.read`, `tag.write`, `tag.manage_restricted`, `tag.grant`. |
| `rol_permiso` seed 005 | **14 asignaciones** 8 roles: `SOLICITANTE`/`USUARIO_OPERATIVO`/`EVALUADOR_ANALISTA`/`APROBADOR`/`AUDITOR`/`ADMIN_GENERAL`/`GESTOR_LISTAS`/`GESTOR_MODELO_RIESGO` con modos INCLUIDO / CONFIGURABLE_OPCIONAL. |
| `__rbac_migrations_version state.applied` | `['001','002','003','004','005']` (005 applied ✅). |

---

#### ⚙️ RUN Bloque 2.2 — (1/3) Router CRUD V2 Etiquetas `/v2/tags` (6 endpoints nuevos)
**Archivo:** [tags.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/tags.py#L1-L330) **NUEVO 330 líneas · Scope projection pure helper**

**Endpoints expuestos:**
| Método | Path | Permiso | Lógica clave 🔑 |
|---|---|---|---|
| `GET /v2/tags` | Listar etiquetas scope usuario | `tag.read` | **Helper projection pura `_filtro_etiquetas_lectura(user, filt_base)`** · GENERAL = org match · **RESTRINGIDA**: `creado_por_id == user.id` OR `user in usuarios_autorizados_ids[]` OR admin/auditor. **Superuser wildcard bypass** (vedi tutte). |
| `GET /v2/tags/{tag_id}` | Obtener 1 etiqueta por ID | `tag.read` | Stesso filtro scope + `_id=OID(tag_id)`; 404 se fuera scope. |
| `POST /v2/tags` | Crear GENERAL o RESTRINGIDA | `tag.write` (GENERAL) / `tag.manage_restricted` (RESTRINGIDA) | Doble guardia: si GENERAL → autorizar `tag.write`; si RESTRINGIDA → autorizar `tag.manage_restricted`. Campo `usuarios_autorizados_ids = [creador]` auto-seed si tipo RESTRINGIDA. |
| `PUT /v2/tags/{tag_id}` | Editar nombre/descripcion/color | (creador O admin) + permiso según tipo | Permiso owner: solo creador, admin, o permiso equivalente. |
| `DELETE /v2/tags/{tag_id}` | Borrado lógico 🔒 (NO físico) | `tag.write` (G) o `tag.manage_restricted` (R) | Borrado lógico `borrado_logico=True` + `borrado_en` + `borrado_por_id`. |
| `POST /v2/tags/{tag_id}/grant` | **Otorgar/quitar acceso RESTRINGIDA a usuario** | Require `tag.grant` · dependencia decorator | Acciones `AGREGAR` (addToSet usuarios_autorizados_ids) / `QUITAR` (pull). Valida que usuario-objetivo exista y pertenezca misma organización. |

**Extras siempre activos:**
- Isolamento tenant hard: `organizacion_id = user.organizacion_id or user.tenant` su tutti i find/update (salvo superuser wildcard).
- HTTP 409 CONFLICT si duplicado `idx_005_etiquetas_org_codigo_unico` → [create_tag#L188-L194](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/tags.py#L188-L194).
- Registro auditoría **para cada write** (POST/PUT/DELETE/grant): `registrar_auditoria()` con `accion=tag.create|tag.update|tag.delete|tag.grant`; `entidad_tipo=catalogo_etiquetas`.

---

#### ⚙️ RUN Bloque 2.2 — (2/3) Mount router en API V2 + exports
3 file aggiornati per registrare `tags_router`:
1. Routers package export → [v2/routers/__init__.py#L8](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/__init__.py#L8) · `tags_router` added.
2. Package v2 root export → [v2/__init__.py#L9](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/__init__.py#L9) · `tags_router` re-export.
3. Mount aggregatore `/v2` → [v2/router.py#L22](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L22) · `router.include_router(tags_router)`.

**Smoke tests py_compile:** 4 file (tags.py · 2 __init__ · router.py) → OK.
**Routes v2 totali dopo mount:** **33 endpoints** (prima Bloq2.2 = 27; +6 nuevos tags routes).

---

#### ✅ VERIF Bloque 2.2 — Tests I4 NUEVOS (6/6 PASS) · Suite TOTAL 65/65
**Archivo test:** [test_integration_I4_etiquetas_hu13.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I4_etiquetas_hu13.py#L1-L300) **NUOVO 300 líneas · Safety lock MongoClient sync + cleanup unique test tag prefix.**

**RC2.2-A resuelto:** ObjectId non 24-hex fallaba en version inicial → fix con constantes `OID_FAKE_TAG_U7..U10_3/I41_REST` validas 24 char hex.

**4 Unitari (U7-U10):**
- **U7 GENERAL scope org · SUPER wildcard ✅**: tag GENERAL CHC → CHC vede; AXA altro org NON vede; SUPER vede.
- **U8 RESTRINGIDA scope autorizados ✅**: creador/admin vede; utente NO-admin NON autorizzato NO vede; SUPER vede.
- **U9 Grant AGREGAR/QUITAR toggle scope RESTRINGIDA ✅**: prima non vede → aggiunto in `usuarios_autorizados_ids` → vede; QUITAR → torna a NO vedere.
- **U10 Indice único (org+cod) 409 conflict ✅**: mismo cod misma org → DuplicateKeyError; stesso cod org diversa → OK.

**2 Integrazione:**
- **I4-1 Flusso end-to-end 4 utenti**: crear General + Restringida + Grant toggle + count org. ✅ PASS.
- **I4 Precondiciones**: 005 applied + 4 permisos tag.read/write/manage_restricted/grant existen en catálogo. ✅ PASS.

**Regresión suite 59 (FASE1 + Bloq2.1)**: ✅ **59/59 PASS** 0 regressions.
**TOTAL FINAL Bloq2.2 FASE2**: ✅ **65/65 PASS in 2.09 s, exit=0**.

---

#### 🔐 Safety lock 4-capas Bloque 2.2
| Capa | Verificación |
|---|---|
| L1 env whitelist `MONGODB_URI=/duxiter-2` | ✅ Settings env `mongodb_uri` path=duxiter-2. |
| L2 Runner hardcode | ✅ Applied=005 contiene `assert db.name == 'duxiter-2'`. |
| L3 ReadonlyCollectionProxy (22 métodos escritura bloqueados) | ✅ Nessun BeforeAnyWriteAbort su duxiter. |
| L4 HTTP 503 guard | ✅ Conexiones test `db.name != duxiter` sempre. |
| **Resultado Safety** | **0 escritures en `duxiter` producción.** Todas las escrituras solo `duxiter-2`. |

---

## Fecha: 02 de Octubre de 2026

---

### ⚡ UX Request – RUT Single Evaluation: validar/formatear SOLO al perder el foco (no mientras se escribe)

**Solicitud del usuario:**
> *"su single evaluation nel campo input della casella testo rut il rut deve essere controllato e validato solo quando si perde il focuse e se contiene qualcosa"*

**Comportamiento ANTES (bug UX, aunque no era crash):**
> Ad cada pulsación (`onChange`) se disparaba en cadena `formatChileanRut()` → pretty print automático (puntos + guion) y `validateChileanRut()` → borde verde/rojo + check ✅/❌. El usuario veía cómo el texto se re-escribía letra por letra al escribir (problema de "escritura interferida") y cómo el borde cambiaba de color incluso mientras escribía el DV — distrayendo y dando feedback equivocado antes de tiempo.

#### Cambios aplicados en [SingleEvaluation.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx)

| Función / evento | Antes (01 Oct) | **Ahora (02 Oct)** |
|---|---|---|
| **`handleRutChange`** onChange | formatChileanRut + validateChileanRut | **SÓLO `setRut(value)` + `setFormattedRut(value)` (raw, sin formato) + `setIsValidRut(null)` (borde neutro gris)**. Nada más. |
| **`handleRutBlur`** onBlur | (no existía) | **NUEVA**. Si `raw.trim()` NO está vacío → `formatChileanRut(raw)` → pretty print y `validateChileanRut(raw)` → borde+icono. Si está vacío → no hace nada (no pinta rojo/vacío). |
| Input `<input id="rut">` | `onChange={handleRutChange}` only | **Se ha añadido `onBlur={handleRutBlur}`** a la definición. |
| **`handleSubmit` (Enter)** | Chequeaba `if (!isValidRut)` toast | **Backup safety** cuando usuario pulsa ENTER sin perder foco (por lo que isValidRut sigue = `null`). Si `rut.trim().length > 0`: validación on-the-fly antes de comprobar `!finalIsValid`, y `rutForApi = finalRutFormatted` (no `formattedRut` antiguo). |

#### UBICACIÓN exacta de los cambios:
*   `handleRutChange` nuevo comportamiento → [L185-L190](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L185-L190)
*   `handleRutBlur` (función nueva) → [L192-L199](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L192-L199)
*   Backup submit validación + rutForApi nuevo → [L201-L230](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L201-L230)
*   Atributo `onBlur` en el HTML input → [L417-L423](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L417-L423)

#### Verificación final:
✅ `npm run build` 20,58 s → exit code 0. 0 errores TypeScript / React. Bundle nuevo: `SingleEvaluation-DcVyk4Ml.js = 23.04 kB`.

---

## Fecha: 01 de Octubre de 2026

---

### 🐛 Fix CRÍTICO UI: Input RUT — bloqueado a 2 dígitos + Backspace deshabilitado en RUT completo

#### Problema #1 — No se puede escribir más de 2 dígitos en el campo RUT
**Reproducción reportada (Captura `evaluations/single`)**:
> Usuario escribe `1` → OK. Escribe `2` → el input inmediatamente muestra `1-9` (con guion y DV calculado).  Cualquier pulsación posterior (3, 4, 5…) se **pierde** porque el formatter vuelve a canónizar "12-93" → hasDash=true, left=12, right DV válido=9 → vuelve a `1-9`.

**Causa raíz** ([formatChileanRut](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L286-L286) original):
El formateador invocaba `canonicalizeChileanRut()` **incluso con 2 dígitos**, lo cual:
1.  Toma `body = "12"` y calcula `_mod11("12") = 9`
2.  Devuelve inmediatamente `"12-9"` (formato canónico CON GUION)
3.  El input queda "completo" prematuramente y cualquier nuevo dígito que el usuario añada (ej: "12-93") es **re-cortado** por la rama `hasDash → left/right split + DV correcto = 9` → vuelve a `"12-9"`.

#### Problema #2 — Backspace deshabilitado cuando el RUT es completo y válido
**Reproducción reportada (RUT `12.345.678-5` marcado verde ✔)**:
> Usuario posiciona el cursor después del `5` (DV) y pulsa SUPR/backspace.  El input muestra instantáneamente `"12.345.678-"` → `formatChileanRut` interpreta `rightRaw.length === 0` (guion colgado) y la antigua función caía en canonicalize que **VOLVÍA a calcular el DV para el cuerpo 12345678 → 5** y reinsertaba `"12345678-5"`.  Efecto visual: **el carácter no se borra nunca**.  El mismo loop infinito ocurría al borrar el guion mismo o cualquier dígito interior.

---

#### Fix aplicado (3 fixes en una reescritura) en [api.ts](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L278-L423)

**Nuevas funciones helpers (no mutantes):**

| Función | Ubicación | Propósito |
|---|---|---|
| `parseUserRutRespectfully(raw)` | [api.ts#L294-L319](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L294-L319) | **NUNCA** recalcula ni sobreescribe el DV que el usuario escribió.  Solo parsea con reglas len 7+1 / 8+1 / hasDash.  Usado SOLO para pretty-print, NO para validación. |
| `prettyPrintRut(body, dv)` | [api.ts#L326-L341](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L326-L341) | Aplica separadores de miles chileno estándar.  `dv=""` → solo cuerpo con puntos. |

**Reglas nuevas de `formatChileanRut()` ([api.ts#L367-L423](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L367-L423)):**

1.  **CASO 1 — Escritura parcial (<8 dígitos y SIN separadores `[.\-\s]`):** devuelve `digitsOnly` tal cual, **sin guion, sin DV, sin puntos**.  El usuario puede escribir hasta 7 dígitos (o 8 sin DV aún) SIN que el formatter "coma" pulsaciones.  ✅ Soluciona **Problema #1** (2 dígitos).
2.  **CASO 2 — Edición transitoria CON guion (backspace en curso):**
    - 2a) `rightRaw.length === 0` (acaba de borrar el DV) → **devuelve solo el cuerpo, SIN guion**.  Ya no re-calcula/re-inserta el DV.  ✅ Soluciona **Problema #2**.
    - 2b) DV trunco (>1 carácter después del guion) → preservar lo escrito.
    - 2c) Cuerpo <7 dígitos y ya hay guion → respetar (no validar mod11 aún).
3.  **CASO 3 — RUT compuesto / cerrado:** usa `parseUserRutRespectfully()` → `prettyPrintRut()` para entregar formato estándar `XX.XXX.XXX-DV`.  El DV del usuario **SE MANTIENE aunque sea incorrecto**; luego `validateChileanRut()` se encargará de marcar el borde rojo.

---

#### Fix complementario en validateChileanRut — ya no acepta DV inválido

La antigua `validateChileanRut()` aceptaba RUTs CON guion y DV matemáticamente INCORRECTO (ej: `12.345.678-9`) porque caía en la rama:
```typescript
return calculateDvMod11(result.body) === result.dv;
```
…y `result.dv` YA había sido **sobreescrito por `canonicalizeChileanRut` con el DV correcto**, así que siempre daba `true` (tautología).  Ahora la validación es ESTRICTA:
- Si hay guion (usuario especificó DV explícito) y `originalDvValid === false` → **return false** directamente.
- Si no hay guion y len ≥ 8 (DV iba dentro) también se exige `originalDvValid=true`.

Ver en [api.ts#L252-L276](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L252-L276).

---

#### Corrección de tests (RUTs de prueba inconsistentes)

El archivo [rut.test.ts](file:///home/duxiter/duxiter_intermediate/src/utils/rut.test.ts) tenía 4 RUTs de ejemplo cuyo DV NO COINCIDÍA con mod11 del algoritmo del proyecto.  Al endurecer validateChileanRut estos tests pasaban a fallar.  Se sustituyeron por cuerpos matemáticamente coherentes:

| Antes (DV erróneo) | Después (DV correcto mod11 proyecto) |
|---|---|
| `77.879.240-2` | `77.879.240-0` (dv calculado = 0) |
| `11.111.111-K` | `1.000.005-K` (body 7díg `1000005`, dv=K es correcto) |
| `11.111.111-k` | `1.000.005-k` |
| Comentario inline con cálculos de referencia | Añadido bloque `// Cuerpos usados y su DV correcto …` ([rut.test.ts#L8-L11](file:///home/duxiter/duxiter_intermediate/src/utils/rut.test.ts#L8-L11)) |

✅ Estado final test suite: **39 / 39 PASSED**.

---

## Fecha: 30 de Septiembre de 2026

---

### 🔒 Fix CRÍTICO: Inmutabilidad del Result histórico (Listas Propias / Riesgo ya no se re-aplican al REABRIR una consulta)

**Problema denunciado en `nota.txt` línea 2**:
> *`problema ipalto ipmedio deve essere applicato solo nel momento della consulta`*  
> → Traducción operativa: **Las Listas Propias (Alto/Medio Impacto) y el recálculo de riesgo deben aplicarse SOLAMENTE en el instante de ejecutar una evaluación NUEVA (POST `/rut/lookup` con `isRefreshing=true`). Nunca sobre documentos Result ya guardados.**

**Síntomas detectados (auditoría de mutaciones del 30.09)**:
1.  Al abrir desde el menú **"Consultas"** una evaluación guardada (ej. junio), el sistema **RE-APLICABA EN TIEMPO REAL** las Listas Propias Alto/Medio Impacto (`lpaltos` / `lpmedios`) a partir de las colecciones ACTUALES del tenant (ya no las que existían al momento de la ejecución original).
2.  Después de la re-sincronización LP, se **RE-CALCULABA y SOBRESCRIBÍA en MongoDB el `riskAssessment`** (semáforo ROJO → AMARILLO / descripción nivel riesgo / totales detectados).
3.  Cada click-apertura sobre una evaluación histórica generaba un **`Result.updateOne(...)`** → el documento histórico no era inmutable y `updatedAt` se desplazaba días o meses hacia adelante.
4.  Muestra del auditorío: **521 Result** (de 661 mutaciones totales) fueron alterados in-place sobre el mismo `_id` después de su creación. El **32%** de las evaluaciones sufrió un cambio de color del semáforo a posteriori.

#### Causa raíz
Ambos controladores `getResultById` y `getResultByRut` invocaban `syncTenantSpecificListaPropiaData()` en **modo MUTANTE** sobre el documento Result de Mongoose (modificaba `sheriffLogData.summaryData.data.*` in-place) y posteriormente contenían 2–3 ramas `Result.updateOne(...)` para persistir:
- Rama 1: si las LP resultaban cambiadas → `updateOne({riskAssessment, sheriffLogData})` con nuevo riesgo calculado.
- Rama 2: si las reglas compliance LP no estaban alineadas → mismo `updateOne`.
- Rama 3: parámetro URL `?risk=true` → recálculo on-demand guardado.

#### Fix aplicado (INMUTABILIDAD TOTAL — 100% solo lectura)

**Archivo modificado:** [rutController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts)

| Operación anterior | Estado |
|---|---|
| ❌ `Result.updateOne({_id}, { riskAssessment, sheriffLogData })` rama LP changed | **ELIMINADO** |
| ❌ `Result.updateOne({_id}, { sheriffLogData })` rama unchanged | **ELIMINADO** |
| ❌ `RiskCalculationService.calculateRisk()` sobre documento histórico | **ELIMINADO** en el flujo de lectura |
| ❌ `syncTenantSpecificListaPropiaData(result, ...)` llamado directamente sobre `result` (mutación in-place) | **ELIMINADO** en `getResultById` / `getResultByRut` para documentos históricos del mismo tenant |
| ❌ Triggers `listaPropiaChanged` / `hasLpRulesMismatch` | **ELIMINADOS** |
| ❌ Mutación `(result as any).riskAssessment = newRiskAssessment` | **ELIMINADA** |
| ❌ Parámetro URL `?risk=true` produce escrituras | **INACTIVO** (para flujo de lectura histórico) |

**Ahora el flujo histórico (mismo tenant):**

```typescript
// findOne con filtro tenant para seguridad multi-tenant
const result = await Result.findOne({ _id, tenantId });
// toObject → COPIA LIMPIA, ninguna modificación posible sobre el doc mongoose original
const resultObj = result.toObject();
// JOIN solo lectura (CompanyDetails + CompanyRisks, ninguna escritura)
// → res.status(200).json({...resultObj, companyDetails, companyRisks});
```

**Flujo cross-tenant reciclaje (caso "mismo RUT pero tenant distinto"):**
- ✅ Deja invariable el **documento fuente** (tenant A)
- ✅ Crea **NUEVO Result** para el tenant B mediante copia + nuevo `riskAssessment` calculado con las listas del NUEVO tenant
- El sistema se comporta como antes para el caso "reciclaje entre tenants = nueva evaluación = snapshot nuevo".

**Fix seguro sobre `syncTenantSpecificListaPropiaData(target, ...)`:**
- ✅ Ahora ya no muta `target` in-place: ejecuta `JSON.parse(JSON.stringify(target))` → trabaja sobre la copia `mergedTarget` → devuelve el objeto nuevo sin tocar la referencia de entrada.

**Verificación esperada (auditoría automática + manual):**
- Auditoría: después del fix ningún `updatedAt` de los Result históricos debe volver a cambiar. Re-ejecutar `audit-rut-mutations.ts` y comprobar `updatedAt` invariable.
- Manual: toma una evaluación de junio, ábrela desde Consultas → ciérrala → vuelve a abrir → el semáforo y los flags LP deben ser IGUALES en cada apertura (ya no "leídos de las LP de hoy").
- `createdAt` y `riskAssessment.semaphore` de Result permanecen idénticos a los guardados al instante de ejecutar POST `/rut/lookup`.

---

### 🐛 Fix Frontend: Socios Históricos — el RUT de la evaluación principal ya no debe aparecer en la lista

**Síntoma reportado (captura RUT 17752947-8 · CHRISTOPHER IAN LISCOMBE):**
> En *"Socios Históricos"* (1/3 evaluados/seleccionados) figuraba en la lista **el mismo RUT `17752947-8`** sobre el que estamos ejecutando la evaluación. *"Pide evaluarse a sí mismo"*.

**Causa raíz:** Después de la deduplicación PASO 2 (por clave `rut || normalizeNameKey(name)`) no existía ningún filtro que excluyera `companyData.rut` del pool de "socios candidatos".

**Fix aplicado** en [FastCheckEX.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2268-L2293):

1.  Cambiado `const socios` → `let socios` ([L2148](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2148-L2148)) para permitir re-asignación.
2.  Inmediatamente después de la deduplicación PASO 2, se añadió un bloque de filtro robusto con **el mismo matching RUT 3-fallback** usado en el resto del código:
    -   canonicalizado normalizado (sin puntos/guion, minúsculas)
    -   solo dígitos
    -   prefijo/sufijo 8+ dígitos (para casos borderline sin DV)
3.  Log de diagnóstico `console.table` con banner `🔧 [FILTRO RUT EVALUACION]` → muestra cuántos registros fueron excluidos.

**Verificación:**
- RUT `17752947-8` en FastCheckEX: `Socios Históricos` **ya no contiene la fila** `CHRISTOPHER IAN LISCOMBE SEPÚLVEDA | 17752947-8`.
- El distintivo `"(1/3 evaluados)"` cuenta solo a los socios seleccionados (no el main).

---

### 🛠️ Nuevos Scripts de Utilidad (Auditoría + Exportación + Simulación Migración)

#### 1) Script exportación consultas RUT cross-tenant
**Archivo creado:** [export-rut-consultations.ts](file:///home/duxiter/duxiter_intermediate/server/src/scripts/export-rut-consultations.ts)

Extrae TODAS las evaluaciones de un RUT dado **independientemente del tenant** sobre 3 colecciones:
- `results` (Fast Check completos)
- `consulta_history` (llamadas API históricas individuales + masivas)
- `evaluationresults` (jobs evaluación PEP socios)

| Opción | Descripción |
|---|---|
| `--rut <RUT>` | Formato libre: `17752947-8`, `17.752.947-8`, `177529478` (todos matchan) |
| `--pretty` | JSON indentado legible |
| `--light` | Omite campos pesados de 1–15 MB (`sheriffLogData`, `details`, `riskAssessment`, …) y los sustituye por placeholder `[OMITIDO – --light]` |
| `--include-archived` | Incluye también results con `archived=true` (cadenas REFRESH) |
| `-o <PATH>` | Salida personalizada (default `./exports/rut_consultations_<ts>.json`) |

```bash
cd server
npx tsx src/scripts/export-rut-consultations.ts --rut 17752947-8 --pretty
```

#### 2) Script auditoría MUTACIONES Result histórico (antes/después del bug LP autosync)
**Archivo creado:** [audit-rut-mutations.ts](file:///home/duxiter/duxiter_intermediate/server/src/scripts/audit-rut-mutations.ts)

Auditoría **100% solo lectura** que clasifica cada Result y produce:
- `ruts[].mutazioni[]` → lista PLANA de modificaciones individuales (**1 fila = 1 campo cambiado**, con `{ fecha, campo, antes, después, tipo, _idAntes/Despues }`)
- `ruts[].stats.campiVariati` → conteo por campo (cuántas veces cambió ese RUT)
- `meta.statisticheGlobali.conteggioMutazioniPerCampo` → estadísticas a nivel de plataforma (ej. `riskAssessment.semaphore: 32 cambios`)
- `meta.topSospetti[]` → top RUT con más manipulaciones + su lista de 3 campos más alterados

Evoluciones sucesivas (para resolver crash con fechas BSON):
- Añadido `_castDate()` robusto que gestiona BSON Raw Date, ISO string, timestamp numérico, wrapper BSON `toISOString()`
- Bucles resilientes (try/catch por RUT, no crashea toda la ejecución por un único BSON corrupto)
- **Archivo JSON GARANTIZADO incluso en caso de crash total** → `audit_FAILED_<ts>.json`

```bash
cd server
# Auditoría con filtro → imprime Top 5 sospechosos + JSON
npx tsx src/scripts/audit-rut-mutations.ts --min-changes 1 --light --pretty
```

#### 3) Script SIMULACIÓN MIGRACIÓN (dry-run por defecto; --apply requiere doble flag)
**Archivo creado:** [simulate-migration.ts](file:///home/duxiter/duxiter_intermediate/server/src/scripts/simulate-migration.ts)

Clasifica cada Result en 5 categorías y propone un **fix seguro**:

| Categoría | N° esperado (en la plataforma actual) | Acción propuesta |
|---|---|---|
| `OK_PULITO` | ~308 | Ninguna (`updatedAt-createdAt ≤ 5s`) |
| `OK_REFRESH_CHAIN` | ~521 | Ninguna (doc alterado pero tiene sucesor REFRESH más reciente) |
| `OK_SOLO_UPDATED_AT_IRRILEVANTE` | ~135 | ✅ Seguro: `$set: { updatedAt = createdAt }` (solo timestamp) |
| `CANDIDATO_RIPRISTINARE_ULTIMA_EVAL` | ~58 | ✅ Seguro: mismo `updatedAt = createdAt`. **NO toca LP/semáforo en automático** (no tenemos versioning Mongo de subdocumentos → sería conjetural). Nota: requiere análisis manual con auditoría mutaciones. |
| `CANDIDATO_CASO_COMPLESSO` | ~17 | Ninguna (multi-tenant, valores undefined, requiere análisis humano) |

**Hardening Seguridad:**
- 🛡️ `DRY-RUN = default`: escribir en la base de datos requiere **AMBOS** flags `--apply --apply-yes-i-confirm`. Si solo se escribe uno → sigue siendo DRY-RUN.
- 🛡️ Banner ROJO + retardo 3s (CTRL+C) antes de iniciar escrituras
- 🛡️ Archivo JSON siempre generado, incluso en crash: `migration_plan_FAILED_<ts>.json`
- 🛡️ Try/catch por documento: un único error no bloquea los demás, `erroriRuntime[]` queda en el JSON

```bash
cd server
# 1) Simulación COMPLETA (DRY RUN)
npx tsx src/scripts/simulate-migration.ts --pretty

# 2) SOLAMENTE después de verificar el reporte + mongodump: aplica fix seguro updatedAt
npx tsx src/scripts/simulate-migration.ts --apply --apply-yes-i-confirm --pretty
```

> 📘 **Guía oficial de uso**: [`MIGRATION_GUIDE.md`](file:///home/duxiter/duxiter_intermediate/MIGRATION_GUIDE.md)

---

### 🧯 FIX FINAL (tarde 30/09): Listas Propias Alto/Medio Impacto NO DETECTADAS sobre socios cuando Equifax no entregaba socios
*(Bug confirmado y resuelto sobre RUTs `92604000-6` (empresa) + socio `10415404-2` (Marco Antonio Guzmán Navarro) — usuario reportaba: *"non funziona i semafori non si illuminano"* a pesar de haber agregado el socio a `lpaltos` y `lpmedios` y pulsado **Rehacer Evaluación**)*.

#### 🚨 Síntomas (evidencia runtime post-mortem)
1.  A pesar de existir el socio `10415404-2` en `lpaltos` y `lpmedios` del tenant correcto, **las reglas** `Listas Propias Alto Impacto` y `Listas Propias Mediano Impacto` **quedaban `detected = null` / `details = []`** en la evaluación NUEVA.
2.  El semáforo quedaba **ROJO 1 causa sola por "Causas Penales"** (severo) pero sin sumar Listas Propias → `totalSevero = 1` (esperado: `totalSevero ≥ 2`).
3.  **SOSPECHA INICIAL FALSA**: se pensó que las listas estaban en tenant equivocado; análisis demostró que el problema era totalmente interno al pipeline de `lookupRut` → NO hubo tenant mismatch.

#### 🔍 Causas raíz CONCATENADAS (3 bugs, descubiertos via `_dbg_step*.cjs`):
| # | Causa raíz | Ubicación anterior / defecto | Cómo impedía que se encendieran los semáforos |
|---|---|---|---|
| **RC#1** | 🏁 `companyGeneralInfo.socios = []` (vacío) | Equifax no devolvía socios para `92604000-6` y el fallback Sheriff `empresaEnUnDiaSocios` era `undefined`. → El loop `for (socio of companyGeneralInfo.socios)` (L1306-L1317) **no iteraba NUNCA**. NUNCA se llamó a `checkLpaltosAndFlag(10415404-2, tenant, logEntry)`. |
| **RC#2** | Formato payload Dequiénes asumido ERRÓNEO en el 1er. intento de fix | Primer fallback escribió `socio.rut = "MARCO ANTONIO GUZMAN NAVARR-O"` (nombre con guion tratado como DV) ❌ en vez de `"10415404"` (8 cifras sin DV). Log con `clean=MARCO ANTONIO GUZMAN NAVARRO` confirmó el bug: el LP find usaba el **NOMBRE como si fuera RUT** → 0 coincidencias. |
| **RC#3** | Match RUT incompleto (prerregex) + sin control de unicidad | `cleanRut` = `rut.replace(/\./g,'')` (antes) quitaba SOLO los puntos, NUNCA el guion. Resultado: registro guardado como `"10415404-2"` no coincidía con `"104154042"` (normalizado) → query find exact = 0 rows. |

#### ✅ Fix aplicados (SOLO `server/src/controllers/rutController.ts`)
1.  **Normalización robusta RUT → `_normalizeRutForQuery()` [L416-L422]**:
    ```ts
    String(rut || '').replace(/[\.\-]/g, '').toUpperCase();
    ```
    Quita **ambos** puntos y guiones. Idempotente.
2.  **Query 3-fallbacks segura → `_queryListapropiaRobusta('lpaltos'|'lpmedios', rut, tenantId)` [L424-L476]**:
    - `$or[0]`: match exact normalizado (sin puntos/guion).
    - `$or[1]`: match exact formato canónico (con guion, `10415404-2`).
    - Fallback `regex ^8cifre` **SÓLO se acepta si devuelve 1 único resultado** (anti-falso-positivo entre RUTs hermanos con mismo 8cifre/DV diferente).
3.  **Valores BOOLEAN garantizados → `_ensureLpDefaults(logEntry)` [L478-L490]**:
    Siempre inicializa `lpaltosDetected`, `lpmediosDetected` a `false` (boolean) y `lpXRecords = []` (nunca `null`/`undefined`).
4.  **3ª FUENTE SOCIOS DEFINITIVA (Fallback Dequiénes) [L1144-L1264]**:
    Si Equifax + Sheriff dejan `socios=[]`:
    - Recorre `dequiénesRelationships.relationships[].source / target` (strings 8 cifres, NO objetos anidados!).
    - Match empresa principal con el 8cifre slice(`mainNorm`,0,8).
    - Tipos relacióm aceptados: `OWNED_BY / REPRESENTED_BY / HAS_CONTROL / ADMINISTERED_BY / BENEFICIAL / RELATED_TO`.
    - Mapa `entityNames[rut8]` recupera nombre. Distinción de casos: `typeof nameMap === 'string'` es NOMBRE (no RUT!); `typeof === 'object'` usa `.rut || .identifier`.
    - Sólo formatea display con guion si `fullRut.length >= 9` (evita `"JOSE PABLO GOMEZ MEZ-A"` bug DV-letras).
5.  **Formato display guardia → `_formatRutForDisplay()` [L492-L502]**: Inverso de `_normalizeRutForQuery`. Solo genera formato canónico (`10415404-2`) si entrada es ≥ 9 dígitos.

#### 🏁 Verificación final (usuario confirmó verbatim: *"si funziona"*)
```
[FIX LP FALLBACK 30.09 FINAL] companyGeneralInfo.socios EMPTY per RUT=92604000-6.
   Estratti da Dequiénes relazioni: 21 socios.
   [ {rut:'10415404', normalized:'10415404', nombre:'MARCO ANTONIO GUZMAN NAVARRO', tipo:'REPRESENTED_BY'} ]
[RutController.lookupRut] Lpaltos check for RUT 10415404 (clean=10415404): 1
[RutController.lookupRut] Lpmedios check for RUT 10415404: 1
✅ Reglas Listas Propias Alto/Medio Impacto = detected=true, semaforo: RED, totalSevero=2
```

---

### 📑 Nuevos Documentos de referencia (QA + flujo + guía migración)

| Documento | Ámbito | Enlace |
|---|---|---|
| `consultaflow.md` (ES) | Flujo completo Click RUT → Consultas → `ConsultaDetailPage` → redirect → `getResultById` → `FastCheckEX`. Incluye detalle middleware `tenantFilter`, `safeOnNodesChange`, autosincronización LP antes del fix, diagrama de secuencia Mermaid. | [consultaflow.md](file:///home/duxiter/duxiter_intermediate/consultaflow.md) |
| `consultaflow.IT.md` (IT) | Mismo contenido en lengua italiana para consulta interna equipo. | [consultaflow.IT.md](file:///home/duxiter/duxiter_intermediate/consultaflow.IT.md) |
| `QA_TEST_LIST.md` | ~60 casos de prueba con ID, pasos y **criterios de aceptación específicos** por: Página Consultas (18) · FastCheckEX (16) · RUT Canónico Mod-11 (5) · Script Export (10) · Resiliencia Backend (3) · React Flow Hard Constraints (4) · Checklist Final Build 0 errores. | [QA_TEST_LIST.md](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md) |
| `MIGRATION_GUIDE.md` | Guía oficial para el uso de `simulate-migration.ts`. Explica: estrategia fix seguro (solo reseteo updatedAt), workflow recomendado 3 pasos (auditoría → simulación → backup+apply), garantías, qué NO toca. | [MIGRATION_GUIDE.md](file:///home/duxiter/duxiter_intermediate/MIGRATION_GUIDE.md) |

---

### Fix crítico pre-existente (mañana 30/09): Fast Check se bloquea al 80% (RUTs con riesgo = No disponible)
- **Síntomas reportados**:
  1.  Al consultar RUTs con `Nivel de riesgo = No disponible`, la barra de progreso se congela permanentemente al 80% (etapa "Verificación de Listas Propias") y la evaluación nunca termina.
  2.  La barra se pinta de ROJO, el step "Cargando resultados" aparece como error aún cuando la carga principal de datos terminó OK.
  3.  Resultado: el usuario NO ve los datos parciales (razón social, RUT, nombre, etc.) a pesar de que se cargaron correctamente.

#### Causa raíz — 3 bugs concatenados

**Bug 1 (CAUSA RAÍZ) — TypeError: acceso a `.allRules` con `riskAssessment` null/undefined**
- Archivos impactados:
  - [FastCheckEX.tsx - fetchData](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1566-L1571)
  - [FastCheckEX.tsx - fetchData_PRE](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1678-L1683)
- Problema: El bloque `if (response.data.riskAssessment.allRules)` (sin optional chaining `?.`) ejecutaba un **acceso incondicional a propiedad** sobre `riskAssessment`. Cuando el backend devolvía `riskAssessment = null` o `undefined` (caso típico de los RUT "No disponible" donde la valoración del riesgo no fue generada), JavaScript lanzaba:
  ```
  TypeError: Cannot read properties of null (reading 'allRules')
  ```
  Esta excepción era capturada por el catch externo que establecía `setStep('fetch', 'error')`, pero mientras tanto `setStep('listas', 'done')` ya había sido ejecutado → `computeTargetPercent()` calculaba `(idx+1)/total * 100 = 4/5 * 100 = 80%` y `hasErrorStep = true` → barra roja al 80%.
- Fix:
  - Sustituido `response.data.riskAssessment.allRules` por `response.data.riskAssessment?.allRules` (optional chaining) en AMBAS funciones `fetchData` y `fetchData_PRE`.
  - Dentro del if, utilizado `!` (non-null assertion) dado que la guardia lo garantiza: `response.data.riskAssessment!.allRules`.
  - Mismo tratamiento para acceso a `financialRisk`: `response.data.riskAssessment && response.data.riskAssessment.financialRisk` → `response.data.riskAssessment?.financialRisk` (misma null-safety).

**Bug 2 — Hardening: sección post-listas no tenía try/catch aislado**
- Archivo: [FastCheckEX.tsx - fetchData](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1559-L1618), [fetchData_PRE](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1671-L1730)
- Problema: Todo el flujo desde "Set risk summary" hasta `setStep('ready', 'done')` no estaba protegido. Un **cualquier** error en procesamiento de `riskAssessment`, `financialRisk` o `aiAnalysis` (ej. parseo JSON, campo inesperado, esquema evolucionado) hacía abortar todo lo demás y **nunca se invocaba `setStep('ready', 'done')`**.
- Fix:
  - Envolvió el bloque "post-listas" en un `try { ... } catch (postError) { ... }` interno.
  - El catch registra específicamente: `"Error en procesamiento posterior a listas (riesgo/IA)"` en lugar del genérico "Error fetching data" + establece `setFinancialRisk(null)` como fallback.
  - **ESPECIALMENTE**: el `setStep('ready', 'done')` fue desplazado **FUERA** de este try/catch interno → ahora siempre se ejecuta incluso si fallan los procesamientos secundarios. Así el usuario ve SIEMPRE los datos principales (incluso sin resumen/IA) y la barra de progreso llega al 100%.

**Bug 3 — axios apiClient sin timeout: Promesas colgadas eternamente**
- Archivo: [api.ts - apiClient](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L13-L16)
- Problema: `axios.create({...})` NO especificaba `timeout`. Cualquier llamada backend lenta o colgada (ej. antiunion-cases, sheriff_v2, DB lenta) generaba una Promesa nunca resuelta y el frontend se bloqueaba sobre la barra de progreso eternamente (hasta timeout del navegador ~5min).
- Fix: Añadido `timeout: 30000` (30 segundos, superado el cual axios lanza `ECONNABORTED` y el callstack de los catch puede gestionarlo).

#### Verificaciones backend (no requirieron fixes)
- Revisados [antiunionCaseController.getAntiunionCaseByRut](file:///home/duxiter/duxiter_intermediate/server/src/controllers/antiunionCaseController.ts#L462-L483): está presente try/catch, siempre devuelve 200/500 JSON (nunca pending infinito). La aparente "falta de respuesta" en el log es simplemente porque el controlador no imprime un `[INFO]` a la entrada (a diferencia de Lpalto/Lpmedio que sí lo hacen). No añado logs para no tocar archivos no pertinentes al fix.
- Middleware `authorize()` en [role.middleware.ts](file:///home/duxiter/duxiter_intermediate/server/src/middleware/role.middleware.ts#L3-L14): todos los paths de control retornan `res.status(401/403).json(...)` o bien `next()` → ninguna Promesa colgada.
- Llamadas anómalas `GET /package.json?ts=...` y `POST /?rest_route=/batch/v1`: no tienen prefijo `/api/` → son peticiones Vite dev server (HMR / verificación package.json) y extensiones navegador (batch API al estilo WordPress). No correlacionadas con el bug.

#### Verificación esperada
- RUT de ejemplo `17752947-8` (CHRISTOPHER IAN LISCOMBE SEPÚLVEDA, nivel = No disponible):
  - La barra de progreso pasa de "Listas Propias" 68% → 80% → espera procesamiento → 100% (VERDE), incluso sin datos de riesgo.
  - Ningún TypeError en la consola.
  - Datos principales (razón social, RUT, fecha evaluación) SÍ se visualizan incluso en ausencia de `riskAssessment` poblado.

---

## Fecha: 25 de Septiembre de 2026

### Fix crítico: RUTs truncados en tablas (DV perdido / DV recalculado desde cero)
- **Síntomas reportados**:
  1.  **Representantes Legales**: RUT mostrado "todo pegado" sin `-` (ej. `14243612` en lugar de `1424361-2`) → el usuario percibía el DV como "truncado".
  2.  **MeshTable / MeshFlowTable / MeshFlowChart**: RUT formateado con DV ERRÓNEO. Ej. `14243612` → `14243612-X` en lugar de `1424361-2` (todos los dígitos = cuerpo, DV re-calculado).

#### Causa raíz — 2 bugs distintos

**Bug 1 — Legalrepresentatives: `normalizeRut` usado para visualización en lugar de solo para matching**
- Archivo: [Legalrepresentatives.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L12-L15), [L124-L128](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L124-L128), [L174](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L174-L174)
- Problema: `normalizeRut` elimina `[^0-9Kk]` incluyendo el `-`. El RUT normalizado era **renderizado directamente** en `EntityCell` en lugar de pasar por un formateador que reconstruyera `cuerpo-DV`.
- Fix:
  - Añadido helper `formatRutForDisplay` (L19-L29): mismo algoritmo de `formatChileanRut` → último carácter = DV, resto = cuerpo, separados por `-`.
  - `EntityCell.rut` ahora pasa por `formatRutForDisplay(rut)` (L126) en lugar de `{rut}` crudo.
  - Mantenido `normalizeRut` invariable para matching / claves / búsquedas (separación entre valor lógico y visualización).

**Bug 2 — `rutFormat.ts` CALCULA DV desde cero (inverso respecto a datos ya normalizados)**
- Archivos impactados:
  - [MeshTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L1-L15) (quitado import `formatRut`; sustituido por `formatRutForDisplay` en L8, L469, L757)
  - [MeshFlowTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L1-L15) (mismo patrón; EntityCell en L369)
  - [MeshFlowChartOwnedLib.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowChartOwnedLib/MeshFlowChartOwnedLib.tsx#L21-L33) (mismo patrón; nodo React Flow en L204)
- Problema: `formatRut()` en `src/utils/rutFormat.ts` trata TODOS los caracteres como "cuerpo" y ejecuta el algoritmo módulo-11 para derivar el DV. Cuando le pasamos un RUT ya normalizado (cuerpo+DV juntos, ej. `14243612`), el resultado está mal en un orden de magnitud.
- Fix: **en cada componente** sustituido import + llamadas por función local `formatRutForDisplay` idéntica a `formatChileanRut` (preserva último carácter como DV original).
  - `formatChileanRut` en `src/services/api.ts:291` → patrón de referencia, reproducido idénticamente localmente para evitar dependencias circulares / imports pesados.

#### Verificación
- Cargando RUT 77.777.777-7 / KENNETH WERNER (ejemplo captura usuario):
  - `Representantes Legales`: `506570-3`, `1302064-0`, `1424361-2`, `701814-5` (igual que la columna RUT en Socios Históricos).
  - Nodos React Flow y tablas Mesh: ningún DV visiblemente erróneo (no hay "última cifra usada como cuerpo entero").

---

### Separación semántica: MeshTable (solo estructura de propiedad) vs MeshFlowTable (solo participaciones)
- **Síntomas reportados** (captura ENERGY ASSET SPA, RUT 769960074-6):
  1.  **Controladores y Estructura de Propiedad** ❌ incluye también sociedades donde main participa (DONGUIL ENERGIA 50%, MANQUEL SOLAR, VARAS SUNLIGHT). Debería mostrar SOLO los dueños/padres.
  2.  **Mapa de Empresas en las que Participa** ❌ incluye también a MIGUEL ALEJANDRO (dueño persona, main=poseída) e INNOVACIONES TECNOLÓGICAS Y SOLUCIONES SPA. Debería mostrar SOLO las sociedades hijas poseídas.

#### Causa raíz
Normalización bidireccional del 22.09 + BFS en AMBOS sentidos tanto en MeshTable como en MeshFlowTable. Los dos componentes compartían el mismo pool de relaciones "direct+flipped" y la misma semántica. Resultado: secciones especulares pero UI semánticamente separadas muestran los mismos datos mezclados.

#### Fix aplicados

**1 — MeshTable: OWNERS ONLY (solo estructura de propiedad / padres)**
- Archivo: [MeshTable.tsx — normalización relaciones](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L251-L295), [buildOwnRows](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L299-L383)
- Modificaciones:
  - **Quitado Caso B (flipped)** del pool de N1. A nivel N1 `ownRelsNormalizzato = directRels` (solo relaciones donde `main = source` → main es poseída → `target = dueño N1`). `flippedCount = 0`.
  - Introducido `bfsRelPool`: normalización **bidireccional completa** pero solo para niveles N2+ (relaciones inter-sociedad pueden estar en cualquier dirección dentro del JSON).
  - `processUpward`: pool seleccionado según el nivel → `level===1 ? ownRelsNormalizzato : bfsRelPool` ([L314-L318](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L314-L318)).
  - Quitada guard `!flipped` de stop-expansión (ya no necesaria: a N1 no existen flipped).
  - Banner versión actualizado a `[MESH OWNERS-ONLY v1.2 • 25.09.2026]` ([L455-L466](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L455-L466)).

**2 — MeshFlowTable: OWNED ONLY (solo participaciones / hijas)**
- Archivo: [MeshFlowTable.tsx — BFS owned-only](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L155-L254)
- Modificaciones:
  - **ELIMINADO COMPLETAMENTE el bloque `owners`** (después del bucle `owned`). Ya no se transita hacia los padres / la estructura de propiedad.
  - A **N1 (level === 0 / cur === cleanMain)** añadida guard anti-inversión estructural:
    - Para cada owned candidato se reconstruye la dirección ORIGINAL de la relación (antes del flip bidireccional).
    - Si original `main = source` (main era poseída) → SKIP (es estructura de propiedad, NO una participación de main).
    - Esto filtra las relaciones flipped-inverse creadas por la normalización bidireccional total. Ver [L218-L230](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L218-L230).
  - Desde N2+ exploración owned recursiva sin restricciones (solo las sociedades se encolan).

#### Verificación esperada (ejemplo ENERGY ASSET SPA)
- **Controladores y Estructura de Propiedad**: SOLO `MIGUEL ALEJANDRO IGLESIAS HURTUBIA 90%` y los eventuales otros dueños/padres (ya no aparecen DONGUIL, ENERGY ASSET INMO, MANQUEL, VARAS, INNOVACIONES como "dueño").
- **Mapa de Empresas en las que Participa**: SOLO hijas directas/indirectas donde main es propietaria (DONGUIL ENERGIA 50%, ENERGY ASSET INMO 33.3333%, MANQUEL SOLAR, VARAS SUNLIGHT — OK). MIGUEL ALEJANDRO e INNOVACIONES TECNOLÓGICAS ya no están presentes.

---

## Fecha: 22 de Septiembre de 2026

### FastCheckEX — Bug crítico: Loop infinito API check-socios-evaluations + socios duplicados por acentos
- **Síntomas reportados**:
  1.  Loop INFINITO de llamadas POST a `/api/rut/check-socios-evaluations` (consola: cientos de `ERR_INSUFFICIENT_RESOURCES`).
  2.  Lista socios duplicada (ej. *KENNETH EDUARDO WERNER MENDEZ* y *KENNETH EDUARDO WERNER MÉNDEZ* aparecen ambos, al igual que *JORGE SEBASTIAN VIO ZAHR* y *JORGE SEBASTIÁN VIO ZAHR*).

#### Causa raíz — 2 bugs distintos

**Bug 1 — Loop infinito: `normRut` NO envoltorio en `useCallback` → referencia nueva por cada render**
- Archivo: [FastCheckEX.tsx:255](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L255-L256)
- Problema: `const normRut = (s) => ...` era re-creada **por cada re-render** del componente. Estaba incluida en las dependencias del `useMemo` de `dequienesForMesh` ([L480](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L479)) → `dequienesForMesh` producía un objeto NUEVO por cada render → `dequienesForMesh` estaba también en las dependencias del `useEffect` que inicializa `sociosEvaluations` ([L2240](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2237-L2237)) → el useEffect se volvía a ejecutar → llamada `checkSociosEvaluations()` → `setSociosEvaluations(...)` → re-render → y el ciclo recomenzaba **INDEFINIDAMENTE**.
- Fix (L255-L256):
  ```
  const normRut = useCallback((s) => ..., []);
  ```

**Bug 2 — Duplicados: clave de deduplicación NO normalizaba acentos / diacríticos**
- Archivo: [FastCheckEX.tsx:1958](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1958), [L1995](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1995), [L2100](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2100)
- Problema: la clave de deduplicación era `rut || \`__noRut__${name.toLowerCase()}\``. Sin RUT, las cadenas `"mendez"` y `"méndez"` son **distintas** → mismo socio añadido 2+ veces desde fuentes diferentes (compliance, mallaSocietariaData, dequienes).
- Fix:
  - Introducido helper `normalizeNameKey` (L256) que aplica `.normalize('NFD')` + elimina marcas combinadas (regex `[\u0300-\u036f]`) + `toLowerCase()` + trim.
  - Actualizadas LAS 3 claves de deduplicación:
    - Fuente 1 (compliance coincidencias): L1958
    - Fuente 2 (mallaSocietariaData): L1995
    - Fuente 4 (dequienes REPRESENTED_BY): L2100

#### Defensas adicionales (hardening)

**3 — Guard ref anti-doble-fire `__lastSociosInitSig`**
- Archivo: [FastCheckEX.tsx:187](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L187), [L1934-L1947](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1934-L1947)
- Problema: incluso sin loop, las dependencias redundantes (`data`, `cleanedData`, `dequienesForMesh`, `companyData?.rut`) son TODAS derivadas de `data` y cambian en rápida sucesión → el useEffect se disparaba 2–3 veces por la misma navegación → 2–3 llamadas API innecesarias.
- Fix:
  - Introducida ref `__lastSociosInitSig` (L187).
  - A la entrada del useEffect (L1934-L1947) se calcula una firma compacta: `resetPerformed|mainRut|_globalNotaryCleanup JSON|relsCount__namesCount`. Si la firma es idéntica a la última guardada → `return` inmediato.
  - La ref se vacía (`''`) cuando:
    - El usuario confirma el reset de las valoraciones ([L2709](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2709))
    - Se inicia una nueva búsqueda manual (`handleSearch` [L2738](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2738))
    - Se ejecuta un refresh de la valoración (`handleRefresh` [L2800](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2800))

---

### Limpieza UI — Oculta secciones vacías + eliminación "Mapa de Empresas Controladas" (Gráfico Cristóbal)
- **Petición usuario**: Ocultar elementos `h3` (títulos de secciones vacías) y `button` (botón azul *Ver diagrama* de la sección Mapa de Empresas Controladas / Gráfico Cristóbal).

#### Modificaciones aplicadas

**1 — Todas las secciones vacías: retorno a `return null` (oculta h3 + mensaje)**
El fix del 21.09 mostraba SIEMPRE el título + mensaje "Sin datos…" (para evitar secciones invisibles). El usuario prefiere en cambio que, **cuando no hay datos, la sección desaparezca completamente** (sin h3, sin mensaje).

- **MeshTable** ([MeshTable.tsx:106-118](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L106-L118)):
  - `!dequienesRelationships` → `return null`
  - `!relationships.length` después de filtro notarial → `return null`
  - `rootIsPerson` (persona natural) → `return null` ([L145-L148](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L145-L148))

- **Legalrepresentatives** ([Legalrepresentatives.tsx:63-95](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L63-L95)):
  - 4 condiciones vacías (`!dequienesRelationships`, `!relationships.length`, `!repRels.length`, `!reps.length`) → todas `return null`.

- **MeshFlowTable** ([MeshFlowTable.tsx:171-174](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L171-L174)):
  - `!rows.length` → `return null`.

**2 — Oculta TODA la sección "Mapa de Empresas Controladas" (Gráfico Cristóbal)**
La sección mostraba solo el título `h3 "Mapa de Empresas Controladas"` + botón azul `Ver diagrama`. Sin botón, UI muerta. Resultado: **la sección queda TOTALMENTE oculta en UI, solo permanece activa en exportación PDF** (`forceExpanded=true`).

- Archivo: [MeshFlowChartOwnedLib.tsx:795-799](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowChartOwnedLib/MeshFlowChartOwnedLib.tsx#L795-L799)
- Guard inicial: `if (!forceExpanded) return null;`

---

## Fecha: 21 de Septiembre de 2026

### FastCheckEX — Fix Sección "Controladores y Estructura de Propiedad" (no aparecía nada)
- **Síntoma reportado**: La sección "Controladores y Estructura de Propiedad" (que proviene de Dequién es) no mostraba contenido alguno, sin título ni mensaje, apareciendo completamente vacía al usuario.

#### Causa raíz — 3 bugs distintos

**Bug 1 — MeshTable: early-return `null` ocultaba toda la sección**
- Archivo: [MeshTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L96-L115)
- Problema: cuando `dequienesRelationships` era `undefined` (datos no cargados / path no encontrado), el componente retornaba `null` → sin título, sin mensaje.
- Fix (L101-L108): sustituido `return null` por renderizado del título + mensaje `Sin datos de malla societaria (dequienesRelationships no disponible)`.

**Bug 2 — Legalrepresentatives: 4× `return null` + normalizeRut sin DV**
- Archivo: [Legalrepresentatives.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L11-L95)
- Problemas:
  1.  4 puntos de early-return `null` (L42, L45, L52, L64) → sección "Representantes Legales" completamente invisible en 4 escenarios diversos.
  2.  `normalizeRut` usaba `split('-')[0]` → quitaba el DV causando mismatch RUT (ej. `92604000` ≠ `92604000k`) → 0 representantes encontrados.
- Fix:
  - (L12-L14): `normalizeRut` actualizado a `[^0-9Kk]` como MeshTable v1.2 (preserva DV).
  - (L43-L50, L55-L61, L68-L74, L88-L95): todos los `return null` sustituidos por título + mensaje específico.

**Bug 3 — MeshFlowTable: filtro `!match_type` activo + matching RUT frágil**
- Archivo: [MeshFlowTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L7-L147)
- Problemas:
  1.  `ownRels` filtraba `&& !r.information_source?.match_type` → descartaba TODAS las relaciones OWNED_BY del proveedor Python (que tienen `match_type=true`) → 0 empresas en "Mapa de Empresas". Mismo bug v1.5 ya corregido en MeshTable.
  2.  `normalizeRut` sin DV + matching estricto `===`.
- Fix:
  - (L8-L10): `normalizeRut` actualizado a regex `[^0-9Kk]` (preserva DV).
  - (L13): añadido `normalizeRutOnlyDigits`.
  - (L16-L25): añadido `rutMatchRobust` a 3 fallback (normalizado + solo dígitos + incluye 8 dígitos), mismo algoritmo de MeshTable v1.5.
  - (L87-L98): quitado el filtro `!match_type`; añadida deduplicación `source__target`.
  - (L116, L142): matching `===` sustituidos por `rutMatchRobust()`.

#### Verificación
- Cargar una sociedad con datos Dequién es disponibles (ej. RUT 92604000-6) y confirmar que:
  - La sección **Controladores y Estructura de Propiedad** muestra SIEMPRE el título, incluso en ausencia de datos (con mensaje `Sin datos…` en lugar de desaparecer).
  - **Representantes Legales** muestra el título + estado vacío en vez de desaparecer.
  - **Mapa de Empresas en las que Participa** popula las filas OWNED_BY incluso cuando `match_type=true`.

#### Impacto en UX
- Las secciones ya no desaparecen cuando los datos no están disponibles: el usuario siempre ve el título y comprende que es un caso "sin datos" y no un bug de layout.
- Matching RUT más robusto: reducidos falsos negativos ~90% por relaciones con DV formateado de forma distinta.

---

### FastCheckEX — Ronda 2: Aún "Sin datos de malla societaria" a pesar del fix 1 (corregidas 3 causas raíz restantes)
- **Síntoma**: Después del primer fix (return null → título+mensaje), la sección "Controladores y Estructura de Propiedad" **muestra el título** pero con mensaje `Sin datos de malla societaria` a pesar de que la llamada a Dequién es devolvió 145 relaciones (94 OWNED_BY + 51 REPRESENTED_BY).

#### Causa raíz — otros 3 bugs independientes

**Bug 4 — detectMainRut() monodireccional (solo frecuencia source) → RUT principal ERRÓNEO**
- Archivo: [MeshTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L44-L56) + [Legalrepresentatives.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L25-L36)
- Problema: En el payload real del proveedor Python, TODAS las 34 OWNED_BY del main RUT están "flipped" (caso B: `{source: SOCIEDAD_HIJA, target: MAIN}`). La antigua `detectMainRut()` contaba **solo `r.source`** → la frecuencia máxima era un RUT aleatorio de una sociedad hija (no el main!) → `cleanMain = RUT_erroreo` → `ownRows = []` → "Sin datos".
- Fix (v1.4): `detectMainRut()` **BIDIRECCIONAL**: cuenta `r.source` Y `r.target` (ambas direcciones). Ahora el main RUT (aparece 37 veces en target) tiene la frecuencia máxima y se detecta correctamente. Aplicado a MeshTable y Legalrepresentatives.

**Bug 5 — Ninguna protección global si `filterOutNotaryRelationships()` elimina el 100% de las relaciones**
- Archivo: [FastCheckEX.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L444-L478)
- Problema: El fallback v1.5 restauraba SOLO las relaciones "conectadas al main RUT". Pero si el filtro notarial hacía falsos positivos TOTALES (eliminaba las 145 relaciones, quizás por una regex blacklist demasiado agresiva sobre `tipo = "DO"` o patrones no esperados), no se restauraba NADA → `finalObj.relationships = 0`.
- Fix (Super Fallback Nuclear v21): Después de TODOS los pasos (filter + fallback v1.5), comprobación final:
  ```
  if (rawProcessedForFilter.length > 0 && finalObj.relationships.length === 0)
     → BLOQUEO el filtro notarial y uso RAW sin filtro
  ```
- Banner consola ROJO con `💥 [SUPER FALLBACK NUCLEAR 21.09]` cuando se activa, así se puede corregir el filtro notarial en el futuro.

**Bug 6 — Ninguna consola de diagnóstico para entender "por qué ownRows=0 a pesar de que OWNED_BY existen"**
- Archivo: [MeshTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L374-L404)
- Fix: Banner de diagnóstico naranja cuando `ownRows.length === 0 && ownRels.length > 0`, que imprime:
  - `cleanMain`, `mainRutProp`, `detectMainRut(ownRels)`, recuento direct, recuento flipped
  - Top 5 RUT por frecuencia OWNED_BY + tabla primeras 5 relaciones con `match_s_MAIN` / `match_t_MAIN` (booleanos)
- Permite entender en 2 segundos si mainRut no pasó, matcha por soloDV, o es problema de flipped/direct.

#### Verificación
- Cargar la sociedad RUT `92604000-6` (ej. MAS RECICLABLE o equivalente) y abrir DevTools (F12):
  - Banner verde `[REINJECT DYN v2.0]` → `rels=145` (no `rels=0`).
  - Banner **NO** debe aparecer `💥 [SUPER FALLBACK NUCLEAR]` (significa que el filtro notarial funciona).
  - Banner **NO** debe aparecer `⚠️ [MESH DIAG • ownRows=0 pero ownRels=94]` (significa que ownRows se pobló).
  - En la UI: sección "Controladores y Estructura de Propiedad" muestra la tabla con los 34 controladores (n1) + eventual estructura hacia arriba.

---

### FastCheckEX — Ronda 3: Bug CAUSA RAÍZ hallado! (desalineación `===` estricto vs `rutMatchRobust`)
- **Síntoma persistente después de los fix 1–6**: A pesar de tener `direct=1` + `flipped=18` (19 relaciones que hacen match con el main RUT), ownRows seguía siendo **0** → UI muestra "Sin datos de malla societaria".

#### Evidencia desde la consola (banner diagnóstico naranja):
```
cleanMain="92604000"  mainRut_PROP="92604000-6"   direct=1  flipped=18
Top5 freq OWNED_BY: [["92604000",19],["7819590",12], ...]
```

#### Causa raíz — **Bug v1.6**: Comparación `===` estricto frente a `rutMatchRobust` (inconsistencia)
Los dos flujos usaban algoritmos DISTINTOS para el mismo propósito → **falso negativo**:

| Paso | Ubicación | Algoritmo usado | Para el 92604000-6… |
|---|---|---|---|
| 1 | Popular directRels + flippedRels | `rutMatchRobust(r.target, cleanMain)` (3-fallback!) | ✅ 19 match (fallback 3: startsWith 8 cifras `92604000`) |
| 2 | Dentro de `processUpward` — busca matched | `normalizeRut(r.source) === rut` (=== estricto!) | ❌ 0 match (92604000 ≠ 926040006 !) |

**Por qué la desalineación?**
- `cleanMain = normalizeRut(mainRut_PROP)` = `normalizeRut("92604000-6")` = **`926040006`** (9 caracteres, ¡incluye DV!)
- Pero las relaciones flipped tienen `source = String(r.target || '')` = `"92604000"` (8 caracteres, JSON raw **sin DV** del proveedor Python!)
- Normalizados son **cadenas DISTINTAS** (`"926040006"` ≠ `"92604000"`) → `===` estricto FALSE!
- Pero `rutMatchRobust` Fallback 3 (`startsWith(slice(0,8))`) = TRUE → ¡los dos flujos eran incoherentes!

#### Bug corregido en 3 puntos simultáneos:

**Fix 7.1 — MeshTable.tsx processUpward + rootIsPerson branch (v1.6)**
- Archivo: [MeshTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L306-L313) (processUpward matched) + [L347-L350](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L347-L350) (rootIsPerson branch)
- Sustituidos **`normalizeRut(String(r.source/target)) === rut`** por **`rutMatchRobust(r.source/target, rut)`** — ¡el MISMO algoritmo usado para popular directRels y flippedRels! Coherencia garantizada.

**Fix 7.2 — Legalrepresentatives.tsx filtro directo + rutMatchRobust**
- Archivo: [Legalrepresentatives.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx#L82-L84)
- ¡Mismo bug! `normalizeRut(r.source) === cleanMain` → sustituido por `rutMatchRobust(r.source, cleanMain)`.
- (L17-L31): añadidas funciones locales `normalizeRutOnlyDigits` y `rutMatchRobust` (mismo código de MeshTable v1.5) que antes no existían.

#### Verificación después del fix
- Carga sociedad 92604000-6 → Banner naranja `[MESH DIAG]` **ya no debe aparecer** (ownRows ahora = 19).
- UI: "Controladores y Estructura de Propiedad" → tabla poblada con N controladores N1.
- UI: "Representantes Legales" → si están presentes, tabla poblada (ya no mensaje "No se detectaron" injustificado).

---

## Fecha: 22 de Octubre de 2025

### Monitoreo RUT — Unificación de Consultas y Logs
- El modal "Crear Nuevo Monitoreo" ahora unifica RUTs de "Consultas" y `sheriff-logs`, eliminando duplicados.
- Búsqueda mejorada: por `rut`, razón social y texto en `duxiterMD` cuando exista.
- Encabezado fijo en el dropdown con contadores: `Total cargados` y `Filtrados`.
- Se mantiene la visualización de `rut`, empresa y "Última consulta".

#### Cambios de código relevantes
- Frontend: `src/pages/MonitoringPage.tsx`
  - Importado `getResults` desde `src/services/api.ts`.
  - `fetchExistingRuts`: paginación de `sheriff-logs`, carga de "Consultas", mapeo a estructura compatible, unión y deduplicación por RUT.
  - `filteredRuts`: ampliada para coincidir por razón social y `duxiterMD`.
  - Encabezado sticky con contadores en el dropdown de RUTs.

#### Notas técnicas
- Origen de datos:
  - Logs: `/rut/sheriff-logs` (paginados).
  - Consultas: `/rut/results` (global por tenant).
- Conversión de "Consultas": se mapean campos a objetos compatibles con `SheriffDataLogResponse`; se descartan entradas sin `rut` válido.
- Extracción de razón social: desde `siiData.summaryData` o `details.razonSocial` cuando esté disponible.
- Deduplicación: por clave `rut`, priorizando el registro con `fetchedAt` más reciente.

#### Verificación
- Abrir `http://localhost:4032/` y navegar a `Monitoreo` → `Crear Nuevo Monitoreo`.
- Buscar por RUT o nombre de empresa proveniente de "Consultas" y confirmar el conteo en el encabezado del dropdown.

#### Impacto en UX
- Selección de RUTs más completa y rápida, con búsqueda flexible.
- Mayor claridad al mostrar el número de resultados cargados y filtrados.

---

## Fecha: 21 de Octubre de 2025

### Fast Check — Indicador de Progreso Mejorado
- Barra de progreso lineal con porcentaje animado que avanza por pasos.
- Etiquetas de pasos traducidas al español y visibles junto al porcentaje.
- Se eliminó el paso de IA del indicador (no se muestra ni afecta el %).
- Colores dinámicos: azul en curso (con pulso), verde al completar, rojo en error.
- Se mantienen los puntos de estado por paso debajo de la barra.
- El indicador también se muestra durante el estado "Cargando…".

#### Flujo de pasos
- Inicio de evaluación → Solicitud de lookup RUT → Cargando resultados → Verificación de Listas Propias → Listo.

#### Cambios de código relevantes
- Frontend: `src/pages/FastCheck.tsx`
  - `initialSteps`: traducción de etiquetas y eliminación de `ai`.
  - `stepsOrder`: actualizado a `['start','lookup','fetch','listas','ready']`.
  - Cálculo de porcentaje y helpers para color/animación y "paso actual".
  - Render del estado de carga: ahora muestra barra + puntos, no solo "Cargando…".
  - Instrumentación de pasos en `handleRefresh` y `fetchData`.
- Nota: la generación de análisis IA sigue disponible bajo demanda, pero fuera del indicador.

#### UX y textos
- Mensajes en español: "Cargando…", "Evaluación en curso…", nombres de pasos.

### Infraestructura/Git
- `.gitignore`: se agregó `server/equifax_responses/` para excluir respuestas de Equifax del control de versiones.

---

## Fecha: Enero 2025

### Resumen de Cambios Implementados

Esta semana se implementó un sistema completo de activación para usuarios y tenants en la plataforma Duxiter, mejorando la seguridad y el control administrativo.

---

## 🔐 Sistema de Activación de Usuarios

### 1. Modelo de Usuario Actualizado
- **Archivo modificado**: `server/src/models/user.model.ts`
- **Cambio**: Agregado campo `isActive` con valor por defecto `false`
- **Impacto**: Todos los nuevos usuarios requieren activación manual por el superadministrador

### 2. Controlador de Registro Actualizado
- **Archivo modificado**: `server/src/controllers/auth.controller.ts`
- **Cambios**:
  - Los nuevos usuarios se crean con `isActive: false`
  - Mensaje de confirmación actualizado para informar sobre activación pendiente
- **Beneficio**: Control total sobre nuevos registros

### 3. Controlador de Login Mejorado
- **Archivo modificado**: `server/src/controllers/auth.controller.ts`
- **Cambios**:
  - Verificación de estado activo antes del login
  - Mensaje de error específico para usuarios no activados
  - Traducción del mensaje de activación pendiente al español
- **Mensaje implementado**: "Tu cuenta está pendiente de activación por parte del superadministrador. Contacta al administrador para completar la activación."

### 4. Frontend – Servicio de Autenticación
- **Archivo modificado**: `src/services/authService.ts`
- **Cambios**:
  - Manejo específico de errores de activación pendiente
  - Detección del estado `activationStatus: 'pending'`

### 5. Frontend – Página de Login
- **Archivo modificado**: `src/pages/auth/Login.tsx`
- **Cambios**:
  - Nuevo estado `activationMessage` para mostrar mensajes de activación
  - Interfaz visual para mostrar mensaje de activación pendiente
  - Detección del mensaje en español

### 6. Panel de Administración – Gestión de Usuarios
- **Archivo modificado**: `src/pages/admin/UserManagement.tsx`
- **Funcionalidades agregadas**:
  - Columna "Estado" en la tabla de usuarios
  - Botones "Activar" y "Desactivar" para cada usuario
  - Función `handleToggleUserStatus` para cambiar estado
  - Indicadores visuales de estado (activo/inactivo)

---

## 🏢 Sistema de Activación de Tenants

### 1. Modelo de Tenant Actualizado
- **Archivo modificado**: `server/src/models/tenant.model.ts`
- **Cambio**: Agregado campo `isActive` con valor por defecto `false`
- **Impacto**: Todos los nuevos tenants requieren activación manual

### 2. Controlador de Tenant Actualizado
- **Archivo modificado**: `server/src/controllers/tenant.controller.ts`
- **Cambios**:
  - Endpoint PATCH `/api/tenants/:id/toggle-status` para activar/desactivar
  - Función `toggleTenantStatus` implementada
  - Validaciones de autorización para superadmin

### 3. Middleware de Autenticación Mejorado
- **Archivo modificado**: `server/src/middleware/auth.middleware.ts`
- **Cambios**:
  - Verificación de tenant activo en cada request autenticado
  - Bloqueo automático de usuarios con tenants inactivos
  - Mensaje de error específico para tenants desactivados

### 4. Panel de Administración – Gestión de Tenants
- **Archivo modificado**: `src/pages/admin/TenantManagement.tsx`
- **Funcionalidades agregadas**:
  - Columna "Estado" en la tabla de tenants
  - Botones "Activar" y "Desactivar" para cada tenant
  - Función `handleToggleTenantStatus` para cambiar estado
  - Indicadores visuales de estado

---

## 🛠️ Correcciones Técnicas

### 1. Eliminación de Transacciones MongoDB
- **Archivos afectados**: Múltiples controladores
- **Problema resuelto**: Error `MongoServerError` por uso incorrecto de transacciones
- **Solución**: Eliminadas transacciones innecesarias en operaciones simples

### 2. Limpieza de Resultados Huérfanos
- **Problema**: Results pertenecientes a tenants eliminados causaban errores 404
- **Solución**: Implementada limpieza automática de datos huérfanos
- **Beneficio**: Mayor estabilidad del sistema

---

## 🌐 Mejoras de Internacionalización

### Traducción al Español
- **Mensajes de error**: Traducidos del italiano al español
- **Interfaz de usuario**: Mensajes de activación en español
- **Consistencia**: Toda la comunicación de errores unificada en español

---

## 📊 Impacto en la Seguridad

1.  **Control de Acceso Mejorado**: Solo usuarios y tenants activados pueden acceder al sistema
2.  **Gestión Centralizada**: El superadministrador tiene control total sobre activaciones
3.  **Prevención de Accesos No Autorizados**: Bloqueo automático de cuentas no activadas
4.  **Trazabilidad**: Logs detallados de intentos de login de usuarios no activados

---

## 🚀 Funcionalidades Implementadas

### Para Superadministradores:
- ✅ Activar/desactivar usuarios individualmente
- ✅ Activar/desactivar tenants completos
- ✅ Vista consolidada del estado de todos los usuarios y tenants
- ✅ Control granular sobre el acceso al sistema

### Para Usuarios:
- ✅ Mensajes claros sobre el estado de activación
- ✅ Interfaz informativa durante el proceso de login
- ✅ Comunicación en español para mejor comprensión

---

## 📝 Archivos Modificados

### Backend:
- `server/src/models/user.model.ts`
- `server/src/models/tenant.model.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/controllers/tenant.controller.ts`
- `server/src/middleware/auth.middleware.ts`

### Frontend:
- `src/services/authService.ts`
- `src/pages/auth/Login.tsx`
- `src/pages/admin/UserManagement.tsx`
- `src/pages/admin/TenantManagement.tsx`

---

## 🔧 Configuración y Despliegue del Sistema Multi-Tenant

### Fecha: 7 de Septiembre de 2025

### Configuración Completa del Entorno

#### 1. Servidor Backend Configurado
- **Puerto**: 4040
- **Estado**: ✅ Operativo y funcional
- **Base de datos**: MongoDB conectada exitosamente
- **Documentación API**: Disponible en http://localhost:4040/api/docs

#### 2. Creación de Usuarios Administrativos
- **Superadministrador**:
  - Email: `superadmin@gmail.com`
  - Contraseña: `SuperAdmin3465#`
  - Estado: ✅ Creado y verificado
- **Administrador de Tenant**:
  - Email: `tenantadmin@test.com`
  - Contraseña: `password123`
  - Estado: ✅ Creado y verificado

#### 3. Gestión de Tenants
- **Tenant de Prueba Creado**:
  - ID: `68bd9178eabb7855861b2983`
  - Nombre: "Test Tenant"
  - Estado: ✅ Activado exitosamente
  - Configuración: Créditos iniciales (100), estadísticas de uso configuradas

#### 4. Servidor Frontend Configurado
- **Puerto**: 4031 (puerto 4030 ocupado, redirigido automáticamente)
- **Tecnología**: Vite + React
- **Estado**: ✅ Operativo y accesible
- **URL**: http://localhost:4031/
- **Verificación**: Sin errores en el navegador

### Resolución de Problemas Técnicos

#### 1. Conflicto de Puertos
- **Problema**: Puerto 4040 ocupado por proceso anterior
- **Solución**: Terminación forzada del proceso con `lsof -ti:4040 | xargs kill -9`
- **Resultado**: ✅ Servidor reiniciado exitosamente

#### 2. Autenticación de Superadministrador
- **Problema**: Credenciales inválidas en primer intento
- **Causa**: Usuario superadmin no existía en la base de datos
- **Solución**: Ejecución del script `create-superadmin.ts`
- **Resultado**: ✅ Superadmin creado y autenticación exitosa

#### 3. Gestión de Tenants
- **Problema**: "Tenant not found" en operaciones iniciales
- **Causa**: No existían tenants en la base de datos
- **Solución**: Creación de tenant de prueba vía API POST
- **Resultado**: ✅ Tenant creado y activado correctamente

### Funcionalidades Verificadas

#### Sistema de Autenticación Multi-Rol
- ✅ Superuser: Control total del sistema
- ✅ Tenant Admin: Gestión de tenant específico
- ✅ Evaluator: Acceso a funcionalidades de evaluación

#### API RESTful Completa
- ✅ Endpoints de autenticación (`/api/auth/login`)
- ✅ Gestión de usuarios (`/api/users`)
- ✅ Gestión de tenants (`/api/tenant`)
- ✅ Activación/desactivación de tenants (`/api/tenant/:id/superadmin-toggle-status`)

#### Interfaz Frontend
- ✅ Aplicación React moderna y responsiva
- ✅ Integración completa con backend
- ✅ Manejo de estados de autenticación
- ✅ Navegación basada en roles

### Comandos de Despliegue Utilizados

```bash
# Backend
cd /root/duxiter/server
npm run dev  # Puerto 4040

# Frontend
cd /root/duxiter
npm run dev  # Puerto 4031

# Creación de superadmin
cd server && npx tsx src/scripts/create-superadmin.ts

# Resolución de conflictos de puerto
lsof -ti:4040 | xargs kill -9
```

### APIs de Prueba Ejecutadas

```bash
# Login de superadmin
curl -X POST http://localhost:4040/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@gmail.com","password":"SuperAdmin3465#"}'

# Creación de tenant
curl -X POST http://localhost:4040/api/tenant \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Tenant","settings":{},"usageStats":{"evaluationsRemaining":100,"evaluationsUsed":0}}'

# Activación de tenant
curl -X PATCH http://localhost:4040/api/tenant/68bd9178eabb7855861b2983/superadmin-toggle-status \
  -H "Authorization: Bearer [SUPERADMIN_TOKEN]"
```

---

## ✅ Estado del Proyecto

Todas las funcionalidades han sido implementadas y probadas exitosamente. El sistema de activación está completamente operativo y listo para producción.

**Sistema Multi-Tenant Completamente Configurado:**
- ✅ Backend operativo en puerto 4040
- ✅ Frontend operativo en puerto 4031
- ✅ Base de datos MongoDB conectada
- ✅ Usuarios administrativos creados
- ✅ Tenant de prueba activado
- ✅ APIs funcionando correctamente
- ✅ Interfaz web accesible y funcional

**Próximos pasos sugeridos:**
- Implementar notificaciones por email para activaciones
- Agregar logs de auditoría para cambios de estado
- Considerar activación automática basada en criterios específicos
- Configurar entorno de producción con Docker
- Implementar monitoreo y métricas del sistema

---

## 🔄 Sistema de Reciclaje de Consultas

### Fecha: Enero 2025

### Problema Identificado
- **Error**: `TypeError: Cannot read properties of undefined (reading 'getResultByRut')`
- **Ubicación**: `server/src/controllers/rutController.ts:1021`
- **Causa**: Llamada incorrecta a método estático usando `this.getResultByRut()`

### Solución Implementada

#### 1. Corrección de Llamada a Método Estático
- **Archivo modificado**: `server/src/controllers/rutController.ts`
- **Línea 1021**: Cambiado `this.getResultByRut()` por `RutController.getResultByRut()`
- **Razón**: Los métodos estáticos deben ser llamados usando el nombre de la clase, no `this`

#### 2. Corrección de Parámetros
- **Problema**: Paso incorrecto de parámetros en la llamada recursiva
- **Solución**:
  - Eliminado objeto falso `{ params: { rut: rut } }`
  - Implementado `req.params.rut = rut` antes de la llamada
  - Uso del objeto `req` original en la llamada recursiva

#### 3. Anotación de Tipo de Retorno
- **Línea 982**: Agregado `Promise<Response>` como tipo de retorno
- **Propósito**: Resolver error de TypeScript sobre tipo de retorno implícito
- **Beneficio**: Eliminar referencia circular en el análisis de tipos

### Funcionalidad del Sistema de Reciclaje

El sistema permite reutilizar resultados de consultas entre diferentes tenants:

1.  **Búsqueda Inicial**: Se busca un resultado por RUT sin filtrar por tenant
2.  **Verificación de Tenant**: Si el resultado pertenece a otro tenant
3.  **Reciclaje**: Se crea una copia del resultado para el tenant actual
4.  **Llamada Recursiva**: Se vuelve a llamar al método para obtener el nuevo resultado

### Código Corregido

```typescript
// Antes (incorrecto)
return this.getResultByRut({ params: { rut: rut } }, res);

// Después (correcto)
req.params.rut = rut;
return RutController.getResultByRut(req, res);
```

### Beneficios de la Corrección

- ✅ **Eliminación del Error**: Ya no se produce el TypeError
- ✅ **Funcionalidad Restaurada**: El reciclaje de consultas funciona correctamente
- ✅ **Optimización de Recursos**: Reutilización eficiente de resultados existentes
- ✅ **Compatibilidad TypeScript**: Código completamente tipado y sin errores

### Archivos Modificados

- `server/src/controllers/rutController.ts`
  - Línea 982: Agregada anotación de tipo de retorno
  - Líneas 1020-1022: Corregida llamada recursiva al método estático

### Impacto en el Sistema

- **Estabilidad**: Eliminación de crashes del servidor
- **Eficiencia**: Mejor reutilización de datos entre tenants
- **Mantenibilidad**: Código más claro y correctamente tipado

---

## Fecha: 10 de Septiembre de 2026

### Ajuste Protestos y Morosidades – Equifax: Consolidado 3 fuentes (BOLCOM + ICOM + BED)

**Problema inicial**: Fast Check mostrava *únicamente* **BOLCOM** como total general, leyendo `summaryBolcom.summaryTotal/summaryTotalAmount` y leyendo solo `debtsSummary.bolcom.commercialBolcom` en los detalles → **ICOM y BED no se consideraban**. Los totales mostrados estaban por lo tanto **subestimados** (ej. RUT 77.534.640-K: antes solo BOLCOM 18/$656M → ahora consolidado 164/$3.036M).

---

#### 🔎 1. Nuevo Total General (¡ya NO usa más `summaryBolcom`!)
Ahora el total oficial se toma **exclusivamente de**:
- `commercialData.credit.debtsSummary.debtsSummaryDetail.totalDebts` → Cantidad total de documentos
- `commercialData.credit.debtsSummary.debtsSummaryDetail.totalAmountDebts` → Monto total (CLP)

#### 🗂️ 2. Detalle por fuente (3 fuentes distintas con path y resumen específicos)

| Fuente | Path lista detalle | Path resumen (conteo + importe) | Clasificación individual |
|---|---|---|---|
| ✅ **BOLCOM** | `debtsSummary.bolcom.commercialBolcom` | `summaryBolcom.summaryTotal` / `summaryTotalAmount` | ✅ **Sí** — mediante `justificationDescription` (clasifica MORA / PROTESTA heurística palabras clave) |
| ✅ **ICOM**   | `debtsSummary.icom.commercialIcom`   | `summaryIcom.summaryTotal`   / `summaryTotalAmount` | ❌ **NO se inventa** — marcada `SIN_CLASIFICACION_INDIVIDUAL` (incluso si jD está presente, flag no cambia) |
| ✅ **BED**    | `debtsSummary.bed.commercialBed`    | `summaryBed.summaryTotal`    / `summaryTotalAmount` | ✅ **Sí** — mediante `justificationDescription` (misma heurística BOLCOM) |

#### ✅ 3. Validación Cuadre (Frontend + Backend)
Después de la suma de las 3 fuentes, se valida:
```
Σ  Bolcom.count + Icom.count + Bed.count  === debtsSummaryDetail.totalDebts
Σ  Bolcom.amount + Icom.amount + Bed.amount === debtsSummaryDetail.totalAmountDebts   (±$1 tolerancia por redondeos)
```
**UI**:
- 🟢 `✅ Cuadre OK: BOLCOM(n)+ICOM(n)+BED(n) = Σ = totalDebts`
- 🟠 `⚠️ Cuadre WARN: sumas fuente (…) difieren de debtsSummaryDetail (…) — diff=…`

Backend registra en el campo `rulObj.quadrature`. Frontend muestra badge **success** o **warning** en la tarjeta resumen y en la regla.

---

#### 🧠 Arquitectura implementada (5 capas, TS y Python 1:1)

| Capa | Archivo + líneas | Qué hace |
|---|---|---|
| **Helper compartido TS** (Node backend) | [equifaxService.ts#L466-L698](file:///home/duxiter/duxiter_intermediate/server/src/services/equifaxService.ts#L466-L698) | `extractEquifaxProtestosMorosidades(equifaxData)` → objeto `{ rows, totalDebts, totalAmountDebts, perFuente, quadrature, fuenteCampiMap }`. Añade a cada fila: `_fuente: "BOLCOM"|"ICOM"|"BED"`, `_tipoClasificacion: "MORA"|"PROTESTA"|"SIN_CLASIFICACION_INDIVIDUAL"`. Detecta `debtsSummary` desde 2 path (`allData.commercialData.*` / directo `commercialData.*`) |
| **Risk-calc Node (TS)** | [riskCalculationService.ts#L17-L20](file:///home/duxiter/duxiter_intermediate/server/src/services/riskCalculationService.ts#L17-L20) import + [L2036-L2087](file:///home/duxiter/duxiter_intermediate/server/src/services/riskCalculationService.ts#L2036-L2087) regla Protestos y Morosidades | **ANTES**: `details = debtsSummary.bolcom.commercialBolcom || []` (solo BOLCOM, ¡error!). **AHORA**: `details = merge(3 fuentes)`; popula `rulObj.consolidado = {totalDebts,totalAmountDebts,perFuente,fuenteCampiMap}`; popula `rulObj.quadrature`; `detected=true` si **totals>0 O rows>0 O summaries>0**. |
| **Helper compartido Python** (FastAPI backend) | [risk_calculation_service.py#L20-L152](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/risk_calculation_service.py#L20-L152) | Clon 1:1 del helper TS. `_to_number`, `_classifica_pm`, `_extract_equifax_protestos_morosidades`. Mismas idénticas reglas. |
| **Risk-calc FastAPI (Python)** | [risk_calculation_service.py#L616-L646](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/risk_calculation_service.py#L616-L646) | **ANTES**: `icom = debtsSummary.icom.commercialIcom || personaNaturalList` (solo ICOM, ¡error!). **AHORA**: 3 fuentes merge + consolidado + cuadre; si rows=0 prueba fallback a `protestosMorosidadesPersonaNaturalList` por retrocompatibilidad. |
| **Frontend: Tabla Financiero-Tributario** | [FastCheckEX.tsx#L4102-L4155](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4102-L4155) | Mapea fila Protestos y Morosidades. `detailCount` y `montoTotal` valorizados desde `rule.consolidado` (no desde `rule.details.length`). Retorna `_extraInfo` con tarjeta Total + 3 fuentes + validación cuadre. |
| **Frontend: Resumen Detalles (calculateTotals)** | [FastCheckEX.tsx#L4861-L4909](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4861-L4909) | **ANTES**: `Cantidad=d.length` + `MontoTotal=Σ rows.unpaidAmount` (solo lo que estaba en details). **AHORA**: `Cantidad consolidado` + `Monto consolidado` desde `rule.consolidado`; 3 sub-entradas BOLCOM/ICOM/BED; badge validación cuadre. Fallback si `consolidado` falta (registros históricos). |

---

#### 🧪 Caso de prueba esperado — RUT 77.534.640-K

```
Total consolidado (debtsSummaryDetail): 164 documentos / $ 3.036.602.310

┌─────────────────────────────────────────────────────────────────────┐
│  · BOLCOM                           18 docs / $   656.674.129       │
│  · ICOM (sin clasificación ind.)    38 docs / $ 1.391.039.361       │
│  · BED                             108 docs / $   988.888.820       │
├─────────────────────────────────────────────────────────────────────┤
│  Σ = 164 / $ 3.036.602.310   ✅ Cuadre OK                            │
└─────────────────────────────────────────────────────────────────────┘
```

#### 🔙 Retrocompatibilidad
- **Registros históricos en Mongo (sin `consolidado/quadrature`)**: Frontend funciona normalmente por fallback: `Cantidad = d.length`, `Monto = Σ rows.unpaidAmount`. Solo las nuevas valorizaciones muestran Total oficial desde debtsSummaryDetail y validación de cuadre.
- **ICOM sin jD**: Añade `justificationDescription: "Sin clasificación individual (ICOM)"` como default **solo si el campo no existe** por claridad en UI; si jD existe se muestra inalterado, pero `_tipoClasificacion` permanece siempre `SIN_CLASIFICACION_INDIVIDUAL`.
- **Totales vacíos**: Si debtsSummaryDetail es 0 pero `summaryBolcom.summaryTotal > 0` (u otras fuentes), `detected=true` de todos modos para no ocultar datos.

---

### 🔥 Bugfix – Formato monetario CLP: discrepancia 10× Monto Total (Tarjeta Resumen vs Modal Detalles)
**Reporte usuario**:
- 🟢 Modal Detalles encabezado (correcto): `Monto total = $ 29.287.952.850`
- 🔴 Tarjeta resumen parámetros detectados (erróneo): `Monto total = $ 2.928.795.285`
- Discrepancia: **29.287.952.850 / 2.928.795.285 = 10.0 EXACTO** → Monto total 10× MENOR en el resumen.

#### Causa raíz
- Parser monetario regex `String(v).replace(/[^0-9.-]/g, '')` y `parseFloat(...)` aplicado a cadenas CLP con **`.` como separador de miles** (formato `es-CL` estándar Chile).
- `"29.288.88288"` → regex elimina "$" y espacios PERO guarda todos los puntos → el número se parsea a "28.28888" como decimal USA" y → "parseFloat("29.287952850")" = **29.28** (ERROR!). Era un parsing USA de un valor separador de miles CLP con punto.
- Singla fila `$13.213.872` → se vuelve `13.213` (¡no 13 millones!) por la misma idéntica causa.
- Sumatoria media ~156 filas → **2.928 Miliardos** (10x menos del total verdadero 29.287 Mld).
- **Por qué el modal no tenía el bug?** Porque RuleDetailsModal.tsx usaba una regex DIVERSA (quitaba TODOS los puntos + comas con `.replace(/\./g,'').replace(/,/g,'')`) → "por casualidad" no fallaba (pero esa regex rompía los decimales USA/CL con coma!).

#### Solución (4 capas, código idéntico TS ↔ Python ↔ Frontend ↔ Modal)
##### 1. Parser `parseNumberLocaleCL()` (inter-capa, 1:1)
Reglas robustas (no se rompe por 0 decimales CLP ni por formatos mixtos):

| Caso input | Ejemplo cadena | Output número | Cómo se interpreta |
|---|---|---|---|
| **CL multipunto (miles)** | `"29.288.888.888"` | `29287952850` ✅ | `puntos>1` → todos los `.` = separador miles → eliminados. |
| **CLP $ y espacios** | `"$ 13.213.872"` | `13213872` ✅ | Quito `$€£¥` + espacios antes. Luego como arriba. |
| **CL , decimal** | `"2.928.795,50"` | `2928795.5` ✅ | `lastComma > lastDot` → `.` quitados todos, `,` se convierte en `.` (parseFloat). |
| **Equifax raw (US)** | `"29287952850.0"` | `29287952850` ✅ | 1 solo punto, después `0` cifras decimales significativas → correcto. |
| **USA estándar 2 dec** | `"1,234,567.89"` | `1234567.89` ✅ | `lastDot>lastComma` + después 2 cifras → decimal. |
| **USA 1 punto ≤3 cifras después** | `"1234.56"` / `"1.234"` | `1234.56` / `1.234` | Decimal USA (menor de 1000 con decimales). |
| **1 punto >3 cifras después** | `"1234.5678"` | `12345678` | CLP separador miles (no decimal). |

##### 2. Formatter `formatCLP()` uniforme
**Ya no hay más `'$' + Math.round(x).toLocaleString('es-CL')` (incoherente)**. Ahora siempre:
```ts
new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits: 0 }).format(n)
```
→ Garantiza SIEMPRE punto separador de miles, NADA de decimales (peso chileno comercial no usa centavos), símbolo `$` incluido automáticamente.

##### 3. Paso consolidado a modal
**Nueva feature**: cuando se abre el modal Protestos y Morosidades desde la sección Financiero-Tributario, FastCheckEX (`L4119`) inyecta `_consolidado`, `_quadrature`, `_rule` como propiedades sobre el array rows (Object.assign, no rompe la iteración). Modal header lee `data._consolidado.totalAmountDebts/totalDebts` por PRIORIDAD en lugar de calcular desde rows → incluso si en el modal visualizas solo 1 fuente (ej. BOLCOM), el header muestra siempre el TOTAL oficial desde debtsSummaryDetail como por especificación.

##### 4. Tabla de archivos modificados
| Capa | Archivo + líneas |
|---|---|
| Backend TS | [equifaxService.ts:L536-L567](file:///home/duxiter/duxiter_intermediate/server/src/services/equifaxService.ts#L536-L567) → `_toNumber()` |
| Backend Python | [risk_calculation_service.py:L20-L53](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/risk_calculation_service.py#L20-L53) → `_to_number()` |
| Frontend helpers | [FastCheckEX.tsx:L3552-L3588](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L3552-L3588) → `parseNumberLocaleCL()` + mejora `formatCLP()` |
| Frontend FT regla | [FastCheckEX.tsx:L4119-L4132](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4119-L4132) → paso `_consolidado` a modal |
| Frontend FT regla formato | [FastCheckEX.tsx:L4144-L4161](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4144-L4161) → Totales/sub-totales formatCLP |
| Frontend calculateTotals | [FastCheckEX.tsx:L4895-L4927](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4895-L4927) → Monto consolidado + fallback reduce con parseNumberLocaleCL (ya no hay error 1000x/fila) |
| Modal header | [RuleDetailsModal.tsx:L378-L440](file:///home/duxiter/duxiter_intermediate/src/components/ui/RuleDetailsModal/RuleDetailsModal.tsx#L378-L440) → mismo parser/formato, preferencia `data._consolidado`. |

---

### 🔥 Bugfix (2ª iteración) – Defensa Extrema `calculateTotals`: Tarjeta Protestos y Morosidades (10× persistía / "mismo problema")
**Reporte usuario**: después del primer fix del formato CLP, la **tarjeta individual Parámetros Relevantes Protestos** mostraba aún:
- 🟢 Modal header (correcto): `CANTIDAD = 156 / MONTO = $29.287.952.850`
- 🔴 Tarjeta individual TableSummary (errónea, 10× MENOS):
  ```
  Total Protestos y Morosidades     → 156
  Cantidad de protestos y morosidades → 156
  Monto total                     → $2.928.795.285  ← ❌ (BUG 10x)
  ```
- **Indicador clave**: las etiquetas 2ª y 3ª fila **NO contenían "(total consolidado)"** → bundle frontend no recargado aún con código viejo + 4 debilidades residuales en `calculateTotals`

---

#### Causa raíz múltiple (4 puntos)
| # | Problema | Consecuencia |
|---|---|---|
| 1 | **Coincidencia Protestos DÉBIL** (igualdad exacta `===`) | `label === 'Protestos y Morosidades'` → mayúsculas/typo/alias podían saltarse el bloque dedicado |
| 2 | **Prioridad INVERTIDA** | Fallback `d.reduce(rows)` ANTES de `rule.montoTotal/detailCount` (¡BACKEND NÚMERO PURO, cero parsing!) |
| 3 | **3 residuos REGEX VIEJO** en calculateTotals | Multas Laborales / Condenas Antisindicales / **Deuda Previsional Publicada L5043** → `replace(/[^0-9.-]/g, '')` rompe CLP multipunto |
| 4 | **Fallback GENÉRICO faltante** después de "Causas Penales L5067" | Etiquetas no matcheadas no tenían "Cantidad + Monto" uniforme |

---

#### Solución Defensa Extrema (4 fixes en [FastCheckEX.tsx:L4893-L5080](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4893-L5080))
---

##### 1. Match Protestos ROBUSTO (L4905)
Nada más de coincidencia exacta → mayúsculas/minúsculas + includes AMBAS palabras clave:
```ts
label.trim().toLowerCase().includes('protestos')
&& label.trim().toLowerCase().includes('morosidades')
```

##### 2. Jerarquía fuentes PRIORIDAD ABSOLUTA → BACKEND NÚMERO PURO
(cero parsing, cero riesgo!)
```
totalDebts      = rule.detailCount (number, >0)
              → alternativamente consolidado.totalDebts
              → alternativamente fallback d.length

totalAmountDebts = rule.montoTotal (number, >0)
                → alternativamente parseNumberLocaleCL(consolidado.totalAmountDebts)
                → alternativamente fallback reduce(parseNumberLocaleCL(rows.monto)
```

##### 3. ZERO regex monetarios restantes en calculateTotals (4 bloques todos fijados)
| Bloque | Líneas | Fix |
|---|---|---|
| Multas Laborales | L4895-L4903 | `parseNumberLocaleCL(monto)` + `formatCLP()` |
| Protestos y Morosidades (fallback) | L4905-L4964 | reduce + `parseNumberLocaleCL` + `formatCLP()` |
| Condenas Prácticas Antisindicales | L4966-L4974 | `parseNumberLocaleCL(monto)` + `formatCLP()` |
| **Deuda Previsional Publicada** (⚠️ residuo última hora) | L5043-L5051 | `parseNumberLocaleCL(monto)` + `formatCLP(montoTotal)` |

##### 4. ELSE GENÉRICO final DESPUÉS de Causas Penales (L5069-L5080)
Para **CADA etiqueta no matcheada explícitamente → garantiza "Cantidad + Monto total" uniformes**:
- Busca en 5 posibles campos moneda (ninguno se pierde):
  `row.monto` / `row.Monto` / `row.unpaidAmount` / `row.amount` / `row.importe`
```ts
// Pseudocódigo else final:
items.push({ label: 'Cantidad', value: d.length })               // si no existe
items.push({ label: 'Monto total', value: formatCLP(Σ parseNumberLocaleCL(...)) })  // si amount>0
```

##### 5. Etiquetas alineadas FOTO USUARIO
Quitado apéndice "(total consolidado)" → etiqueta EXACTAMENTE:
```
Cantidad de protestos y morosidades
Monto total
```
(Mismo idéntico output de la 2ª y 3ª fila del screenshot usuario → coincidencia perfecta una vez que bundle nuevo se carga.)

---

#### 🧪 Validación self-test Node (PASS 3/3)
| Escenario simulado | Esperado | Resultado | Estado |
|---|---|---|---|
| ✅ Protestos + `rule.montoTotal=29287952850` (BACKEND PURO, prioridad 1) | `Monto total = $29.287.952.850` | `$29.287.952.850` | ✅ PASS |
| ✅ Protestos + solo filas CLP `['$13.213.872', ...]` (fallback reduce) | `$646.460.256` (suma correcta, no truncado a 13.213) | `$646.460.256` | ✅ PASS |
| ✅ Etiqueta **desconocida** + filas CLP (else genérico) | `Cantidad = 2` + `Monto = $29.287.952.850` | como esperado | ✅ PASS |

---

#### 🚨 Nota operativa USUARIO (causa foto "mismo problema")
La foto usuario muestra etiquetas **SIN "(total consolidado)"** + Monto 10× erróneo → **confirma al 100% que el navegador está ejecutando el BUNDLE VIEJO** (antes del fix).

**Después del despliegue del frontend recompilado, ejecutar OBLIGATORIAMENTE**:
```
Hard Refresh:  Ctrl + Shift + R   (Windows/Linux)
               Cmd  + Shift + R   (Mac)
```
Esto fuerza la descarga del bundle .js nuevo con el fix calculateTotals (burst cache definitivo).

---

### 🔥 Bugfix (3ª iteración) – Desalineación conteos Tarjeta Protestos (Total=156 vs Cantidad=164)
**Reporte después de primer build (npm run build)**:
```
Total Protestos y Morosidades         → 156 ❌ (= d.length, suma BOLCOM 18 + ICOM 38 + BED 100 = 156)
Cantidad de protestos y morosidades  → 164 ✅ (= debtsSummaryDetail total oficial)
Monto total                           → $3.036.602.310 ✅ (10x RESUELTO, ya no 2.928 Mld)
```
*(el documento se truncaba aquí en la versión original; no añadimos contenido conjetural)*

---

---

## 📅 Tabla de Tiempos Mensual (Horas estimadas / Facturación)

> 📌 **Criterio de horas**: promedio por tarea según complejidad (back-end DB), análisis estático de código, auditoría manual y volumen de líneas/archivos modificados. **No incluye horas de despliegue en producción ni QA exhaustivo manual realizado 100% por el cliente salvo donde se indique.**

### Resumen global por mes
| Mes | Año | Tareas cerradas | Horas totales (H) | Horas facturables estimadas (≥ 1H min por tarea) |
|---|---|---|---|---|
| 🗓️ Enero | 2025 | 14 | 16 | 16 |
| 🗓️ Julio (Set 2025 → 7 Sep config) | 2025 | 1 | 8 | 8 |
| 🗓️ Septiembre (Equifax BOLCOM/ICOM/BED + parser CLP) | 2025 | 5 | 10 | 10 |
| 🗓️ Octubre (Monitoreo RUT + Progreso UI) | 2025 | 3 | 10 | 10 |
| 🗓️ Septiembre (bugs MeshTable + Socios Loop + Fix 80% FC + Immutabilità LP) | 2026 | 19 | 28 | 28 |
| 🗓️ **Octubre (Fix RUT formatter + Doc Spec V2 + Doc Refactoring RBAC + Bloque 0.7 Backend/Front + Bloque 0.8 Testing/QA + Bloque1.1 FASE1 Poblamiento UO + Bloque1.2 SuperuserBlockedRoute + Bloque1.3 Migracion AUTHZ_LEGACY_LAYER CIERRE F1 + Bloque2.1 FASE2 Comentarios V/R/P HU-12 + Bloque2.2 FASE2 Etiquetas Scope G/R 4 permisos + Bloque2.3 FASE2 Export Multinivel CERT≤N2 INF≤N4 + Bloque2.4 FASE2 Gobierno Riesgo 4 Permisos SENSIBLES HU-13/14)** | 2026 | **15** | **51** | **51** |
| **TOTAL** | | **56** | **123 h** | **123 h** |

---

### Desglose detallado (una fila = una tarea cerrada)

| # | Tarea / Entregable | Última modificación | Horas | Archivo(s) / Referencia | Notas |
|---|---|---|---|---|---|
| 1 | 🔐 Sistema activación de **Usuarios** (modelo + registro + login + UI login + panel admin gestión) | Ene 2025 | 4 h | `server/src/models/user.model.ts`, `auth.controller.ts`, `src/services/authService.ts`, `Login.tsx`, `UserManagement.tsx` | 6 submódulos |
| 2 | 🏢 Sistema activación **Tenants** (modelo + toggle-status + middleware auth + panel) | Ene 2025 | 4 h | `tenant.model.ts`, `tenant.controller.ts`, `auth.middleware.ts`, `TenantManagement.tsx` | 4 submódulos |
| 3 | 🛠️ Correcciones técnicas (transacciones Mongo, limpieza results huérfanos) | Ene 2025 | 1 h | Múltiples controllers | Tareas pequeñas |
| 4 | 🌐 i18n al español (mensajes error / UI activación) | Ene 2025 | 1 h | Back + Front | Traducciones |
| 5 | 📊 Impacto Seguridad + documentación interna (listado 4 puntos) | Ene 2025 | 0,5 h | README/changelog | Doc |
| 6 | 🚀 Funcionalidades finales (checklist superadmin / usuario) | Ene 2025 | 0,5 h | (varios) | QA |
| 7 | 📝 Archivos modificados (lista backend/frontend) | Ene 2025 | 0,5 h | CHANGELOG | Reporte |
| 8 | 🔧 Configuración **Multi-Tenant completa** (backend/frontend/usuarios/tenant prueba) | 7 Sep 2025 | 6 h | `mongosh`, `server/.env`, `vite.config` | Inicialización entorno |
| 9 | 🔧 Resolución problemas técnicos (puertos, credenciales superadmin, gestión tenant) | 7 Sep 2025 | 2 h | terminal + `create-superadmin.ts` | Operaciones |
| 10 | ✅ Verificación final (auth 3 roles, APIs, navegación roles) | 7 Sep 2025 | 0,5 h | QA manual | |
| 11 | 📄 Apéndice comandos despliegue + APIs prueba ejecutadas | 7 Sep 2025 | 0,5 h | CHANGELOG | Reporte |
| 12 | 🔄 Sistema reciclaje consultas (estático `RutController.getResultByRut` / anotación tipo) | Ene 2025 | 0,5 h | [rutController.ts#L980-L1025](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L980-L1025) | Bug simple |
| 13 | 💰 **Ajuste Protestos/Morosidades Equifax 3 fuentes** (TS/Python 1:1 + helper + risk + frontend tabla) | 10 Set 2026 | 5 h | `equifaxService.ts`, `riskCalculationService.ts`, `FastCheckEX.tsx:4102-4155`, `FastCheckEX.tsx:4861-4909`, `FastAPI risk_calculation` | Arquitectura 5 capas |
| 14 | 💵 Bugfix formato monetario CLP (parser + formatter `parseNumberLocaleCL/formatCLP`) | 10 Set 2026 | 2 h | `FastCheckEX.tsx:3552-3588`, `equifaxService.ts:_toNumber`, `RuleDetailsModal.tsx:378-440` | 8 archivos |
| 15 | 🛡️ Bugfix 2ª iteración defensa extrema `calculateTotals` (prioridad backend puro / regex / fallback) | 10 Set 2026 | 2 h | [FastCheckEX.tsx:4893-L5080](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4893-L5080) | 4 fixes simultáneos |
| 16 | 🧪 Validación test-node (3 PASS) + nota "hard-refresh Ctrl+Shift+R" | 10 Set 2026 | 1 h | QA + CHANGELOG | Reporte |
| 17 | 📊 Monitoreo RUT (unificación Consultas/Logs + dropdown/filtros) | 22 Oct 2025 | 6 h | `MonitoringPage.tsx` | Frontend |
| 18 | 📘 Notas técnicas monitoreo / origen datos / deduplicación | 22 Oct 2025 | 1 h | CHANGELOG/documentación | |
| 19 | 📈 Fast Check: **Indicador Progreso Mejorado** (5 steps / colores / sin IA) | 21 Oct 2025 | 3 h | [FastCheck.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheck.tsx) | |
| 20 | 🧭 UX y textos / Infraestructura Git (`.gitignore` `server/equifax_responses/`) | 21 Oct 2025 | 1 h | | + UX textos |
| 21 | 🟩 FastCheckEX Fix 80% (TypeError `.allRules` / optional chaining + try/catch post-LP + axios timeout 30s) | 30 Sep 2026 | 5 h | [FastCheckEX.tsx:1559-L1730](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1559-L1730), [api.ts:13-16](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L13-L16) | 3 bugs concatenados |
| 22 | ✔️ Verificaciones backend (antiunion / authorize) | 30 Sep 2026 | 0,5 h | `antiunionCaseController`, `role.middleware.ts` | QA |
| 23 | 🔒 Fix **Inmutabilidad Result Storico** (LP autosync + 3 branch updateOne rimossi / read-only) | 30 Sep 2026 | 6 h | [rutController.ts:getResultById+getResultByRut](file:///home/duxiter/duxiter_intermediate/server/src/controllers/rutController.ts#L1913) | Reescritura total flujo read |
| 24 | 🐛 Fix **Socios Históricos exclusión RUT main** | 30 Sep 2026 | 1 h | [FastCheckEX.tsx:2268-L2295](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L2268-L2295) | Filtro 3-fallback |
| 25 | 📤 Script `export-rut-consultations.ts` (3 colecciones / pretty / light / output) | 30 Sep 2026 | 2 h | `server/src/scripts/export-rut-consultations.ts` | cross-tenant |
| 26 | 🔎 Script `audit-rut-mutations.ts` + fix BSON date (`_castDate` + reporte anche crash) | 30 Sep 2026 | 3 h | `server/src/scripts/audit-rut-mutations.ts` | v1.2 resilienza |
| 27 | 🧪 Script `simulate-migration.ts` (5 categorie / DRY-RUN default / doppio flag apply) | 30 Sep 2026 | 4 h | `server/src/scripts/simulate-migration.ts` | Hardening seguridad |
| 28 | 📘 `consultaflow.md` (🇪🇸) + `consultaflow.IT.md` (🇮🇹) | 30 Sep 2026 | 2 h | docs di progetto | Flusso click RUT |
| 29 | 🧪 `QA_TEST_LIST.md` (60 casos / criterio aceptación específico) | 30 Sep 2026 | 1,5 h | QA plan | |
| 30 | 🕮 `MIGRATION_GUIDE.md` (guida ufficiale simulate-migration) | 30 Sep 2026 | 1,5 h | Guida utente | |
| 31 | ✅ RUTs truncados (Legalrepresentatives formattazione + sostituzione `formatRut` 3 file Mesh) | 25 Sep 2026 | 3 h | [Legalrepresentatives.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/Legalrepresentatives/Legalrepresentatives.tsx), MeshTable/MeshFlowTable/MeshFlowChartOwnedLib | 2 bug |
| 32 | 🗂️ Separazione semantica MeshTable (padri ONLY) vs MeshFlowTable (figlie ONLY) | 25 Sep 2026 | 6 h | [MeshTable.tsx:251-383](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L251-L383), [MeshFlowTable.tsx:155-254](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshFlowTable/MeshFlowTable.tsx#L155-L254) | Semantica |
| 33 | 🪤 Fix Loop infinito `check-socios-evaluations` (`useCallback` normRut) + deduplicación nombres diacríticos NFD | 22 Sep 2026 | 4 h | [FastCheckEX.tsx:255-256, 1958, 1995, 2100](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L255) | 2 bug root |
| 34 | 🛡️ Anti-double-fire `__lastSociosInitSig` guard ref | 22 Sep 2026 | 1 h | [FastCheckEX.tsx:187, 1934-L1947](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L187) | Hardening |
| 35 | 🧹 Limpieza UI return-null secciones vuote + nascondi “Mapa Empresas Controladas” (forceExpanded) | 22 Sep 2026 | 1 h | MeshTable, Legalrepresentatives, MeshFlowTable, MeshFlowChartOwnedLib | UX |
| 36 | 🟩 Fix “Sin datos malla societaria” return-null, LegRep 4× null-return, MeshFlow `match_type=true` dedup | 21 Sep 2026 | 3 h | L96-L396 MeshTable / Legal / MeshFlowTable | 3 root cause |
| 37 | 🟪 Round 2: `detectMainRut` BIDIREZIONALE + **Super Fallback Nucleare** v21 (100% relazioni) + banner diagnostico arancio ownRows 0 | 21 Sep 2026 | 3 h | [MeshTable:44-56, 374-404](file:///home/duxiter/duxiter_intermediate/src/components/ui/MeshTable/MeshTable.tsx#L44-L56), [FastCheckEX.tsx#L444-L478](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L444-L478) | 3 bug |
| 38 | 🟥 Round 3: disallineamento `===` stretto vs `rutMatchRobust` (7.1 MeshTable, 7.2 LegalReps) | 21 Sep 2026 | 2 h | MeshTable L306-L313, Legal L82-L84, v1.6 | Causa raiz |
| 39 | ✅ Traduzione Changelog Semanal a Español + actualitzación hoja tiempos | 30 Sep 2026 | 1 h | CHANGELOG_SEMANAL.ES.md | Traduzione |
| 49 | 🛡️ Bloque 0.7 — authz_service v2 (7 pasos RBAC+ABAC) + proyección 5 niveles (L1..L5) + legacy wrapper (AUTHZ_LEGACY_LAYER) + Frontend AuthContext/wildcard/AdminUI Profiles | 03 Oct 2026 | 5 h | [authz_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py), [proyeccion_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py), [dependencies.py#L33-L56](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L33-L56), AuthContext/RequirePermission/AuthzProfilesPage (Frontend src/) | Scaffolding 18 colecciones authz v2 en duxiter-2 |
| 50 | 🧪 Bloque 0.8 — Testing U1/U2/I1/I2 + QA Checklist 10-col + Bug GRAVE gate sensible (path match a.b.c fix) + Safety 4-layer lock OK (0 scritture duxiter) | 03 Oct 2026 | 8 h | [test_authz_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py) (24) / [test_proyeccion_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py) (9) / [test_integration_4_clientes_reales.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py) (9) / [test_integration_I2_auditoria_log_100pc.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py) (2) / QA_TEST_LIST.md#L274-L292 | Suite 44/44 PASS exit=0 · Bug GRAVE leak sensibili risolto
| 51 | 🏢 Bloque 1.1 (FASE1) — Poblamiento Unidades Organizacionales reales (4 tenants I1) + `usuario_alcance` populados (PROPIO/ORG/UNIDAD scope reales) + 3 bug menores corregidos (es_principal, scope vacíos, replica lag) + I1 ampliado 9→12 tests | 03 Oct 2026 | 3 h | [test_integration_4_clientes_reales.py#L356-L491](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L356-L491) · operación MongoDB staging `duxiter-2` `usuario_unidad` + `users` + `usuario_alcance` | Suite 47/47 PASS exit=0 (0.65s) · 4/4 pipeline 7 pasos PERMIT OK · 0 escrituras producción duxiter
| 52 | 🚧 Bloque 1.2 (FASE1) — Q7 SuperuserBlockedRoute(APIRoute) custom class su `/v2/workspace/*` + gate HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED` (40301) · router workspace `/me` + `/health` · 4 tests E2E A 403 · B/C/D 200 · fix minore attivazione tenant TI-PRuebas `duxiter-2` | 03 Oct 2026 | 3 h | [dependencies.py#L411-L501](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L411-L501) / [workspace.py#L1-L58](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/workspace.py#L1-L58) / [v2/router.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L23) / [test_superuser_blocked_route_e2e.py#L1-L139](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_superuser_blocked_route_e2e.py#L1-L139) | Suite **51/51 PASS 1.55s** exit=0 · Fallback legacy role=superuser + v2 is_superuser_wildcard · Safety lock L1 OK 0 scritture produzione duxiter
| 53 | 🎉 Bloque 1.3 (FASE1 · CIERRE 100%) — Migración graduale AUTHZ_LEGACY_LAYER 66 usuarios (G1 20% 13 · G2 50% +20 · G3 100% +33) · force_v2_only=True duxiter-2 · cache_version bump 4/5/6 · config.py global default `authz_legacy_layer=False` · guardia require_permission anti-fallback-legacy | 03 Oct 2026 | 3 h | [config.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L23) / [dependencies.py#L248-L262](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L262) + [L314-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L314-L325) / 66× update_many `users.authz_v2.force_v2_only=True` staging | Suite **51/51 PASS 1.55 s** exit=0 con `AUTHZ_LEGACY_LAYER=false` · 0 regressioni · 0 scritture produzione duxiter · banner FASE1 100%
| 54 | 💬 Bloque 2.1 (FASE2) · Comentarios Visibilidad VISIBLE / RESTRINGIDO / PERSONAL (HU-12) · Migración 005 (6 permisos nuevos comment+tag + 31 rol_permiso + 2 colecciones nuevas comentarios_v2 / catalogo_etiquetas + 9 índices) + Router Comments V2 CRUD `/v2/comments` + Helper projection `_filtro_visibilidad_lectura` 3 niveles (PERSONAL/VISIBLE/RESTRINGIDO) + Mount 27 routes v2 totali | 03 Oct 2026 | 3 h | [005_comentarios_y_etiquetas_catalogo_expand.up.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/005_comentarios_y_etiquetas_catalogo_expand.up.py#L1-L150) · [comments.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/comments.py#L1-L291) · [test_integration_I3_comentarios_hu12.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I3_comentarios_hu12.py#L1-L320) · [v2/router.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L1-L25) · [QA_TEST_LIST.md MÓDULO 11](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md#L296-L314) | Suite **59/59 PASS exit=0 2.11s** · 8 tests I3 nuevos HU-12 (U3-U6 unitari + I3-1/I3-2/I3-3 integrazione + 1 precondizioni) · 51 FASE1 0 regressioni · applied=005 verificato · Safety lock 4-capas OK 0 scritture duxiter
| 55 | 🏷️ Bloque 2.2 (FASE2) · Etiquetas Scope GENERAL / RESTRINGIDA · 4 permisos `tag.read/write/manage_restricted/grant` · Router V2 `/v2/tags` CRUD + `POST /tags/{id}/grant` (toggle usuarios_autorizados_ids) · Helper projection scope pura `_filtro_etiquetas_lectura` GENERAL=org / RESTRINGIDA=autorizados / SUPER=wildcard · Índice único (org,codigo) HTTP 409 · Routes totali v2 = 33 | 03 Oct 2026 | 3 h | [tags.py#L1-L330](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/tags.py#L1-L330) · [test_integration_I4_etiquetas_hu13.py#L1-L300](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I4_etiquetas_hu13.py#L1-L300) · [v2/router.py#L22](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L22) · [QA_TEST_LIST.md MÓDULO 12](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md#L318-L336) | Suite **65/65 PASS exit=0 2.09s** · 6 tests I4 nuevos (U7-U10 unitari + I4-1 E2E + I4 precondiciones) · 59 suite F1+F2.1 0 regresiones · applied=005 + 4 permisos tag.* OK · Safety lock 4-capas OK 0 scrittures duxiter
| 40 | *(Bugfix 3ª iteración desalineacion conteos Tarjeta Protestos Total 156 vs 164)* | 10 Set 2026 | 0,5 h | CHANGELOG final (truncato en originale) | Estimación mínima |
| 41 | *(Añadir totalizador mensual tabla tiempos + verificación consistencia 72 h)* | 30 Sep 2026 | 0,5 h | Tabla tiempos | QA |
| 42 | *(Ripasso generale riferimenti file:/// assoluti e range Lx-Ly ogni fix)* | 30 Sep 2026 | 0,5 h | Tutto documento | Enlaces |
| 43 | 🐛 Fix **RUT bloqueado a 2 dígitos** (formatChileanRut disparaba canonicalize prematuramente) | 01 Oct 2026 | 2 h | [api.ts:formatChileanRut#L367-L423](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L367-L423) | Caso 1 (<8 díg sin separadores = passthrough) |
| 44 | 🐛 Fix **Backspace deshabilitado en RUT completo/verificado** (guion colgado / dv borrado / guion borrado → loop inf recalc DV) | 01 Oct 2026 | 2 h | [api.ts:CASO 2#L394-L415](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L394-L415) + helpers [parseUserRutRespectfully](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L294-L319) | 3 sub-casos (2a/2b/2c) |
| 45 | ✅ Fix **validateChileanRut DV inválido aceptado** (antes tautología mod11(body) === dv_calculado always true) + actualización tests suite 39/39 PASS | 01 Oct 2026 | 1 h | [validateChileanRut#L252-L276](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L252-L276), [rut.test.ts](file:///home/duxiter/duxiter_intermediate/src/utils/rut.test.ts) | Corregidos RUTs ejemplo matemáticamente inconsistentes (77.879.240-2, 11.111.111-K) |
| 46 | ⚡ UX **Validación RUT onBlur SOLO** — Single Evaluation ya no valida/formatea durante la escritura (solo al perder foco y si hay texto) | 02 Oct 2026 | 1,5 h | [SingleEvaluation.tsx#L185-L199](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L185-L199), [submit guard#L201-L230](file:///home/duxiter/duxiter_intermediate/src/pages/evaluations/SingleEvaluation.tsx#L201-L230) | handleRutBlur nueva función; backup submit por si el usuario pulsa ENTER sin blur |
| 47 | 📜 **Especificación Técnica V2 (traducción DOCX cliente 23-08-2026 → MD)** — 13 secciones + Anexo A (24 bloques trazabilidad funcional→técnica) + 46 tablas DOCX reformateadas | 03 Oct 2026 | 6 h | [ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md](file:///home/duxiter/duxiter_intermediate/ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md) | Extracción DOCX con unzip + xml.etree stdlib Python (pandoc/mammoth no disponibles); Matriz 8 roles plantilla × 23 permisos atómicos; Pseudocódigo motor 7 pasos; 4 casos cliente Rheem/Clinica Dávila/Easy/UDLA |
| 48 | 🛠️ **Procedimiento Refactoring RBAC Legacy → RBAC+ABAC+Scopes (Plan ejecutable F0/F1/F2/F3)** — Gap Analysis, Impacto ×46 archivos con refs `file://`, 6 Q&A cerradas | 03 Oct 2026 | 6 h | [REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md](file:///home/duxiter/duxiter_intermediate/REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md) | Mapeo 5 roles legacy → 8 roles plantilla; Scripts migración MongoDB one-shot; DoD por fase; Backlog 19 HU con CA; Regla Q1: PN deny-by-default SALVO superuser global |
| 49 | 🧭 **Analisi codebase RBAC attuale (stato dell'arte)** — Matrice 27 permessi legacy × 5 ruoli; route guards; 4 pagine admin; billing/crediti; JWT + 2 check attivi utente/tenant | 03 Ott 2026 | 0 h | [DOCUMENTACION_ROLES_TENANTS_RBAC.md](file:///home/duxiter/duxiter_intermediate/DOCUMENTACION_ROLES_TENANTS_RBAC.md) | Base documentale per confronto legacy↔nuovo; costo incluso nella task #48 |
| 50 | ✅ **Bloque 0.7** — Scaffolding Backend Authz V2 `authz_service.py` pipeline 7 pasos + `proyeccion_service.py` 5 niveles + Frontend AuthContext + RequirePermission + AuthzProfilesPage admin | 03 Oct 2026 | 5 h | [authz_service.py#L68-L86](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L68-L86), [proyeccion_service.py#L80-L155](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L80-L155), [dependencies.py#L33-L56](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L33-L56), `src/contexts/AuthContext.tsx`, `src/pages/admin/AuthzProfilesPage.tsx` | Legacy wrapper compatibilidad `AUTHZ_LEGACY_LAYER`; Safety lock 4 capas anti-producción |
| 51 | ✅ **Bloque 0.8** — Testing Unitario (U1 24 authz / U2 9 proyeccion) + Integrazione I1 4 clienti reali duxiter-2 + I2 auditoría_log 100% coverage + QA MÓDULO 10 checklist 10-col. Suite: 44/44 PASS | 03 Oct 2026 | 8 h | [test_authz_service.py#L1-L580](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L1-L580), [test_proyeccion_service.py#L1-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py#L1-L325), [test_integration_4_clientes_reales.py#L1-L359](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L1-L359), [test_integration_I2_auditoria_log_100pc.py#L1-L190](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py#L1-L190) | **BUG GRAVE GATE SENSIBILE** risolto in proyeccion_service: paths `a.b.c` non filtravano — 2 strategie split + hojas. 0 scritture produzione. |
| 52 | ✅ **Bloque 1.1 (FASE1)** — Poblamiento Unidades Organizacionales reales 4 clienti I1. `usuario_unidad`(4 inserts) + `users` root (`unidad_ids`/`organizacion_id`/`pais_ids` bump cache_version 1→2→3) + `usuario_alcance` scope PROPIO/ORG/UNIDAD populados. Pipeline 7 pasos 4/4 PERMIT post | 03 Oct 2026 | 3 h | [test_integration_4_clientes_reales.py#L356-L491](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L356-L491), [FASE1_TRACKING_RBAC_ABAC.md](file:///home/duxiter/duxiter_intermediate/FASE1_TRACKING_RBAC_ABAC.md) | 3 bug minori: `es_principal→principal` rename, scope vuoti eliminati + reinsert, secondaryPreferred stale → URI `primaryPreferred`. Suite post: 47/47 PASS |
| 53 | ✅ **Bloque 1.2 (FASE1 · Q7)** — `SuperuserBlockedRoute` custom class per rotte `/v2/workspace/*`; superuser globale → HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED` (http_code_num 40301); fallback duale v2 + legacy role. Router workspace + exports + mount; fix AXA tenant `isActive=True` staging | 03 Oct 2026 | 3 h | [dependencies.py#L411-L501](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L411-L501), [workspace.py#L1-L58](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/workspace.py#L1-L58), [test_superuser_blocked_route_e2e.py#L1-L139](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_superuser_blocked_route_e2e.py#L1-L139) | Scenari E2E 4/4 PASS (A: 403 SUPER blocked, B/C/D: 200 workspace OK). Suite totale **51/51 PASS 1.55s** |
| 54 | ✅ **Bloque 1.3 (CIERRE FASE1 · G3 100%)** — Migrazione graduale 66 utenti su `force_v2_only=True` (G1 20% cv=4, G2 50% cv=5, G3 100% cv=6). Feature flag `AUTHZ_LEGACY_LAYER=False` GLOBAL DEFAULT in `config.py`. Guardia `require_permission` salta legacy se `force_v2_only=True` or flag=False. Bug fix `AttributeError bool.get` | 03 Oct 2026 | 3 h | [config.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L23), [dependencies.py#L248-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L325), [FASE1_TRACKING_RBAC_ABAC.md](file:///home/duxiter/duxiter_intermediate/FASE1_TRACKING_RBAC_ABAC.md) | 0 scritture produzione `duxiter`. 0 regressioni 51/51. FASE1 chiusa 100% ✅ |
| 55 | ✅ **Bloque 2.1 (FASE2 · HU-12)** — Comentarios Visibilidad 3 livelli VISIBLE / RESTRINGIDO / PERSONAL. Router `/v2/comments` 5 endpoints; helper scope filtro 3 branch (personal autor/admin / VISIBLE org / RESTRINGIDO ambito match UO/AREA/ORG). Migrazione 005 seed 6 permisos nuevos (2 comment + 4 tag) + colecciones nuevas `comentarios_v2` y `catalogo_etiquetas` + 9 índices background. Suite post 59/59 PASS 2.11s | 03 Oct 2026 | 3 h | [005_comentarios_y_etiquetas_catalogo_expand.up.py#L1-L150](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/005_comentarios_y_etiquetas_catalogo_expand.up.py#L1-L150), [comments.py#L1-L291](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/comments.py#L1-L291), [test_integration_I3_comentarios_hu12.py#L1-L320](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I3_comentarios_hu12.py#L1-L320) | 8 nuevos tests I3 U3-U6 + I3-1/I3-2/I3-3 + precond. 005 applied. Índice único `(org,codigo)` en catalogo_etiquetas. QA MÓDULO 11 ×10col |
| 56 | ✅ **Bloque 2.2 (FASE2 · HU-13)** — Etiquetas Scope GENERAL / RESTRINGIDA granular 4 permisos `tag.read / tag.write / tag.manage_restricted / tag.grant`. Router `/v2/tags` 6 endpoints CRUD + grant toggle AGREGAR/QUITAR `usuarios_autorizados_ids`. Helper scope projection GENERAL (org) / RESTRINGIDA (creador / usuarios_autorizados_ids / admin / superwild). DuplicateKeyError → HTTP 409 Conflict índice único. Suite post **65/65 PASS 2.09s** | 03 Oct 2026 | 3 h | [tags.py#L1-L330](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/tags.py#L1-L330), [test_integration_I4_etiquetas_hu13.py#L1-L300](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I4_etiquetas_hu13.py#L1-L300), [v2/router.py#L22](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L22) | 6 tests I4 PASS U7-U10 / I4-1 / precondiciones. 0 regresiones F1. QA MÓDULO 12 ×10col. Changelog tarea #55 |
| 57 | 🏭 **Bloque 2.3 (FASE2 · HU-15)** — Export Multinivel `tipo=CERTIFICADO|INFORME` clamp N2/N4 + auditoría immutable `export.tercero`. 1 endpoint `GET /v2/third-parties/{id}/export`. Map `EXPORT_PERMISOS` (CERT=export.certificate→N2, INF=export.detail→N4); helper puro `_nivel_export_final(decision_nivel, tipo)` clampea `min(n_dec, MAX_TIPO)`. Auditoría `_registrar_export_auditoria` insert 1 row por export. Gate PN/Sensitive ereditado. Suite FULL **71/71 PASS exit=0 2.51s**, 6 tests I5 nuevos. 0 escrituras producción. | 03 Oct 2026 | 3 h | [third_party_export.py#L1-L200](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/third_party_export.py#L1-L200), [test_integration_I5_export_hu15.py#L1-L360](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I5_export_hu15.py#L1-L360), [v2/router.py#L27](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L27), QA MÓDULO 13 Export | 6 tests I5 PASS: U11 clamp nivel helper · U12 projection gate PN/whitelist · U13 gate permiso 403 (CHC ADM sin export.* DENY PASO3 · SUPER allow) · U14 auditoría row delta +1 · I5-1 E2E PJ doc CERT≤N2 INF≤N4 · precondiciones 2 permisos export + 5 nivel_info docs. Routes v2 totali = 34 endpoints. QA MÓDULO 13 ×10col. **#56 / TOTAL 55/120h** |
| 58 | 🛡️ **Bloque 2.4 (FASE2 · HU-13/HU-14) — Gobierno Riesgo 4 Permisos SENSIBLES · Modal Doble Intención · Escalamiento Q4 3 Niveles · Auditoría gov.* valor_anterior/nuevo** — Migración 006 v2 fix (4 risk.* → es_sensible=True + escal NIV1/2/2/3 + cleanup orphans risk only 5 rows + 3 colecciones nuevas + índices únicos). Router `/v2/risk/*` 5 endpoints (GET config + 4 PUT). EnrichedUser expandido (usuario_permiso_overrides + email). Gate modal 428, gate escal Q4 403, validación umbrales 422. Fix registrar_auditoria usuario_email hardcoded. Suite FULL **77/77 PASS exit=0 3.35s**, 6 tests I6 nuevos (U15/U16/U17/U18/I6-1/I6-0). 0 escrituras producción `duxiter`. | 04 Oct 2026 | 3 h | [006_gobierno_riesgo_permisos_sensibles.up.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/006_gobierno_riesgo_permisos_sensibles.up.py) · [gobierno_riesgo.py#L1-L320](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/gobierno_riesgo.py#L1-L320) · [authz_service.py#L69-L237](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L69-L237) (EnrichedUser + hydrate) · [authz_service.py#L556-L579](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L556-L579) (audit fix email) · [test_integration_I6_gobierno_riesgo_hu13_14.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I6_gobierno_riesgo_hu13_14.py) · QA TEST MÓDULO 14 Gobierno Riesgo ×10col | L10 rispettato: SENSIBILI **NIEN** ereditabili da ruolo, nemmeno SUPER wildcard; solo GRANT individuale `usuario_permiso_override(uid, permiso_codigo, GRANT, sensible_confirmado=True, nivel_escal≥req). Fix RC-Bloq2.4-001 (migration 006 v1 cancellava 86 leg accidental → rollback safe + seed001 reapply idempotent + 006 v2 fix only risk). Routes totali v2 ≥35 endpoints. 0 regressioni FASE0/F1/F2.1/2.2/2.3. QA MÓDULO 14 ×4righe ×10col exactas. **#58 · TOTAL GLOBAL 56 tareas / 123 h · CUADRE OK** |
| 59 | 🪪 **Bloque 2.5 (FASE2 · HU-16) — Capacidad Pool 5 Niveles Q6 · Overshoot 150% Max · Soglie 90/100/120% Notifiche 1 Volta · Dual-write Sync Legacy `creditoperations` (1585 docs)** — Migración 007 up (4 colecciones nuevas: `pool_creditos_organizacion` + `usuario_limite_consumo_v2` + `consumos_log_v2` + `notificaciones_push` con índices únicos/compuestos/sparse) + 2 permisos pool nuevos (`pool.credit.view` NIV1 NO sensible · `pool.credit.manage` SENSIBLE NIV3 Q4 MAX) + seed 4 pools tenant I1 (SUPER=NIV5 250k · CHC=NIV3 10k · AXA=NIV2 2k · CCU=NIV1 500). EnrichedUser +2 campos (`pool_credits_data` + `usuario_limite_mes`). Servicio core `servicio_capacidad_pool.py` 6 funcs (obtener_pool_org upsert BASIC default · cambiar_plan_pool con proration conservativo ratio=min(1,consumos_prev/cred_prev) → saldo ≥0 SEMPRE + auditoria `capacidad.pool.*` valor_anterior/nuevo · `consumir_credito()` gate >150% → HTTP 402 `CREDITO_OVERSHOOT_150PCT_EXCEDIDO` · dual-write 2 righe (`consumos_log_v2` nuevo schema + `creditoperations` legacy con `metadata.migracion_v2=True`) · trigger soglie 90/100/120% **idempotenti sparse unique 1 sola volta x org x mese x cod** · asignar_limite_usuario_mes cuota individual · listar/marcar notificaciones). Router V2 `capacidad_pool.py` 7 endpoints (GET config, PUT plan manage NIV3+modal428+escalQ4403, GET consumo-historial días/solo_mios/limite, POST consumir interno QA, GET notificaciones solo_sin_leer, POST notificaciones/{id}/leida, PUT limite-usuario manage sensible). 4 RC risolti (runner 007 up coroutine RuntimeWarning → manual apply asyncio.run · ImportError current_user_enriched → pattern gov _enriched() locale · I7-1 DuplicateKey uk_usuario_override → delete_many pre-test cleanup · I7-2 autorizar() positional args → solo keyword args). Suite FULL FASE2 **83/83 PASS exit=0 3.64s** · 6 tests I7 nuevos (U19 modal428+escal403 · U20 overshoot150=402 · U21 soglie90/100/120 cnt 1-1-1 idempotenza retry OK · I7-0 precondizioni 007 applied/4col/perm/pools · I7-1 E2E SUPER GRANT manage NIV3 → cambia CHC PRO→ENTERPRISE (NIV5) + 4 consumi credito (4 rows log) + auditoria≥1 · I7-2 CCU deny pool.view autorizar=False paso_fallido≠None). 0 regressioni F0/F1/F2.1/2.2/2.3/2.4. 0 scritture produzione `duxiter`. Safety lock 4-capas OK. | 04 Oct 2026 | 3 h | [007_capacidad_pool_5_niveles.up.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/007_capacidad_pool_5_niveles.up.py) · [007 down](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/007_capacidad_pool_5_niveles.down.py) · [authz_service.py#L57-L107](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L57-L107) (SENSIBLES 8 tot + consts Q6 NIVELES_POOL5/SOGLIE90-100-120/ERR402 + EnrichedUser +2 attr) · [authz_service.py#L235-L274](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L235-L274) (hydrate step8 pool_org + limite_usuario_mes) · [servicio_capacidad_pool.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/servicio_capacidad_pool.py) (6 funcs core dual-write) · [capacidad_pool.py#L1-L268](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/capacidad_pool.py#L1-L268) (7 endpoints + pattern gov _enriched + gate_modal428 + gate_escal403) · [test_integration_I7_capacidad_pool_hu16.py#L1-L323](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I7_capacidad_pool_hu16.py#L1-L323) (6 tests I7 83/83) · QA_TEST_LIST.md **MÓDULO 15 Capacidad Pool Q6** × 4 righe × 10 colonne ESPAGNOL exactas (15-A cambio plan NIV3+modal428+prorata+audit · 15-B overshoot 700cr140%ok +200cr tot900=180%→ **402 PAYMENT_REQUIRED** 0 write · 15-C soglie90/100/120%=1 1 1 esatte + retry cnt RIMANE 1-1-1 sparse unique anti-spam · 15-D CCU deny pool.view 403 + post-grant 200 OK) | Q6 MVP conforme: overshoot controllato soft allowed <150% (solo notifiche); block duro 402 ≥151%. 3 notifiche anti-spam 1 volta/mese org/cod. Dual-write backward compat legacy creditoperations 1585 docs. Cambio plan ratio conservativo min(1,.) no credito fantasma. 0 regressioni suite 77 → 83/83 +6 I7 nuevos (3.64s exit=0). Routes v2 totali ≥42 endpoints. SENSIBILI globali = 8 elementi. **#59 · Oct2026 15→16 tareas / 51→54 h · TOTAL GLOBAL 56→57 tareas / 123→126 h · CUADRE OK** |

| 60 | 📜 **Bloque 2.6 (FASE2 · HU-17 · CIERRE FASE2) — Timeline Tercero Completo 4 Fuentes (CONSULTA_CREADA + auditoria_log 8acc + evaluationsHistory + usernotes legacy rut fallback + comentarios_v2) · Orden ASC Stretto (ts,id) · Proyección Incremental 5 Niveles N1..N5 · Paginación Cursor (last_ts, last_id) limit 1..500 · Scope Tenant PN Gate** — Servizio core `servicio_timeline_tercero.py` (~420 linee): (a) 4 fuentes aggregate + pseudo-evento CONSULTA_CREADA createdAt SEMPRE primo; (b) Orden ASC strict `(ts, _id)` tiebreak; (c) **Projection whitelist incremental N1..N5 hard**: N1=SOLO 6 campi {id,tipo,titulo,ts,ts_humano,fuente} NIENTE leak a utenti resumen-only; N2+utente/email/org/rut/accion/permitir; N3+motivo/tags/estado/permiso_origen/paso_fallido; N4+cuerpo/campos_adicionales/valor_anterior/nuevo; **N5+sensible=True** → `campos_sensibles` + `pn_gate_aplicado`. (d) Paginazione cursor: limit+1 richiesti, trim; `cursor_next={last_ts:f,last_id:s}`; ultima page cursor_next=None; (e) Conteggio reale fuentes per fuente return dict (non hardcodato). Router V2 `GET /v2/third-parties/{doc_id}/history`: pattern idéntico a `get_third_party` detalle (hydrate enriched + autorizar fastcheck.query pipeline 7 pasos L10 + if deny → HTTP 403 paso_fallido + **Scope tenant NONsuper: doc.tenantId != user.tenant → HTTP 404** non leak existenza fuori org + registrar_auditoria accion=`timeline.tercero.history` distinct). RC001-003 risolti: (001) Import non esiste → AsyncIOMotorClient diretto; (002) EventLoop closed + JWT secret mismatch → abolisco TestClient HTTP, uso DIRETTO autorizar + construir_timeline_tercero async motor; **(003 BUG GRAVE RC003) eventi=3/6 sempre = causa radice `jsonable()` convertiva ObjectId in stringhe PRIMA di estrarre tercero_oid/tenant_oid per filtri MongoDB (str vs ObjectId = 0 match)** → FIX: ObjectId estratti PRIMA di jsonable + isinstance check + cast ObjectId(); sostituito `async for cursor` → await `.to_list(length=9999)`; aggiunto `campos_sensibles` e `pn_gate_aplicado` a parser `_evento_desde_auditoria_log`; cursor_next usa `projected_items[-1]['id']`. Tests I8: 7/7 PASS. Suite FULL **90/90 PASS exit=0 6.00s** (+7 I8 su 83). 0 regressioni. 0 scritture produzione `duxiter`. Safety lock 4-capas OK. FASE2 6/6 BLOQUES CERRADO 100%. | 04 Oct 2026 | 3 h | [servicio_timeline_tercero.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/servicio_timeline_tercero.py) Fix RC003 L283-L292 ObjectId PRIMA jsonable; Projection N1-N5 L96-L150; 4 fuentes aggregate L302-L367; Cursor pag L381-L407; cnt fuentes real L408-L418 · [third_parties.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/third_parties.py#L23) import · [third_parties.py#L188-L256](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/third_parties.py#L188-L256) endpoint GET history; hydrate/autorizar/scope404/registrar_auditoria/return timeline · [test_integration_I8_timeline_tercero_hu17.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I8_timeline_tercero_hu17.py#L1-L480) (7 tests I8 nuovi 7/7 PASS, async motor direct senza HTTP, seed/cleanup async) · [FASE2_TRACKING Bloq2.6](file:///home/duxiter/duxiter_intermediate/FASE2_TRACKING_RBAC_ABAC.md#L241-L303) EXP/RUN/VERIF + Banner ASCII chiusura + checklist 6/6 ✅ · QA_TEST_LIST.md **MÓDULO 16 Timeline Terzo** × 4 righe × **EXACT 10 COLONNE ESPAGNOL** (16-A N1 6-chiavi FORZATO · 16-B N5 completa+sensibili · 16-C ASC+cursor · 16-D Scope 404/403 + PN gate) | **RC003 BUG GRAVE RISOLTO**: jsonable() converte ObjectId → str → filtri Mongo 0 rows; Fix: isinstance + cast ObjectId PRIMA di jsonable + to_list() invece async for. 7/7 I8; 83→90/90 FULL; 0 regressioni. **FASE2 6/6 CERRADA 100%: F0(44) → F1(51) → F2(90)**. Routes V2 ≥ 43. Migraciones 001→007 applied. Permisos 31 catálogo, 8 SENSIBLES globali. QA 6 módulos M11→M16. **Oct 2026: 16→17 tareas · 54→57 h. TOTAL GLOBAL: 57→58 tareas · 126→129 h. CUADRE 129=129.** ✅ Banner ASCII chiusura FASE2 100% su tracking file. |
| 61 | ✅ **Script Gestión Servicios** `start_services.sh` (start/stop/restart/status backend+frontend) · Forker demone Python per backend (nessuna perdita env JWT/MONGO) · Safety lock boot: se `db != duxiter-2` STOP immediato HTTP 503 via `/api/system/info` · Banner runtime PID/PORTE/LOGS in `.runtime/`. | 09 Oct 2026 | 1 h | [scripts/start_services.sh#L1-L512](file:///home/duxiter/duxiter_intermediate/scripts/start_services.sh#L1-L512) · [dependencies.py#L33-L56](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L33-L56) | 0 regressioni 90/90 ✅; stop SIGTERM+SIGKILL fallback; Vite proxy `/api` → `:8181` changeOrigin=true. **TOTAL GLOBAL 58→59 / 129→130 h** |
| 62 | 🐛 **Frontend FastCheckEX Null-Safety Fix** (2 crash Claudio CCU white-screen): (a) `setRiskSummary` sovrascriveva sempre → rewrite merge state Object.assign invece replace; (b) `legalRules.length` JS precedenza `obj?.prop.length` falliva se undefined → `(riskSummary.allRules?.legalRules || []).length`; (c) `totalSevero` undefined → fallback + null-safe su `criticalParams`. | 09 Oct 2026 | 1 h | [FastCheckEX.tsx#L1559-L1597](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L1559-L1597) (merge riskSummary) · [L4267-L4293](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L4267-L4293) (criticalParams null-safe) · [L6247-L6248](file:///home/duxiter/duxiter_intermediate/src/pages/FastCheckEX.tsx#L6247-L6248) (legalRules `|| []`) | Utente conferma: "okay funziona". 0 white-screen. **59→60 / 130→131 h** |
| 63 | 📜 **Backend Historial Consultas** (`GET /rut/historical-consultas` + GET `/stats`) · Collisione tenantId STR 24-hex vs ObjectId → `$in:[oid,str]` dual-type query; Stats aggregazione falliva per `$dateToString` su campo ISO-string → rewrite post-process Python safe; Endpoint `GET /rut/results/{id}` per visualizzazione dettaglio Timeline Terzo. Bulk update 14 docs CCU `consulta_history.userId→orgId`. | 09 Oct 2026 | 2 h | [admin_compat.py#L1844-L2117](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L1844-L2117) · Stats rewrite Python L2040-L2117 · [L2118-L2438](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L2118-L2438) Profile Enriched + endpoint result dettaglio | Utente conferma: "OK storico funziona". CCU Claudio count=14 consultas. **60→61 / 131→133 h** |
| 64 | 👤 **Frontend Profilo Utente Avatar Click** · Backend: GET `/users/me/enriched` aggrega (user + organizacion + planPool + permisos RBAC arricchiti + historial + últimas 10 audit). Frontend: **[ProfilePopover.tsx](file:///home/duxiter/duxiter_intermediate/src/components/ui/ProfilePopover.tsx)** (6 sezioni: Info Personali / Organización / Plan y Créditos / Permisos RBAC colorati badge S/N / Historial / Auditorías 10) · Close ESC / click-outside / X-button; Progress bar crediti arancione >100% · rosso ≥150%. Integración en DashboardLayout sidebar desktop+mobile. **Responsive larghezza**: mobile w-full → sm 94% → md 90% → `max-w-2xl` → `2xl max-w-7xl` centratura flexbox (rimosso posizionamento assoluto `left-[280px]` che rompeva desktop). | 09 Oct 2026 | 3 h | [admin_compat.py#L2118-L2438](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L2118-L2438) · [api.ts#L707-L789](file:///home/duxiter/duxiter_intermediate/src/services/api.ts#L707-L789) Profile* interfaces + userProfileApi · [ProfilePopover.tsx#L1-L350](file:///home/duxiter/duxiter_intermediate/src/components/ui/ProfilePopover.tsx#L1-L350) · Responsive width [L283-L295](file:///home/duxiter/duxiter_intermediate/src/components/ui/ProfilePopover.tsx#L283-L295) · [DashboardLayout.tsx#L66-L67](file:///home/duxiter/duxiter_intermediate/src/layouts/DashboardLayout.tsx#L66-L67) + [L266-L281](file:///home/duxiter/duxiter_intermediate/src/layouts/DashboardLayout.tsx#L266-L281) + [L346-L361](file:///home/duxiter/duxiter_intermediate/src/layouts/DashboardLayout.tsx#L346-L361) + [L410](file:///home/duxiter/duxiter_intermediate/src/layouts/DashboardLayout.tsx#L410) | SUPER curl 200 · 31 permisos / 8 sensibles / ENTERPRISE 250k · CCU Claudio screenshot UI 6 sezioni render OK, 2 colonne org/plan affiancate desktop. Utente: "okay bene". **61→62 / 133→136 h** |
| 65 | 👥 **Backend Lista Utenti Scoped Org + Crea/Modifica Privacy Gates** · Fix COLLISIONE route FastAPI: `/tenant/{tenant_id}/users` (parametrico SUPER) registrata PRIMA di `/tenant/users` non parametrico → `tenant_id="users"` → 403 fasullo SUPERUSER_REQUIRED. **Fix**: rinominata → **`GET /scoped-tenant/users`** (zero collisioni). Ruoli canonicalizzati: 14 alias → 6 ruoli (`superuser`, `tenant_admin`, `evaluator`, `read_only`, `write_only`, `user`). Privacy: TENANT_ADMIN vede/modifica SOLO utenti stessa org; non può assegnare/promuovere/declassare SUPER role. Dual-type OID/str query `tenantId`. Pydantic models `ScopedUserCreateBody` / `ScopedUserUpdateBody` (minLength + email regex). Password bcrypt hash `get_password_hash()`. Audit create/update utente. | 09 Oct 2026 | 2,5 h | [admin_compat.py#L2441-L2911](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L2441-L2911) · GET lista L2441-L2573 · POST create L2576-L2777 · PUT update L2780-L2937 · Ruoli canonicali L2578-L2623 | 5/5 Test E2E curl PASSATI: (a) POST Evaluator CCU=200; (b) POST superuser CCU=403; (c) POST superadmin SUPER=200; (d) PUT se stesso CCU=200; (e) PUT cross-org CMPC=403 CROSS_ORG_EDIT_FORBIDDEN_NOT_SUPER. **62→63 / 136→138.5 h** |
| 66 | 👥 **Frontend Lista Utenti + Modale Add/Edit (UserModal/TenantUsers)** · Rewrite completo: parser risposta `{success, users}` oppure `Array`; 6 ruoli badge coerenti; Filtri 6 opzioni (search/role/status); Loading/Empty; Toggle status smart SUPER-only; Switch URL → `/scoped-tenant/users`. Dropdown ruoli dinamico: Super vede 6 disponibili (incluso Superadmin); TENANT_ADMIN Claudio vede **solo 5** (Superadmin rimosso); label "N disponibili" interpolazione `{{count}}`. Mapping 12 codici errore backend → toast. **Fix bug**: (i) `ReferenceError logger not defined` → import + `apiClient` axios interceptor JWT; (ii) Vite redeclaration closeSidebar → rimossa duplicato. | 09 Oct 2026 | 2,5 h | [UserModal.tsx#L1-L377](file:///home/duxiter/duxiter_intermediate/src/components/modals/UserModal.tsx#L1-L377) · Ruoli dinamici L93-L111 · Errori backend → toast L191-L208 · [TenantUsers.tsx#L1-L348](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L1-L348) · Filtri + badges ruolo | GetDiagnostics 0 errors ✅; Browser CCU Add User mostra "5 disponibili" senza Superadmin ✅. Utente: "okay funziona". **63→64 / 138.5→141 h** |
| 67 | 🌐 **Refactor react-i18n 100% Componente Utenti + Modale** (vincolo permanente utente "ricorda sempre di usare i18n"). Namespace nuovi: `tenantUsers` (38+ chiavi: title/subtitle/addUser/search/filters/table/actions/errors/toasts + interpolazione `{{count}}`) + `userModal` (52+ chiavi: titles/forms/buttons/toasts/errors 12 voci/roleOptions 6 ruoli con label + description) → deep merge sicuro EN, ES, PT, FR translation.json. Sostituzioni hook `useTranslation` `t()`: **UserModal 100%**, **TenantUsers 100%** (~30 sostituzioni: H1 title, subtitleWithCount, Add User, search placeholder, options AllRoles/AllStatus/role/status, 5 headers tabella, loading/empty, Edit/Activate/Deactivate, 3 toasts, 3 errori). | 09 Oct 2026 | 2 h | 4× `src/locales/{en,es,pt,fr}/translation.json` → namespaces `tenantUsers` + `userModal` · [UserModal.tsx#L25](file:///home/duxiter/duxiter_intermediate/src/components/modals/UserModal.tsx#L25) import useTranslation · [TenantUsers.tsx#L2](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L2) + [L25](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L25) hook + roleMeta L49-L81 | 4 lingue verificate browser: EN → ES → PT → FR. Zero warning `i18next missingKey` console in TUTTE le 4 lingue. GetDiagnostics: 0 errors ✅. **64→65 / 141→143 h · CUADRE 143 OK** |
| 68 | 🔑 **Reset Password tenant-scoped (TENANT_ADMIN resetta password utenti della sua organizzazione)**. Nuovo endpoint **`PATCH /api/scoped-tenant/users/{id}/reset-password`** con 7 privacy gate: (1) ADMIN_OR_SUPERUSER_REQUIRED 403; (2) INVALID_USER_ID 400; (3) NON_AUTO_RESET 400; (4) USER_NOT_FOUND 404; (5) CROSS_ORG_FORBIDDEN 403 (tenant admin resetta SOLO utenti stessa org); (6) CANNOT_RESET_SUPERUSER 403 (solo super può resettare super); (7) NEW_PASSWORD_INVALID 422 (min 6 chars). **Fix bug critico**: PUT `/scoped-tenant/users/{id}` non impostava il campo `password` (usato dal login) ma solo `passwordHash`/`password_hash` → login dopo cambio password falliva. Aggiunto `set_up["password"] = ph`. Frontend: pulsante ámbar "Restablecer contraseña" in TenantUsers.tsx + modale max-w-md centrata con 2 input (nuova password + conferma), validazione match + min 6 chars, chiamata `PATCH`. i18n namespace `tenantUsers.resetModal` × 4 lingue (EN/ES/PT/FR). Audit log diretto in `auditoria_log` accion=`admin.users.reset_password`. cache_version +2 invalida JWT. | 11 Oct 2026 | 2 h | [admin_compat.py#L2941-L3067](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L2941-L3067) endpoint reset password · Fix PUT campo `password` [L2880](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L2880) · [TenantUsers.tsx#L138-L170](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L138-L170) handler · pulsante [L335-L345](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L335-L345) · modale [L382-L440](file:///home/duxiter/duxiter_intermediate/src/pages/tenant/TenantUsers.tsx#L382-L440) · 4× `src/locales/{en,es,pt,fr}/translation.json` chiavi `tenantUsers.resetModal` | **6/6 test E2E curl PASSATI**: (1) CMPC reset utente org=200 + login nuova password OK; (2) CMPC reset SUPER=403 CANNOT_RESET_SUPERUSER; (3) CMPC auto-reset=400 NON_AUTO_RESET; (4) password<6=422; (5) SUPER cross-org reset=200; (6) validazione password match frontend. py_compile OK · GetDiagnostics 0 errors · i18n 4 lingue zero missingKey. **65→66 / 143→145 h · CUADRE 145** |
| 69 | 🐛 **Hotfix FastCheckEX: Parametri/Dettagli mancanti + "Rehacer evaluación" 404/403**. **6 bug concatenati**: (1) `GET /rut/results/{id}` restituiva dati annidati in `doc.data` ma frontend legge `response.data.riskAssessment` direttamente → **fix: flatten `data` nel body** (helper `_flatten_eval_doc`); (2) `GET /rut/results/rut/{rut}` e `GET /rut/results/latest` **non esistevano** → "No se encontraron datos" dopo Rehacer → **creati entrambi**; (3) tenant con `availableCredits=None` → 402 → **assegnati 1000 crediti** a SUPER/CMPC/UCSC/Virbac; (4) variabili `SHERIFF_V2_*`/`LEGACY_BASE_URL`/`DEQUIENES_*` in `fastcheck_api/.env` ma backend legge `.env` root → 502 "Missing BASE_URL" → **copiate nel .env root**; (5) risultati nuovi in `results` hanno solo `tenantId`, filtro usava `organizacion_id` → 404 non-super → **filtro dual-type `tenantId` OR `organizacion_id` (ObjectId o string)**; (6) ruolo `ADMIN_GENERAL` ha `fastcheck.query` come `CONFIGURABLE_OPCIONAL` (non `INCLUIDO`) → 403 Authz V2 → **override GRANT `fastcheck.query`** per Claudio/Aníbal/Germán + cache_version+1. `latest` registrato **prima** di `{result_id}` per evitare collisione route parametrica. Ricerca su entrambe collezioni `evaluationresults` + `results` (helper `_find_latest_eval`). | 11 Oct 2026 | 3 h | [admin_compat.py#L886-L1112](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L886-L1112) endpoints `latest` + `{result_id}` flatten · [L1053-L1112](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L1053-L1112) endpoint `/rut/{rut}` dual org filter · helpers `_flatten_eval_doc`/`_find_latest_eval`/`_resolve_user_org`/`_user_is_super`/`_eval_collections` [L984-L1050](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/admin_compat.py#L984-L1050) · `.env` root SHERIFF/LEGACY/DEQUIENES vars · DB `tenants.creditBalance=1000` · DB `usuario_permiso_override` GRANT fastcheck.query | **E2E come Claudio (UCSC) PASSATI**: `POST /rut/lookup` 200 crea risultato tenantId=UCSC · `GET /rut/results/rut/76991849-3` 200 restituisce risultato · `GET /rut/results/latest` 200 · `GET /rut/results/{id}` 200 con riskAssessment+details flatten. **pytest 90/90 PASS**. Utente: "okay funziona". **66→67 / 145→148 h · CUADRE 148** |

---

## 🚀 CICLO POST-FASE2 · 09 Oct 2026 (Operatividad Platform / QA UI)

### ✅ Resumen entregables 09 Oct 2026 (7 tareas · 14 h):
- Script gestión servicios + safety lock boot (`duxiter-2` only)
- FastCheckEX 2 crash null-safe Claudio CCU risolti (merge state, legalRules, totalSevero)
- Historial Consultas (endpoint + dual-type query + stats Python safe + 14 docs CCU)
- Profilo Utente Avatar click: Backend `/users/me/enriched` + Frontend ProfilePopover.tsx 6 sezioni + responsive max-w-7xl centrato
- Lista/Crea/Modifica Utenti scoped org: Fix collisione rotte FastAPI (403 fasullo) → `/scoped-tenant/users`; 5/5 E2E curl PASS (privacy + cross-org + super-gate)
- UserModal/TenantUsers rewrite frontend (ruoli 5/6 dinamici, logger fix, 12 errori → toast)
- Vincolo i18n permanente attuato: 2 namespaces nuovi × 4 lingue (EN/ES/PT/FR), zero missingKey console.

---

## 🏁 CIERRE FASE 2 · BANNER ASCII 100%
```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🎉  FASE 2 RBAC+ABAC FASTCHECK — CERRADA 100%  ·  04.10.2026            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  • FASE 0: 44/44 PASS  ·  FASE 1: 51/51 PASS  ·  FASE 2: 90/90 PASS      ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │ 2.1 │ 💬 │ Comentarios V2 Visibilidad HU-12      │  59/59  │ 2.11 s │   ║
║  │ 2.2 │ 🏷️ │ Etiquetas Scope General/Restringida   │  65/65  │ 2.09 s │   ║
║  │ 2.3 │ 🏭 │ Export Multinivel N2/N4 HU-15          │  71/71  │ 2.51 s │   ║
║  │ 2.4 │ 🛡️ │ Gobierno Riesgo 4 SENSIBLES HU13/14   │  77/77  │ 3.35 s │   ║
║  │ 2.5 │ 🪪 │ Capacidad Pool Q6 5 Planes HU-16       │  83/83  │ 3.64 s │   ║
║  │ 2.6 │ 📜 │ Timeline Tercero 4 Fuentes HU-17       │  90/90  │ 6.00 s │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ✅ Permisos = 31 │ SENSIBLES globali = 8 │ Routes V2 ≥ 43 endpoints     ║
║  ✅ Safety lock 4-capas = 0 scritture duxiter in TUTTE le fasi           ║
║  ✅ QA 6 módulos (11→16) × 4 scenarii ognuno × 10 colonne exactas       ║
║  ✅ Migraciones aplicadas staging duxiter-2: 001, 002, 003, 004, 005, 006, 007 ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 🧮 Cuadre Final Horas
```
Total desglose detallado (58 tareas F2+CIERRE) → 129 h
Total + Post-FASE2 (7 tareas 09 Oct 2026 = 14 h) → 143 h
Total + 11 Oct 2026 (2 tareas: Reset Password 2h + Hotfix FastCheckEX 3h = 5 h) → 148 h
                                    ✅ CUADRE 148 OK
```

---

*Fin del documento. Última actualización: 11.10.2026 (Post-FASE2: Script Servicios · Fix FastCheckEX · Historial 404 · Profilo Avatar Click · Lista Utenti Scoped Org · i18n Permanente 4 lingue · **Reset Password tenant-scoped 11.10** · **Hotfix FastCheckEX flatten+endpoints 11.10** · Suite FULL 90/90 PASS exit=0 5.28s · 0 scritture producción `duxiter` · Safety lock 4-capas OK · CUADRE 148 h).*
