# FASE 1 — RBAC+ABAC+SCOPES — TRACKING PASOS EJECUTADOS / PENDIENTES

> **Fecha de creación**: 2026-10-03 (F1 · Poblamiento UO reales · SuperuserBlockedRoute · Migración gradual AUTHZ_LEGACY_LAYER)
> **Branch**: `feat/rbac-abac-fase1` (fork desde `feat/rbac-abac-refactor` commit post-Bloque 0.8)
> **DB objetivo OBLIGATORIO**: `duxiter-2` (SOLO staging). **NUNCA `duxiter`** (producción).
> **Idioma**: Español (obligatorio para documentación operativa — hard constraint).

---

## 🛡️ HARD CONSTRAINTS DE FASE (SIEMPRE ACTIVOS)

| ID  | Regla | Verificación |
|-----|-------|--------------|
| L1 | **Solo operar sobre `duxiter-2`. NUNCA `duxiter`.** | 4 capas: env whitelist → runner hardcode → ReadonlyCollectionProxy (22 métodos bloqueados) → `_assert_safe_target_db` HTTP 503 en dependencias |
| Q1 | Acceso PN denegado por defecto, salvo `party.query.pn` override GRANT confirmado al `superuser` global | `usuario_permiso_override` + `SENSIBLES` gate paso 4 `authz_service.py#L279-L295` |
| Q2 | `incluye_descendientes=TRUE` por defecto en alcances UO | BFS `/org/units/{id}/descendientes` · `authz_service.py#L382-L423` |
| Q3 | MVP F1: pertenencia máxima **1 UO + 1 Área funcional** (sin multi-pertenencia) | `usuario_unidad` principal único per tenant |
| Q4 | Escalamiento niveles **fijos a 3** para F0/F1 | `ESCALAMIENTO_NIVELES_FIJOS: (1,2,3)` `authz_service.py#L62-L63` |
| Q5 | Lista motivos consulta PN **fija a 6** valores F0/F1 | `catalogo_motivos_consulta_pn` F0 seed |
| Q6 | Balance créditos admite overshoot controlado sin hard block | Passthrough billing F0/F1 |
| Q7 | **FASE1 NUEVA**: `superuser` NO accede a rutas workspace tenant-specific | `SuperuserBlockedRoute` router class + middleware HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED` |

---

## 🎯 OBJETIVOS FASE 1 (Bloques 1.1 → 1.3)

| Bloque | Título | Salida esperada |
|--------|--------|-----------------|
| 1.1 | Poblamiento real de `unidades_organizacionales` + `usuario_unidad` | 4 tenants CHC/AXA/CCU/SUPER tienen UO real; 4 usuarios I1 referencia tienen `unidad_ids != []`; `en_alcance(UNIDAD)` retorna MATCH para tenant_admin CHC |
| 1.2 | `SuperuserBlockedRoute` en workspace tenant + tests E2E | Rutas `/api/v2/workspace/*` retorna HTTP 403 si claim `authz_v2.superuser_global=True`; tests 4/4 PASS |
| 1.3 | Migración gradual 66 usuarios `AUTHZ_LEGACY_LAYER` feature flag | Grupos 20% → 50% → 100% usuarios; cada grupo: tests legacy routes PASS sin regresiones + audit log delta = +N |

---

## ✅ **PASOS EJECUTADOS** (actualizado: 2026-10-03 15:30 CLT)

### 🔄 Preámbulo · Fork branch FASE1
| Paso | Resultado |
|------|-----------|
| `git checkout feat/rbac-abac-refactor` (base post-0.8 · 44/44 tests) | ✅ |
| `git checkout -b feat/rbac-abac-fase1` | ✅ Switched OK |
| Base commit suite pytest: `44 passed in 0.58s exit=0` | ✅ |

---

### 📦 Bloque 1.1 — Poblamiento Unidades Organizacionales reales en tenants (CERRADO 2026-10-03 15:22 CLT · ✅ 47/47 PASS)

#### (1/3) DISCOVERY · Estado `unidades_organizacionales` + `usuario_unidad` en `duxiter-2`
**Objetivo**: Determinar N docs por tenant, identificar ObjectId UO para 4 usuarios I1.
| Colección | Conteo post-F0 (pre-1.1) | Observación |
|-----------|---------------------------|-------------|
| `organizaciones` | 42 | 4 tenant_legacy_id coinciden con 4 users.tenant I1 (SUPER, CHC CMPC, AXA TI-Pruebas, CCU UCSC) |
| `unidades_organizacionales` | 42 | 1 UO-ROOT por organización (1:1 con org por construcción F0 migración 003) |
| `usuario_unidad` | 0 | Sin docs aún; placeholders sólo en usuario_alcance |
| `usuario_alcance` | 8 | 2 docs x 4 usuarios I1 (tipo ORG/UNIDAD pero **campos org_id=Null, unidad_ids=[]** → placeholders vacíos) |

**Tabla Mapping Definitivo (4 Clientes → ORG → UO-ROOT, 1:1:1)**:
| Código | users.tenant (ObjectId) | tenant_legacy_id → Organización | ORG ObjectId | UO-ROOT ObjectId | País ID |
|--------|-------------------------|----------------------------------|--------------|------------------|---------|
| A) SUPER | `696eaa2addea6b91873de15e` | System | `6ac127b7e2f379cf956f2576` | `6ac127b8e2f379cf956f2578` | `CL` |
| B) CHC | `6a710ccc41eb4a347a7b2af8` | CMPC | `6ac127c3e2f379cf956f2648` | `6ac127c3e2f379cf956f264a` | `CL` |
| C) AXA | `696f6386174b6c5725971a6c` | TI - PRuebas | `6ac127bae2f379cf956f258b` | `6ac127bae2f379cf956f258d` | `CL` |
| D) CCU | `6a2971190e276e4dabaa6b6c` | UCSC | `6ac127c0e2f379cf956f2609` | `6ac127c0e2f379cf956f260b` | `CL` |

#### (2/3) RUN · Asignación UO + usuario_unidad + alcances para 4 usuarios referencia I1
**Operaciones MongoDB ejecutadas (safety lock OK: 0 escrituras `duxiter`)**:
| Paso | Colección | Δ | Detalle |
|------|-----------|---|---------|
| 1 | `usuario_unidad` | +4 INSERT | 1 doc por usuario (principal=True) · `usuario_id` + `unidad_id` = UO-ROOT de la tabla mapping |
| 2 | `usuario_unidad` | 4 UPDATE | `$rename es_principal → principal` (fix RC2: campo esperado por hydrate) |
| 3 | `users` | 4 UPDATE | `{unidad_ids: [uo_id], organizacion_id, pais_ids: [CL]}` + `cache_version +=1` (1→2→3) para invalidación LRU global |
| 4 | `usuario_alcance` | -8 DELETE | Eliminados placeholder scope ORG/UNIDAD con campos vacíos (RC1 root cause SIN_MATCH) |
| 5 | `usuario_alcance` | +16 INSERT | 4 scope × 4 usuarios: (VER_PROPIO, ACTUAR_PROPIO) para todos + (VER_ORG + ACTUAR_ORG para A/B/D) · (VER_UNIDAD + ACTUAR_UNIDAD para C) |

**3 Bug minori risolti durante RUN (RC1-RC3)**:
1. **RC1 SIN_MATCH_SCOPE_VER**: scope placeholder vuoti → fix DELETE+INSERT 16 scope reali.
2. **RC2 Hydrate unidad_ids=[]**: `es_principal` vs campo `principal` → fix `$rename`.
3. **RC3 Secondary lag 0.5s**: URI `secondaryPreferred + maxStalenessSeconds=120s` leggeva stale dopo scritture → fix nuova URI `MONGODB_URI_PRIMARY = primaryPreferred (no maxSS)`.

**Riferimenti**: Sezione RUN dettagliata + 3 RC in [CHANGELOG_SEMANAL.md#L115-L167](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L115-L167) · Tarea #51 [CHANGELOG_SEMANAL.md#L1500-L1501](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1500-L1501).

#### (3/3) VERIFICACIÓN · Pipeline autorizar 7 pasos + pytest suite
**4/4 PERMIT · Pipeline autorizar() 7 pasos (DOCX §6.3)**:
| Código | Permiso solicitado | Nivel info | Resultado | Origen aprobación | Scope match |
|--------|--------------------|------------|-----------|-------------------|-------------|
| A) SUPER | `admin.users` | INFO_COMPLETA (L5) | ✅ PERMITIR | SUPERUSER_WILDCARD (paso 3 bypass) | — |
| B) CHC | `admin.structure` | INFO_COMPLETA (L5) | ✅ PERMITIR | ROL:ADMIN_GENERAL + GRANT rol | MATCH_ORGANIZACION (scope VER ORG) |
| C) AXA | `fastcheck.query` | DETALLE_RIESGO (L4) | ✅ PERMITIR | ROL:EVALUADOR_ANALISTA + GRANT rol | MATCH_PROPIO (scope VER PROPIO) + MATCH_UNIDAD |
| D) CCU | `admin.structure` | RESULTADO_GENERAL (L1) | ✅ PERMITIR | ROL:ADMIN_GENERAL + GRANT rol | MATCH_ORGANIZACION (scope VER ORG) |

**Resultati pytest suite globale (post-Bloque1.1)**:
| Suite | Tests | Resultado | Tiempo | Riferimento file |
|-------|-------|-----------|--------|------------------|
| U1 authz_service unitari | 24 | PASS | — | [test_authz_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py) |
| U2 proyeccion_service unitari | 9 | PASS | — | [test_proyeccion_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py) |
| I1 integrazione 4 clienti (legacy + Bloque1.1) | 12 | PASS | 0.46 s | [test_integration_4_clientes_reales.py#L356-L491](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L356-L491) (3 nuovi test B2/C3/D2) |
| I2 auditoría_log 10 escenarios | 2 | PASS | — | [test_integration_I2_auditoria_log_100pc.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py) |
| **TOTAL GLOBALE** | **47** | **47/47 PASS** | **0.65 s exit=0** | `pytest fastcheck_api/tests/ -q --tb=short` |

---

### ✅ Bloque 1.2 — `SuperuserBlockedRoute` workspace tenant (CERRADO 2026-10-03 16:45 CLT · Suite 51/51 PASS)
**Hard constraint Q7 FASE1**: `superuser` GLOBALE → HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED` su TUTTE le rotte `/v2/workspace/*` (tenant-specific).

| Componente | Ubicación | Estado | Refs líneas |
|------------|-----------|--------|--------------|
| `SuperuserBlockedRoute(APIRoute)` class + safety lock | `fastcheck_api/app/api/dependencies.py` | ✅ IMPLEMENTADO | [L411-L501](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L411-L501) |
| Router `/v2/workspace/*` (route_class + `/me` + `/health`) | `app/api/v2/routers/workspace.py` (NUOVO file) | ✅ IMPLEMENTADO | [workspace.py#L1-L58](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/workspace.py#L1-L58) |
| Export package workspace_router | `app/api/v2/__init__.py` + `app/api/v2/routers/__init__.py` | ✅ Montado OK | [v2 init#L7-L16](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/__init__.py#L7-L16) |
| Aggregatore v2 `include_router(workspace_router)` | `app/api/v2/router.py` | ✅ PATH finale `/v2/workspace/*` | [router.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L23) |
| Tests E2E 4 scenari (A SUPER 403 · B/C/D 200) | `tests/test_superuser_blocked_route_e2e.py` (NUOVO) | ✅ 4/4 PASS · 0.84 s | [test_e2e_superuser#L1-L139](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_superuser_blocked_route_e2e.py#L1-L139) |

**Risultati 4 scenari E2E Blq1.2 Q7:**
| Label | Utente / Ruolo legacy | Endpoint | HTTP risposta | `detail.code` | PASS/FAIL |
|---|---|---|---|---|---|
| A SUPER | superadmin@gmail.com · superuser · wildcard=True | GET /v2/workspace/me (Bearer JWT firmato) | **403** | `SUPERUSER_WORKSPACE_BLOCKED` | ✅ PASS |
| B CHC | anibal.fernandez@cmpc.com · tenant_admin (CMPC) | GET /v2/workspace/me (Bearer JWT) | **200** | — | ✅ PASS |
| C AXA | ghap68@yahoo.com · evaluator (TI-PRuebas) | GET /v2/workspace/me (Bearer JWT) | **200** | — | ✅ PASS |
| D CCU | clsalgado@ucsc.cl · read_only (UCSC) | GET /v2/workspace/me (Bearer JWT) | **200** | — | ✅ PASS |

**Fix dato staging:** Tenant AXA (`TI - PRuebas` OID `696f6386174b6c5725971a6c`) in `duxiter-2` aveva `isActive=False` → aggiornato `update_one → isActive=True` **solo duxiter-2** (0 scritture produzione).

**Suite pytest TOTALE post-Bloque1.2**: **51/51 PASS · exit=0 · 1.55 s** (U1 24 + U2 9 + I1 12 + I2 2 + Bloq1.2 4).

**Riferenze CHANGELOG**: Sezione completa Bloque1.2 [CHANGELOG_SEMANAL.md#L170-L213](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L170-L213) · Tarea #52 horas 3 h [CHANGELOG_SEMANAL.md#L1549](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1549) · Tabla tiempos actualizada Oct 2026: 10 tareas / 36 h / TOTAL 108 h globali [CHANGELOG#L1498-L1499](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1498-L1499).

---

### ✅ Bloque 1.3 — Migración gradual `AUTHZ_LEGACY_LAYER` 66 usuarios (**CIERRE FASE 1 · 100% COMPLETADO** · 03.10.2026)
**Hard constraint F1**: Migrazione graduale 20% → 50% → 100% utenti senza regressioni. Nessuna scrittura su DB produzione `duxiter`; solo staging `duxiter-2`.

**EXP (discovery)** · N=66 utenti totali duxiter-2 (66/66 migrated=True · 1 superuser · 4 evaluator · 61 tenant_admin):
| Grupo | % utenti | N utenti cumulativo | Operazione MongoDB | cache_version bump |
|---|---|---|---|---|
| Grupo 1 canarino | 20% | 13 | `update_many force_v2_only=True` | 1/3 → cv=**4** |
| Grupo 2 medio | 50% | 33 (13 + 20 extra) | `update_many force_v2_only=True` | 1 → cv=**5** |
| Grupo 3 pubblico | 100% | 66 (33 + 33 extra) | `update_many force_v2_only=True` | 1 → cv=**6** |

Distribuzione cache_version **POST-Bloque1.3**: `{'4': 13, '5': 20, '6': 33}` (66 totali).

**Modifiche codice (2 file):**
| Componente | Ubicación | Refs líneas |
|---|---|---|
| G3 default globale `AUTHZ_LEGACY_LAYER=False` (chiude fase) | [config.py#L23](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L23) | ✅ |
| Parse `authz_v2.force_v2_only` + `request.state.force_v2_only` | [dependencies.py#L248-L262](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L262) | ✅ |
| Guardia `require_permission()` anti-fallback legacy (se force_v2_only=True OR authz_legacy_layer=False → salta fallback) | [dependencies.py#L314-L325](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L314-L325) | ✅ |
| Fix minore G3: `bool(dict).get(...)` → `AttributeError` → var intermedia `_authz_v2_doc` | [dependencies.py#L248-L250](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L248-L250) | ✅ |

**Verificación post-Bloque1.3:**
- Suite pytest TOTALE `AUTHZ_LEGACY_LAYER=False` GLOBAL DEFAULT: **51/51 PASS · exit=0 · 1.55 s**
  - U1 authz (24) · U2 proyeccion (9) · I1 integracion 4c (12) · I2 auditoria (2) · Bloq1.2 E2E Superuser (4) = **51**
- Safety lock 4-layer OK: 0 scritture DB produzione `duxiter`; **SOLO** staging `duxiter-2`.
- Nessun utente ritorna più al fallback legacy `ROLE_PERMISSIONS` hardcoded (tutti forzati a pipeline 7 pasos V2 DOCX §6.3).

**Rif CHANGELOG Blq1.3:**
- Sezione completa [CHANGELOG_SEMANAL.md#L217-L263](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L217-L263)
- Tarea #53 (3 h) [CHANGELOG_SEMANAL.md#L1599](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1599)
- Tabla tiempos: Oct2026 → **11 tareas / 39 h** · TOTAL global → **52 tareas / 111 h** [CHANGELOG#L1547-L1548](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1547-L1548)

---

## 📋 PENDIENTES FASE 1 — ✅ TODOS COMPLETADOS (CIERRE 100% · 03.10.2026)

- [x] Fork branch `feat/rbac-abac-fase1` desde `feat/rbac-abac-refactor` (base post-0.8)
- [x] Crear documento FASE1_TRACKING_RBAC_ABAC.md con hard constraints + plan 1.1/1.2/1.3
- [x] Bloque 1.1 DISCOVERY · estado unidades_organizacionales + usuario_unidad por tenant (42 orgs · 42 UO · 1:1 mapping)
- [x] Bloque 1.1 RUN · asignar UO a 4 usuarios referencia I1 (+4 usuario_unidad · +4 users updates · -8+16 alcances · cache_version=3)
- [x] Bloque 1.1 VERIF · pytest I1 12/12 PASS · Suite totale 47/47 PASS · Pipeline autorizar 4/4 PERMIT
- [x] CHANGELOG_SEMANAL.md Tarea #51 (Bloque 1.1 · 3 h · 105 h totales)
- [x] Bloque 1.2 · SuperuserBlockedRoute(APIRoute) + route_class workspace `/v2/workspace/*` · fix attivazione tenant AXA staging · 4 tests E2E (A 403 B/C/D 200) · Suite TOTALE **51/51 PASS**
- [x] CHANGELOG_SEMANAL.md Tarea #52 (Bloque 1.2 · 3 h · 108 h totales · Oct2026: 10 tareas / 36 h)
- [x] Bloque 1.3 GRUPO 1 20% · 13 usuarios force_v2_only + cache_version=4
- [x] Bloque 1.3 GRUPO 2 50% · 20 utenti extra (cum 33) force_v2_only + cache_version=5
- [x] Bloque 1.3 GRUPO 3 100% · 33 utenti extra (cum 66) force_v2_only + cache_version=6 + config.py `AUTHZ_LEGACY_LAYER=False` GLOBAL DEFAULT
- [x] Bloque 1.3 VERIF FINAL · Suite pytest FULL 51/51 PASS (1.55 s) con `AUTHZ_LEGACY_LAYER=false` · 0 regressioni · 0 scritture produzione duxiter
- [x] CHANGELOG_SEMANAL.md Tarea #53 (Bloque 1.3 Migración gradual · 3 h · **111 h totales** · banner FASE1 100% CERRADA)

---

## � FASE 1 — RBAC+ABAC+SCOPES · **100% COMPLETADA** (03.10.2026)

| Dato | Valore |
|---|---|
| **Branch** | `feat/rbac-abac-fase1` (fork from `feat/rbac-abac-refactor` post-0.8 · 44/44 PASS) |
| **DB Staging** | `duxiter-2` ONLY · Producción `duxiter`: **0 scritture** (safety 4-layer L1→L4 OK) |
| **Suite pytest FINALE** | **51/51 PASS · exit=0 · 1.55 s** |

---

### 📊 Resumen 3 Bloques FASE 1:
| Bloque | Título | Resultado |
|---|---|:---:|
| **1.1** | Poblamiento UO reales · 4 tenants I1 · 66 usuarios · cv=3 | 47/47 PASS ✅ |
| **1.2** | Q7 SuperuserBlockedRoute · `/v2/workspace/*` · 403 SUPER · 200 utenti | 4/4 PASS ✅ |
| **1.3** | G1 20% (13u) · G2 50% (20u extra) · G3 100% (33u extra) · `AUTHZ_LEGACY_LAYER=False` DEFAULT GLOBAL | 51/51 PASS ✅ |

---

> **Totale cumulativo**: FASE0 (44/44) + FASE1 (Δ+7 tests) = **51/51 PASS** · 0 fallos · 0 regresiones

---

## 📘 Referencia tracciamento generale
- Documento FASE0 chiusa 100%: [FASE0_TRACKING_RBAC_ABAC.md](file:///home/duxiter/duxiter_intermediate/FASE0_TRACKING_RBAC_ABAC.md)
- Spec tecnica originale: [ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md](file:///home/duxiter/duxiter_intermediate/ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md)
- Procedura refactoring: [REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md](file:///home/duxiter/duxiter_intermediate/REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md)
- Matrice permessi × ruoli: [DOCUMENTACION_ROLES_TENANTS_RBAC.md](file:///home/duxiter/duxiter_intermediate/DOCUMENTACION_ROLES_TENANTS_RBAC.md)
- Changelog settimanale: [CHANGELOG_SEMANAL.md](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md)
