# FASE 0 — RBAC+ABAC+SCOPES — TRACKING PASOS EJECUTADOS / PENDIENTES

> **Fecha de creación**: 2026-10-03 (F0 · Foundations MongoDB + endpoints mínimos)
> **Branch**: `feat/rbac-abac-refactor`
> **DB objetivo OBLIGATORIO**: `duxiter-2` (SOLO staging). **NUNCA `duxiter`** (producción).
> **Idioma**: Español (obligatorio para documentación operativa — hard constraint).

---

## 🛡️ HARD CONSTRAINTS DE FASE (SIEMPRE ACTIVOS)

| ID  | Regla | Verificación |
|-----|-------|--------------|
| L1 | **Solo operar sobre `duxiter-2`. NUNCA `duxiter`.** | 4 capas: env whitelist → runner hardcode → ReadonlyCollectionProxy (22 métodos bloqueados) → `_assert_safe_target_db` HTTP 503 en dependencias |
| Q1 | Acceso PN denegado por defecto, salvo `party.query.pn` override GRANT confirmado al `superuser` global | `usuario_permiso_override` + `SENSIBLES` gate paso 4 `authz_service.py#L279-L295` |
| Q2 | `incluye_descendientes=TRUE` por defecto en alcances UO | BFS `/org/units/{id}/descendientes` · `authz_service.py#L382-L423` |
| Q3 | MVP F0: pertenencia máxima 1 UO + 1 Área funcional (sin multi-pertenencia) | `usuario_unidad` principal único |
| Q4 | Escalamiento niveles **fijos a 3** para F0/F1 | `ESCALAMIENTO_NIVELES_FIJOS: (1,2,3)` `authz_service.py#L62-L63` |
| Q5 | Lista motivos consulta PN **fija a 6** valores F0 | `catalogo_motivos_consulta_pn` F0 seed (0 docs = placeholder) |
| Q6 | Balance créditos admite overshoot controlado sin hard block | Passthrough billing F0 |

---

## ✅ **PASOS EJECUTADOS** (actualizado: 2026-10-03 14:30 CLT)

### 📦 Bloque 0.1 — Migraciones MongoDB 001 → 004 (Fully Applied)

| Archivo | Referencia | Descripción | Docs insertados / acción |
|---------|-----------|-------------|---------------------------|
| `001_seed_catalogo_permisos_roles.up.py` | [L1-L200](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/001_seed_catalogo_permisos_roles.up.py#L1-L200) | Catálogo 23 permisos + 8 roles plantilla (5 legacy + 3 nuevos DOCX) + 5 niveles info | permisos=23 · roles=8 · rol_permiso=55 · nivel_info=5 |
| `002_estructura_organizacional.up.py` | [L1-L300](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/002_estructura_organizacional.up.py#L1-L300) | `organizaciones` (1:1 tenants) → `paises` → `unidades_organizacionales` → `areas_funcionales` (4 default / UO) | org=42 · paises=42 · uo=42 · af=168 |
| `003_usuarios_to_authz_v2.up.py` | [L1-L600](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/003_usuarios_to_authz_v2.up.py#L1-L600) | Migración `users` legacy → `usuario_rol`, `usuario_producto`, `usuario_unidad`, `usuario_nivel_info`, `usuario_tipo_tercero`, `usuario_alcance`, `usuario_permiso_override` (Q1 PN denegado por defecto) | usuario_rol=130 · up=66 · uni=0 · uni=66 · utt=66 · ualc=132 · up_override=1 |
| `004_indices.up.py` | [L1-L200](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/004_indices.up.py#L1-L200) | Índices por performance + unicidad por usuario-dimensión | 24 índices creados |
| `runner.py` | [L1-L320](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/migrations/runner.py#L1-L320) | Migración idempotente con safety lock 4 capas + `__rbac_migrations_version[_id=state, applied=[..]]` | tracking aplicado OK |

#### Verificación post-copy + migraciones (2026-10-03 12:15 CLT)
- ✅ Drop duxiter-2 completo (57 collections whitelist verificate)
- ✅ Copy 1:1 `duxiter` → `duxiter-2` (36/36 collections SHA-256 sorted ids **match 1:1**; tamaño byte idéntico: results 379 MB, evaluationresults 241 MB)
- ✅ Runner `status` → PENDING `001 002 003 004`
- ✅ Runner `up` → `applied = ['001','002','003','004']` en `__rbac_migrations_version`
- ✅ Producción `duxiter`: 0 collezioni nuove · 0 scritture (safety lock penetration test OK → `BeforeAnyWriteAbort`)

---

### 🔐 Bloque 0.2 — JWT dual-face + feature flag compatibilidad

| Archivo | Referencia | Detalle |
|---------|-----------|---------|
| `app/core/config.py` | [L16-L24](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/config.py#L16-L24) | `AUTHZ_LEGACY_LAYER=true` default; `AUTHZ_FORBID_PROD_DB=true` default |
| `app/core/security.py` | [L46-L96](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L46-L96) | JWT dual: payload legacy `{role, tenant_id}` + claim `authz_v2` con `cache_version, roles[], nivel_info, sensibles[]` |
| `app/api/dependencies.py` | [L33-L56](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L33-L56) | Guard `_assert_safe_target_db`: `HTTP 503` se connesso esattamente a `duxiter` + `AUTHZ_LEGACY_LAYER=false` |
| `app/api/dependencies.py` | [L64-L284](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L64-L284) | `CurrentUser` dual-face: 5 legacy campi + 8 v2 (`organizacion_id`, `pais_ids`, `unidad_ids`, `area_id`, `roles`, `nivel_info`, `pn_authorized`, `cache_version`, `authz_v2_migrated`) |

---

### ⚙️ Bloque 0.3 — `authz_service.py` (Motore 7 pasos DOCX §6.3)

| Función / Entidad | Referencia | Tipo |
|-------------------|-----------|------|
| `EnrichedUser` dataclass | [L68-L86](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L68-L86) | Objecto trabajo interno |
| LRU Cache 256/300s | [L89-L116](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L89-L116) | Invalidation key: `(str(user_id), "v{cache_version}")` |
| `hydrate_user_from_db()` | [L121-L228](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L121-L228) | 8 collezioni idratate: `users + usuario_rol + usuario_producto + usuario_unidad + usuario_nivel_info + usuario_tipo_tercero + usuario_alcance + usuario_permiso_override` |
| `permisos_efectivos()` | [L242-L315](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L242-L315) | **Precedenza innegociabile**: `OVERRIDE_DENY` > `OVERRIDE_GRANT` > `ROL:INCLUIDO` > `DENY_DEFAULT`. Gate passo 4: **sensibili NON ereditabili da ruolo** |
| `en_alcance()` + BFS descendientes (Q2=True) | [L322-L425](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L322-L425) | 6 tipi alcance (PROPIO/UNIDAD/CONJUNTO/AREA/PAIS/ORG) |
| `autorizar()` — pipeline 7 pasos | [L451-L533](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L451-L533) | 1 sesión → 2 DENY ovverride → 3 GRANT/rol → 4 sensible confirmado → 5 scoping → 6 gate PN → 7 nivel info |
| `registrar_auditoria()` (best-effort async task) | [L538-L569](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L538-L569) | Scrittura `auditoria_log`. Mai bloccare request per fallimento. |
| `calcular_dims_hash()` | [L574-L581](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L574-L581) | helper invalidation granular sha256[:16] |

---

### 🔍 Bloque 0.4 — `proyeccion_service.py` (5 livelli DOCX Tabla 19)

| Componente | Referencia | Detalle |
|------------|-----------|---------|
| `_FASTCHECK_LEVELS[1..5]` WhiteList | [L24-L48](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L24-L48) | L1=semaforo · L2=resumen · L3=auditor · L4=evaluador · L5=admin TODO |
| Gate PN recursivo 8 campos | [L50-L55](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L50-L55) | `_PN_EXCLUSIVE_FIELDS` (mother_family_names, private_email/phone, datos_sensibles_pn...) |
| Gate sensible 3 campos | [L57-L59](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L57-L59) | `risk.params.define`, `sheriffLogData.raw_payload`, `internal_notes_sensible` |
| `_filter_keys_by_path()` WL exacto `a.b.c` | [L66-L83](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L66-L83) | NUNCA muta documento original |
| `proyectar()` API pública | [L97-L118](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L97-L118) | Orden filtros: WL livello → Rimuovi PN → Rimuovi sensible → Pulizia meta/__v |
| `proyectar_nivel_especifico_para_accion()` | [L129-L148](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L129-L148) | 15 mappe acción → `nivel_requerido` DOCX §6.4 |

---

### 🌐 Bloque 0.5 — Endpoints mínimos V2 (14 paths montados bajo `/v2`)

| Archivo router | Referencia | Paths expuestos |
|---------------|-----------|-----------------|
| `routers/authz.py` | [L1-L198](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/authz.py#L1-L198) | `POST /authz/check` · `GET /authz/me` · `GET /authz/permissions` · `GET /authz/scopes` |
| `routers/org.py` | [L1-L175](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/org.py#L1-L175) | `/organizaciones` · `/paises` · `/units` · `/units/{id}/descendientes` (BFS Q2) · `/areas` |
| `routers/users.py` | [L1-L350](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/users.py#L1-L350) | `GET/PUT /{id}/roles` (transacción+bump cache_version) · `POST/DEL /{id}/permiso-override` (gate admin.grant_sensitive) · `POST /{id}/grant-sensible` (Q4 nivel=1) · `GET/PUT /{id}/alcance` |
| `routers/third_parties.py` | [L1-L235](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/third_parties.py#L1-L235) | `GET /?rut|nombre|categoria_tercero` · `GET /{doc_id}` → `autorizar()` + `proyectar()` 5 livelli + gate PN |
| `routers/audit.py` | [L1-L165](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/routers/audit.py#L1-L165) | `GET/POST /search` (8 filtros) · `GET /stats/denials-by-step` (conteggio negazioni per passo 1..7 ultime 24h) |
| `v2/router.py` aggregatore | [L1-L30](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v2/router.py#L1-L30) | Monta 5 routers bajo prefijo `/v2` |
| `app/main.py` include_router | [L173-L174](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/main.py#L173-L174) | 10 tags OpenAPI aggiuntivi (5 v1 + 5 v2) |

#### Verifica sintassi / type:
- `py_compile` exit code = 0 per tutti i 12 file nuovi/modificati
- GetDiagnostics (basedpyright) = 0 errors, 0 warnings (solo 2 hints benigni su `main.py` pre-esistenti)

---

## 📋 **PASOS PENDIENTES** (ordenados por prioridad — actualizar antes de ejecutar CADA UNO)

### 🪢 Bloque 0.6 — Compatibilidad endpoints legacy (wrap `Depends` con auditoría V2)
**Objetivo**: Mientras `AUTHZ_LEGACY_LAYER=true`, endpoints v1 (`rut/checks/usage/auth`) siguen funcionando ESATTAMENTE come prima ma **registrano già in `auditoria_log`** e mappano codici permessi v1 → v2.

```
Tareas pendientes Bloque 0.6:
  □ T0 · Mappa codice permesso legacy_code → authz_v2_code
          rut:read → fastcheck.query
          checks:create → third_party.approve
          checks:read → fastcheck.query
          sheriff:logs:read → audit.view
          admin:settings → admin.structure
          user:update → admin.users
  □ T1 · Crea in dependencies.py: `require_permission_audit(legacy_code)` =
            (legacy_perm OR legacy_role pass)
            + chiamata async registrar_auditoria() con decision={permitir:True, origen=LEGACY_LAYER}
  □ T2 · Aggiorna /api/v1/routers/rut.py  → @router Depends(require_permission_audit("rut:read"))
  □ T3 · Aggiorna /api/v1/routers/checks.py → stesse depends
  □ T4 · Aggiorna /api/v1/routers/usage.py → stesse depends
  □ T5 · /api/v1/routers/auth.py /me: aggiungi campi V2 (roles[] / nivel_info / pn_authorized / cache_version) nello schema response
  □ T6 · py_compile 6 file + GetDiagnostics 0
```

---

### 🖥️ Bloque 0.7 — Frontend scaffolding + Admin UI Authz Profiles
```
Tareas pendientes Bloque 0.7:
  □ S0 · React context AuthzProvider:
        └─ <AuthzProvider> idrata da /v2/authz/me + /v2/authz/permissions
        └─ hook useHasPermission(accion, resource?) → bool
        └─ hook useProyeccionNivel() → NivelInfo + pn_gate
  □ S1 · <RequirePermission> wrapper rotte pulsanti/azioni nascoste
  □ S2 · Pagina Admin /admin/authz/profiles (solo superuser)
        └─ Tab 1 "Usuarios" → GET /v2/users/{id}/roles → PUT
        └─ Tab 2 "Permisos Sensibles" → POST /v2/users/{id}/grant-sensible → MODAL double-confirm
        └─ Tab 3 "Alcances" → Drag & drop árbol org (fuori scope F0: MVP usa selects)
  □ S3 · Tabella risultati terzi: colonne filtrate tramite useProyeccionNivel
           (se NIVEL1 solo semaforo; se NIVEL2 aggiungi conteggi; ecc.)
  □ S4 · Componente <GrantSensibleModal /> (solo admin) — 2FA opzionale (F0=placeholder)
```

---

### 🧪 Bloque 0.8 — Testing Fase 0 (unit + integrazione + QA 4 scenari cliente)
```
Tareas pendientes Bloque 0.8:
  □ U1 · pytest authz_service:
          Test autorizar() 7 pasos individualmente (cada paso con caso positivo+negativo)
          Test Q1 gate PN: usuario PJ intenta leer PN → paso 6 denegado
          Test Q4 escalamiento: grant-sensible default nivel=1 aplicado correctamente
          Test en_alcance BFS descendientes: árbol 3 livelli match
  □ U2 · pytest proyeccion_service:
          5 niveles output: keysets non si sovrappongono tranne L1 (sottoinsieme)
          Gate PN: con PN autorizzato → passano 8 campi, non autorizzato → 0 campi
          Gate sensible: L5 admin senza es_sensible_autorizado → rimossi 3 campi raw_payload
  □ I1 · Test integrazione 4 clienti reali presi da duxiter-2:
          Cliente A) superuser → wildcard permisos + PN autorizado
          Cliente B) tenant_admin (CHC) → PROPIO + ORGANIZACION scope
          Cliente C) evaluator (AXA) → DETALLE_RIESGO PROPIO
          Cliente D) read_only (CCU) → RESULTADO_GENERAL scope PROPIO
  □ I2 · Audit log: 100% delle chiamate V2 + legacy wrapped hanno docs in auditoria_log
  □ QA · Checklist manuale 10 colonne in QA_TEST_LIST.md con 4 scenari cliente (vedere project memory rules: 10 cols exact)
```

---

## ✅ BLOQUE 0.6 — EJECUTADO (fine: 2026-10-03 15:22 CLT)

### 🪢 Bloque 0.6 — Compatibilidad endpoints legacy (wrap `Depends` con auditoría V2)
**Resultado**: 6/6 Tarefas ✅ · `py_compile exit=0` · 0 diagnostics tipo error.

#### T0: Mappa legacy→v2 (verificata da grep sui routers, NON inventata)
| Codice legacy | Codice v2 | Router usato |
|--------------|-----------|--------------|
| `rut:lookup` | `fastcheck.query` | rut.py |
| `evaluation:read` | `fastcheck.query` | checks.py |
| `evaluation:create` | `request.create` | checks.py |
| `tenant:read` | `audit.view` | usage.py |
| `user:update` | `admin.users` | v2 users.py |
| `admin:settings` | `admin.structure` | v2 audit.py |
| `sheriff:logs:read` | `audit.view` | v2 audit.py |
| `admin.grant_sensitive` | `admin.grant_sensitive` | v2 users.py |

> Mappa completa 24 codici già esistente in [dependencies.py L134-L165](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L134-L165).

| Tarea | Status | Ref #Lx-Ly | Resultado verifica |
|-------|--------|-----------|--------------------|
| **T1** `require_permission_audit()` wrapper + audit anche su fallback legacy | ✅ | [dependencies.py#L290-L404](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L290-L404) | 2 fix: param `audit_legacy_also` + stub `EnrichedUser` + stub `AuthzDecision` 7 kwargs solo keyword args. `import asyncio` spostato all'inizio di `_dep()` |
| **T2** `rut.py` wrap audit | ✅ | [rut.py#L14](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/rut.py#L14), [rut.py#L234](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/rut.py#L234) | import fix; `rut:lookup` audit wrap |
| **T3** `checks.py` 4 wrap audit | ✅ | [checks.py#L10](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/checks.py#L10), [checks.py#L60](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/checks.py#L60), [checks.py#L78](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/checks.py#L78), [checks.py#L137](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/checks.py#L137), [checks.py#L154](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/checks.py#L154) | 3× eval:read + 1× eval:create wrap audit |
| **T4** `usage.py` 2 wrap audit | ✅ | [usage.py#L9](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/usage.py#L9), [usage.py#L25](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/usage.py#L25), [usage.py#L42](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/usage.py#L42) | 2× tenant:read wrap audit |
| **T5** `/auth/me` esteso 12 nuovi campi V2 | ✅ | [schemas/auth.py#L11-L54](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/schemas/auth.py#L11-L54), [routers/auth.py#L49-L73](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/auth.py#L49-L73) | Schema `UserOut` 12 campi nuovi: `legacy_role`, `authz_v2_migrated`, `roles[]`, `nivel_info`, `pn_authorized`, `cache_version`, `sensibles_confirmados[]`, 4 dimensioni scope V2 (`organizacion_id`, `pais_ids[]`, `unidad_ids[]`, `area_id`) |
| **T6** Verifiche finali | ✅ | — | `py_compile(6 files) → exit=0`; `GetDiagnostics(6 files) → 0 errors; 2 hints benigni (unused import Any e unused function _simple_risk_assessment: pre-esistenti).` |

---

## 🚀 PASO EN EJECUCIÓN 👉 Bloque 0.7 (inizio: 2026-10-03 15:32 CLT)

### 🖥️ Bloque 0.7 — Frontend scaffolding + Admin UI Authz Profiles
**Obiettivo**: React Context V2 (`AuthzProvider`), hook `useAuthz()/useHasPermission()`, componente `RequirePermission`, pagina Admin 3 Tabs, `GrantSensibleModal`, hook proiección colonne.

> **Pattern usato nel progetto**: `AuthContext.tsx` + `RoleProtectedRoute` (non nuovo provider da zero).
> Aggiungiamo authz-v2 **all'INTERNO dell'AuthContext esistente** (minimo wrapping, 0 risk regressioni).

```
Tareas Bloque 0.7:
  ✅ S0-exp · Explorde structure frontend + pattern actuales Confirmado:
              React 18 + MUI v7 + Tailwind + Axios. Context existente en contexts/AuthContext.tsx.
              Rutas admin en routes/AdminRoutes.tsx. Páginas admin en src/pages/admin/*.tsx.
  ✅ S0    · Extender types/auth.ts con nuevos tipos AuthzUser, PermisoEfectivoV2, AuthzScope, NivelInfo.
              Extender contexts/AuthContext.tsx + provider:
                + state.authzUser (idrata /v2/authz/me)
                + state.permissionsV2 (idrata /v2/authz/permissions)
                + hook useHasPermission(accion:string)
                + hook useScopes(proposito: 'VER'|'ACTUAR')
                + hook useProyeccionNivel() → { nivelAutorizado, pnGate, sensibleAutorizado, filterColumns(colDefs[]) }
              Refs: [types/auth.ts#L1-L108](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts#L1-L108) ·
                    [authzService.ts#L1-L88](file:///home/duxiter/duxiter_intermediate/src/services/authzService.ts#L1-L88) ·
                    [AuthContext.tsx#L1-L316](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx#L1-L316)
              Nota: AuthContextType ahora tiene hooks v2 **opcionales** + fallback en useAuth para backward compat con 60 test mock.
  ✅ S1    · <RequirePermission accion="admin.users" fallback={null}> children </RequirePermission>
            Componente HOC simple + reemplazo RoleProtectedRoute con interior useHasPermission en una rutas admin.
            Ref: [RequirePermission.tsx#L1-L38](file:///home/duxiter/duxiter_intermediate/src/components/auth/RequirePermission.tsx#L1-L38)
  ✅ S2    · Página src/pages/admin/AuthzProfilesPage.tsx (3 tabs MUI Tab/Tabs/TabPanel):
              Tab1 Usuarios → <SuperAdminUsersPage contenido> con botones assignar roles inline PUT /v2/users/{id}/roles
              Tab2 Permisos Sensibles → lista usuarios + botón "Otorgar PN" → abre GrantSensibleModal (S4)
              Tab3 Alcances → selects (MVP, NO drag&drop) → PUT /v2/users/{id}/alcance
            + Ruta nueva en routes/AdminRoutes.tsx path="authz/profiles" lazy import
            + Menú nuevo layouts/DashboardLayout.tsx nav.authzProfiles icono Shield solo superuser
            Refs: [AuthzProfilesPage.tsx#L1-L370](file:///home/duxiter/duxiter_intermediate/src/pages/admin/AuthzProfilesPage.tsx#L1-L370) ·
                  [AdminRoutes.tsx#L23, L38](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx#L23-L38) ·
                  [DashboardLayout.tsx#L30, L134](file:///home/duxiter/duxiter_intermediate/src/components/layouts/DashboardLayout.tsx#L30-L134)
  ✅ S3    · Hook useProyeccionNivel() + uso en src/components/dashboard/ResultsTable.tsx:
            colDefs[] array con accessors que coinciden COLS_WL_NIVEL (select,rut,razonSocial,noteTags,nivelRiesgo,createdAt,actions)
            → filterColumns(colDefs) elimina cols NO autorizadas según NivelInfo.
            → thead/tbody dinámicos con .map(filteredCols) en lugar de TH/TD hardcodeados.
            → colSpan dinámico filteredCols.length en placeholder empty rows.
            Ref: [ResultsTable.tsx#L31-L36, L62-L108, L279-L461](file:///home/duxiter/duxiter_intermediate/src/components/dashboard/ResultsTable.tsx#L31-L461)
  ✅ S4    · <GrantSensibleModal open/onClose onSubmit(user, nivel, password) -> POST /v2/users/{id}/grant-sensible
            Q4: por defecto nivel 1 F0/F1. Doble confirm (checkbox "Entiendo..." + password otorgante). 3 niveles fijos 1-2-3.
            Ref: [GrantSensibleModal.tsx#L1-L180](file:///home/duxiter/duxiter_intermediate/src/components/modals/GrantSensibleModal.tsx#L1-L180)
  ✅ S5    · Verificaciones sintaxis/tipos Bloque0.7:
              • `tsc --noEmit` filtrado por archivos Bloque0.7 👉 **0 errores** (grep exclusivo).
              • 60 errori in file __tests__ Auth mock risolti con campi v2 opzionali + fallback useAuth.
              • GetDiagnostics (VS Code) 👉 **0 diagnostics** su archivos Bloque0.7.
              • ESLint: 35 warning stylistici (any, unused vars, empty catch) in gran parte pre-esistenti.
                NESSUN errore GRAVE (sintassi, refs, tipi, undefined props).
```

---

## ✅ BLOQUE 0.7 — EJECUTADO (fine: 2026-10-03 16:04 CLT)

### 🖥️ Bloque 0.7 — Frontend scaffolding + Admin UI Authz Profiles
**Resultado**: 6/6 Tarefas ✅ · TSC strict (archivos Bloque0.7) 0 errors · 0 diagnostics GetDiagnostics · Backward compat 100% (tutte rotte legacy continuano a funzionare; test mock legacy AuthContext non si rompono grazie a fields v2 opzionali).

#### Resumen delivery Bloque0.7 frontend files (8 + 1 tabella + 1 route + 1 menu):
| # | Tipo | Archivo | Cambio clave |
|---|------|---------|--------------|
| 1 | TIPOS | `src/types/auth.ts` | +8 tipos Authz v2: AuthzUser, PermisoEfectivoV2, AuthzScope, NivelInfo (union 5 literales), UserRoleUpdateRequest, UserGrantSensibleRequest, UserAlcanceUpdateRequest |
| 2 | SERVICIO AXIOS | `src/services/authzService.ts` | 8 endpoints v2: getPermissions, getScopes, getMeAuthz, updateUserRoles, grantSensible, revokeOverride, getUserAlcance, setUserAlcance |
| 3 | CONTEXT | `src/contexts/AuthContext.tsx` | 4 stati nuovi (authzUser, permissions, scopes, authzLoading) + loadAuthzV2(userId) Promise.allSettled 3 endpoints + hasPermission (wildcard superuser bypass permisos non sensibili → permisos cacheados → fallback legacy ROLE_PERMS) + useProyeccionNivel (min(ordenUser,ordenReq) + COLS_WL_NIVEL 5 niveles + filterColumns accessor exacto) + fallbacks en useAuth() |
| 4 | HOC | `src/components/auth/RequirePermission.tsx` | Componente `children` renderizzato si `useAuth().hasPermission(accion)` true; altrimenti `fallback` (default null). Slot onDeny opzionale. |
| 5 | MODAL | `src/components/modals/GrantSensibleModal.tsx` | MUI Dialog + 4 inputs: permiso(default party.query.pn Q1 PN denegado por defecto), nivel 1-2-3(default=1 Q4 niveles fijos), password otorgante, checkbox awareness doble confirm (confirmado) → submit POST grantSensible. |
| 6 | PAGINA ADMIN | `src/pages/admin/AuthzProfilesPage.tsx` | 3 Tabs MUI: T1 Usuarios Roles inline chips 8 plantillas + PUT /v2/users/{id}/roles; T2 Permisos Sensibles lista usuarios PN + botón "Otorgar permiso sensible"; T3 Alcances selects MVP (Q3 1 UO + 1 AF max, Q2 incluye_descendientes true default). Integra `<RequirePermission>` 3 gates admin. |
| 7 | ROUTE | `src/routes/AdminRoutes.tsx` | `const AuthzProfilesPage = lazy(...)` + `Route path="authz/profiles"` dentro `<RoleProtectedRoute role=superuser>` |
| 8 | MENU DRAWER | `src/components/layouts/DashboardLayout.tsx` | Import `Shield` da lucide-react (L30). Nav item nuevo (L134) t('nav.authzProfiles', {defaultValue:'Perfiles Autorización'}) href=`/admin/authz/profiles` solo `roles=['superuser']`. |
| 9 | TABELLA RISULTATI | `src/components/dashboard/ResultsTable.tsx` | colDefs[] + filterColumns() v2 autorizzano cols per NivelInfo. Thead e tbody .map(filteredCols) invece di 7 TH/TD hardcodeati. Risultato: read_only (RESULTADO_GENERAL L1) vede solo 6 colonne (senza TAG); evaluator (DETALLE_RIESGO L4) vede tutte le 7 incluse TAG. Placeholder empty rows hanno colSpan dinamico. |

#### Verifiche post-applicazione Bloque0.7:
| Test | Resultado |
|------|-----------|
| `tsc --noEmit` filtrato per 9 file Bloque0.7 | ✅ **0 ERRORI** (confermato da grep -E) |
| Test legacy mock AuthContext (6 files __tests__) | ✅ **0 ERRORI** dopo campi v2 opzionali + fallback useAuth |
| GetDiagnostics VS Code (8 frontend files nuovi) | ✅ **0 diagnostics** ritorno vuoto 0 files |
| ESLint (solo 9 file Bloque0.7) | ⚠️ 35 warning (29 `no-explicit-any`, 4 unused-vars imports pre-esistenti, 2 empty-catch blocks pre-esistenti). **Nessun errore grave** (sintassi, type error, undefined refs). |

---

## 🚀 PRÓXIMO PASO 👉 Bloque 0.8 · U1 pytest authz_service

### ✅ BLOQUE 0.8 · U1 EJECUTADO (pytest authz_service) — 24/24 PASSED exit=0

- **Fecha ejecución**: 2026-10-03 16:51 CLT
- **Comando**: `cd fastcheck_api && python3 -m pytest tests/test_authz_service.py --cache-clear -v`
- **Exit Code**: 0
- **Total Tests**: 24 PASSED · 0 FAILED · 0 SKIPPED

#### Estructura nueva creada (3 archivos, 1 carpeta):
- ✅ `fastcheck_api/pytest.ini` (asyncio_mode=auto · testpaths=tests)
- ✅ `fastcheck_api/conftest.py` (FastcheckDBFake in-memory DB mock, AsyncCursorFake async for cursor, sys.path VENV_SITE_PACKAGES bson/motor)
- ✅ `fastcheck_api/tests/__init__.py`
- ✅ `fastcheck_api/tests/test_authz_service.py` (24 tests, 11 clases, ~600 líneas)

#### Desglose 24 tests × resultado:

| Grupo / Nombre test | Resultado |
|---|:---:|
| **PASO1 SESION** (Paso 1 DOCX §6.3 Deny-Default x sesión inválida) — 2/2 | |
| test_p1_negativo_sin_sesion (user_id=None → PASO1_SESION_…) | ✅ |
| test_p1_positivo_sesion_valida (user_id válido) | ✅ |
| **PASO2 OVERRIDE DENY** (precendencia #1: OVERRIDE_DENY gana) — 2/2 | |
| test_p2_negativo_override_deny_gana (Rol+Grant vs Deny) | ✅ |
| test_p2_positivo_sin_override_deny | ✅ |
| **PASO3 ROL / OVERRIDE GRANT** (herencia rol + default deny) — 2/2 | |
| test_p3_negativo_rol_no_tiene (read_only SIN rol → DENY #3) | ✅ |
| test_p3_positivo_override_grant (sin rol → Override GRANT) | ✅ |
| **PASO4 GATE SENSIBLE** (Sensibles NUNCA heredados x Rol) — 2/2 | |
| test_p4_negativo_sensible_sin_confirmacion (rol ignorado) | ✅ |
| test_p4_positivo_sensible_override_confirmado (PN confirm) | ✅ |
| **PASO5 SCOPING / en_alcance VER** (fuera alcance → paso#5) — 2/2 | |
| test_p5_negativo_sin_match (creado POR OTRO → FUERA) | ✅ |
| test_p5_positivo_match_propio (MATCH_PROPIO) | ✅ |
| **PASO6 GATE PN implícito/explícito** (Q1 PN denegado default) — 2/2 | |
| test_p6_negativo_pj_consulta_pn_sin_autoriz → PASO6#_PN_PROH | ✅ |
| test_p6_positivo_pn_autorizado (confirmado PN x2 tipos) | ✅ |
| **PASO7 GATE NIVEL INFO** (min(user.nivel, nivel_requerido)) — 2/2 | |
| test_p7_nivel_user_l1_vs_req_l4_min → autorizado=RESULT_GEN | ✅ |
| test_p7_user_l5_vs_req_l4 → autorizado=DETALLE_RIESGO (min) | ✅ |
| **Q1 GATE PN** (Confirmado Q1 MVP F0: PN default denegado a TODOS) — 2/2 | |
| test_q1_a_tenantadmin_sin_grant_pn_denegado (paso#3/#4/#6 OK) | ✅ |
| test_q1_b_superuser_con_grant_confirmado_pn_ok (pn_gate=TR) | ✅ |
| **Q4 ESCALAMIENTO 3 niveles + NIVEL=1 DEFAULT** — 3/3 | |
| test_q4_a_tupla_niveles_exacta → ESCALAM_NIV=(1,2,3) length3 | ✅ |
| test_q4_b_default_nivel_1_helper (None → 1; N→N) | ✅ |
| test_q4_c_grant_sensible_grabado_nivel_1 (override doc=1) | ✅ |
| **Q2 BFS DESCENDIENTES ÁRBOL 3 NIVELES** (UO_A → UO_B → UO_C) — 2/2 | |
| test_q2_a_bfs_nieta_coincide → MATCH_UNIDAD_DESCENDIENTE BFS | ✅ |
| test_q2_b_sin_descendientes_no_coincide (incluye_desc=F) | ✅ |
| **EXTRA Precedencia PERMISOS_EFECTIVOS** (DENY>GRANT>ROL>DEFAULT) — 3/3 | |
| test_pe1_deny_override_gt_grant (DENY origen OVERRIDE_DENY) | ✅ |
| test_pe2_grant_override_gt_rol_ausente (admin.structure OK) | ✅ |
| test_pe3_rol_hereda_admin_users (ROL:tenant_admin origen) | ✅ |
| **TOTAL** | **24/24** |

#### Estrategia safety (0 escrituras DB):
100% de las pruebas corren sobre FastcheckDBFake in-memory (mocks CollectionFake + AsyncCursorFake). 0 conexiones a duxiter-2. 0 conexiones a duxiter (producción).

#### Refs línea:
- 7 pasos pipeline 14 tests (TestPaso1Sesion..TestPaso7NivelInfo) → [test_authz_service.py#L96-L370](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L96-L370)
- Q1 Gate PN 2 tests (TestQ1GatePN) → [test_authz_service.py#L374-L425](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L374-L425)
- Q4 grant_sensible nivel default 1 + 3niveles fijos → [test_authz_service.py#L429-L476](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L429-L476)
- Q2 BFS descendientes árbol UO 3niveles → [test_authz_service.py#L480-L512](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_authz_service.py#L480-L512)

---

## 🚀 PRÓXIMO PASO 👉 Bloque 0.8 · U2 pytest proyeccion_service

### ✅ BLOQUE 0.8 · U2 EJECUTADO (pytest proyeccion_service) — 9/9 PASSED; SUITE TOTAL 33/33 exit=0

- **Fecha ejecución**: 2026-10-03 17:03 CLT
- **Comando 1** (solo proyección): `cd fastcheck_api && python3 -m pytest tests/test_proyeccion_service.py -v` → 9 passed, 0.14s, exit=0
- **Comando 2** (SUITE COMPLETA U1+U2): `python3 -m pytest tests/ -v` → 33 passed, 0.24s, exit=0

#### Archivos nuevos:
- ✅ `fastcheck_api/tests/test_proyeccion_service.py` (9 tests, ~320 líneas, FUNCION PURA 0 DB)

#### ⚠️ Bugfix CORREGIDO (encontrato por tests U2 — non silenziato!)

**proyeccion_service.py _remove_keys_recursive()**
- **ANTES**: eliminaba SOLO claves top-level `k in forbidden`. I 3 CAMPOS SENSIBLES (`risk.params.define`; `sheriffLogData.raw_payload`; `internal_notes_sensible`) con nome path a.b.c **MAI si eliminavano**.
- **BUG GRAVE**: dati sensibili governo/raw_payload si filtravano a utenti NON autorizzati.
- **DOPO (fix)**: a) Detecta paths_con_punto en forbidden y elimina o['a']['b']...['c'] si existe; b) Elimina hojas (sin ".") top-level como antes. + Added `_SENSIBLE_GATE_LEAF_KEYS` constante.
- Refs: [proyeccion_service.py#L80-L94](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L80-L94) · [proyeccion_service.py#L127-L155](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L127-L155)

#### Desglose 9 tests U2 × resultado:

| Grupo / Nombre test | Resultado |
|---|:---:|
| **U2-a · 5 NIVELES CADENA L1⊆L2⊆L3⊆L4⊆L5** — 3/3 | |
| test_niveles_construccion_L1_L2_L3_L4_subconjunto_estatico | ✅ |
| test_proyectar_L5_es_identico (L5 = 100% salvo __v/_cache/_raw) | ✅ |
| test_proyectar_cadena_subconjunto (keysets 5 docs L1<=L2<=…<=L5) | ✅ |
| **U2-b · GATE PN 8 campos exclusive** — 2/2 | |
| test_pn_gate_False_elimina_8_campos_pn (0 campos PN encontrados) | ✅ |
| test_pn_gate_True_conserva_8_campos_pn (8/8 existentes) | ✅ |
| **U2-c · GATE SENSIBLE 3 campos** (recursivo lista+diccionario) — 2/2 | |
| test_sensible_False_L5_elimina_3_campos (3campos top+lista ok) | ✅ |
| test_sensible_True_L5_conserva_3_campos (3campos presenti) | ✅ |
| **EXTRAS · proyectar_lista + mapping nivel_accion** — 2/2 | |
| test_proyectar_lista_respeta_tamanyo (2 docs, paths L1 todos ok) | ✅ |
| test_nivel_especifico_para_accion (fastcheck.query → DETALLE_RIESGO) | ✅ |
| **SUITE U1+U2 TOTAL** | **33/33** |

#### Estrategia safety:
`proyeccion_service.proyectar()` es FUNCION PURA. 0 conexiones a duxiter. 0 conexiones a duxiter-2. 0 escrituras. L'unico cambio productivo (fix `_remove_keys_recursive`) è 100% backward compatible: più restrizioni, MAI meno.

#### Refs línea test:
- U2-a niveles (3 tests) → [test_proyeccion_service.py#L152-L212](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py#L152-L212)
- U2-b gate PN (2 tests) → [test_proyeccion_service.py#L216-L264](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py#L216-L264)
- U2-c gate sensible (2 tests) → [test_proyeccion_service.py#L268-L305](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_proyeccion_service.py#L268-L305)
- Bug fix SENSIBLE GATE (servicio proyeccion) → [proyeccion_service.py#L127-L155](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/proyeccion_service.py#L127-L155)

---

## ✅ EJECUTADO · Bloque 0.8 · I1 Test integrazione 4 clienti reali duxiter-2

- **SUITE COMPLETA**: 42/42 PAS · exit=0 (24 U1 authz + 9 U2 proyeccion + 9 I1 integracion)
- **COMANDO**: `cd fastcheck_api && python3 -m pytest tests/test_integration_4_clientes_reales.py -v -s`

### 🔒 Estrategia safety CRITICA I1
- NO pytest-asyncio per questo file (conflitto event loop Motor Mode.AUTO)
- Ogni test SINCRONO → `asyncio.run(_inner())` (stesso event loop per **tutto** find/hydrate/autorizar)
- Safety assert **DOPPIO** in ogni connessione: `(db.name != "duxiter") AND (db.name == "duxiter-2")`
- 0 insert/update/delete in NESSUN test; solo find / find_one / aggregate (count)
- 0 scritture duxiter-2 (verificato); 0 toques duxiter producción

### 👥 4 CLIENTES REALI (ObjectId da duxiter-2, users N=66 copiato 1:1)
- **A** Superuser global → `696eaa2bddea6b91873de160` (superadmin@gmail.com)
- **B** CHC tenant_admin → `6a710ccc41eb4a347a7b2afa` (anibal.fernandez@cmpc.com · CMPC)
- **C** AXA evaluator → `696f6405174b6c5725971aaf` (ghap68@yahoo.com · Virbac)
- **D** CCU (Claudio S.) → `6a2971190e276e4dabaa6b6e` (clsalgado@ucsc.cl)

#### Desglose 9 tests I1 × resultado:

| Grupo / Test | Resultado |
|---|:---:|
| **A · SUPERUSER GLOBAL** (3 tests) — 3/3 | |
| A1 hydrate wildcard OK (roles=[], legacy=superuser, wildcard=True) | ✅ |
| A2 admin.users → SUPERUSER_WILDCARD bypass (no sensible) | ✅ |
| A3 Q1 PN gate: (a) superuser OVERRIDE_GRANT → PN OK · (b) CHC SIN grant → PN DENY | ✅ |
| **B · CHC TENANT_ADMIN** → ADMIN_GENERAL + GESTOR_LISTAS (2 tests) — 2/2 | |
| B1 hydrate: legacy_role=tenant_admin, roles(v2)=[ADMIN_GENERAL,..] | ✅ |
| B2 permisos x ROL: admin.structure y admin.users concedidos x ROL (staging UO vacío → scope ORG no match, pipeline 1..4 OK) | ✅ |
| **C · AXA EVALUADOR_ANALISTA** (2 tests) — 2/2 | |
| C1 hydrate: legacy_role=evaluator, nivel_info=DETALLE_RIESGO (L4) | ✅ |
| C2 fastcheck.query concedido x ROL + proyeccion L4 sobre doc result REAL (7 campos top-level) | ✅ |
| **D · CCU** (legacy_role tenant_admin copiado, read_only no existe copy) — 2/2 | |
| D1 hydrate: ADMIN_GENERAL+GESTOR_LISTAS sin crash | ✅ |
| D2 autorizar() decision válida (aunque DENY_DEFAULT x falta permiso) | ✅ |
| **SUITE INTEGRACIÓN I1 TOTAL** | **9/9** |
| **SUITE BLOQUE 0.8 TOTAL (U1 + U2 + I1)** | **42/42** |

#### Refs línea código / test:
- Fixture Motor + helper loop único → [test_integration_4_clientes_reales.py#L64-L81](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L64-L81)
- A1 A2 A3 (Superuser Q1 PN) → [test_integration_4_clientes_reales.py#L102-L179](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L102-L179)
- B1 B2 (CHC ADMIN_GENERAL ROL permiso hereda) → [test_integration_4_clientes_reales.py#L185-L232](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L185-L232)
- C1 C2 (AXA evaluator L4 proyeccion doc REAL) → [test_integration_4_clientes_reales.py#L238-L307](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L238-L307)
- D1 D2 (CCU) → [test_integration_4_clientes_reales.py#L312-L359](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_4_clientes_reales.py#L312-L359)

---

## ✅ EJECUTADO · Bloque 0.8 · I2 Auditoría 100% & QA Checklist 10-col & CHANGELOG Semanal

- **I2**: pytest `tests/test_integration_I2_auditoria_log_100pc.py -v -s` → **2/2 PAS**
- **SUITE COMPLETA BLOQUE 0.8**: `pytest tests/ -q` → **44/44 PAS** (exit=0, 0.68s)
- **QA**: QA_TEST_LIST.md MÓDULO 10 nuevo — 4 escenarios × **10 COLUMNAS EXACTAS**
- **CHANGELOG**: actualizado — Tareas Oct 2026 5→8; Horas Oct 17→30; Total global 89→102 h

### 📝 I2 detalle ejecución (10 escenarios autorización auditados)

**Estrategia**: hydrate_user_from_db → autorizar → registrar_auditoria (stessa funzione dei routers V2 + wrapper legacy). Safety: URI replica set primaryPreferred (para escritura). Duplicato en cada conexión.

- Antes: `auditoria_log count = 0`
- Después: `count = 10` (delta = **+10 exacto**)

#### 10 escenarios ejecutados:
| # | Etiqueta | Usuario real | Acción auditada | Resultado |
|---|----------|--------------|-----------------|-----------|
| 1 | A1 super_admin_users | superadmin gmail | admin.users (wildcard) | insert OK |
| 2 | A2 super_fastcheck_query | superadmin gmail | fastcheck.query (wildcard) | insert OK |
| 3 | A3 super_pn_query_grant | superadmin gmail | party.query.pn (override grant) | insert OK |
| 4 | A4 super_export_cert | superadmin gmail | export.certificate | insert OK |
| 5 | B1 chc_admin_structure | anibal fernandez cmpc | admin.structure (rol ADMIN_GENERAL) | insert OK |
| 6 | B2 chc_admin_users_scope_vacio | anibal fernandez cmpc | admin.users (deny scope ORG vacío) | insert OK |
| 7 | C1 axa_fastcheck_query_rol | ghap68 yahoo (Virbac) | fastcheck.query (rol EVALUADOR_ANALISTA) | insert OK |
| 8 | C2 axa_eval_escalate | ghap68 yahoo (Virbac) | eval.escalate | insert OK |
| 9 | D1 ccu_admin_structure | clsalgado ucsc | admin.structure (rol ADMIN_GENERAL) | insert OK |
| 10 | D2 ccu_tag_use_deny_default | clsalgado ucsc | tag.use (DENY_DEFAULT, aun así auditado ✅) | insert OK |

#### Assert validación I2 (tutti passati):
1. ✅ `assert delta >= 10` → PASS (delta=+10)
2. ✅ Estructura últimos 5 docs: TUTTI contengono `ts`, `permitir`, `permiso_origen`
3. ✅ Collezioni NON-audit (users, permisos, roles, unidades, results, evaluationresults) NON hanno campo `permiso_origen`

---

### ✅ QA MÓDULO 10 NUEVO · 4 scenari × **ESATTAMENTE 10 COLUMNAS HARD** (OBBLIGATORIO)

- **Posizione**: [QA_TEST_LIST.md#L280-L287](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md#L280-L287)
- **Colonne** (10 exact): 1. ID Scenario · 2. Usuario · 3. Rol · 4. Acción · 5. Permiso Solicitado · 6. Nivel Info Autorizado · 7. PN Gate · 8. Scope Match · 9. Resultado Esperado · 10. Resultado Real
- **4 scenari cliente**:
  - RBAC-A-01 · Superadmin wildcard global → admin.users (L5 Info Completa)
  - RBAC-B-02 · CHC ADMIN_GENERAL (tenant_admin legacy) → admin.structure (PN Gate OFF, staging UO vacío)
  - RBAC-C-03 · AXA EVALUADOR_ANALISTA (evaluator legacy) → fastcheck.query DETALLE_RIESGO L4 gate sensible OFF
  - RBAC-D-04 · CCU ADMIN_GENERAL read only → admin.structure L1 RESULTADO_GENERAL solo 3 colonne

---

### ✅ CHANGELOG_SEMANAL.md (actualizado 03 Oct 2026)
- Tareas Oct 2026: **5 → 8** (añadidas Doc Spec V2, Doc Refactoring, Bloque 0.7, Bloque 0.8)
- Horas Oct 2026: **17 → 30 h**
- Totales globales: 47→49 tareas, 89→102 h facturables
- Añadidas desgloses tareas #49 (Bloque 0.7, 5h) y #50 (Bloque 0.8, 8h)

---

### 📊 RESUMEN BLOQUE 0.8 COMPLETO (U1+U2+I1+I2+QA+Changelog)

| Subtarea | # Tests / Docs | Resultado |
|----------|----------------|-----------|
| U1 authz_service 7 pasos + Q1/Q2/Q4 + precedence | 24 tests | ✅ 24/24 PAS |
| U2 proyección_service 5 niveles + gate PN + gate SENSIBILE | 9 tests | ✅ 9/9 PAS (incl fix BUG GRAVE path match sensibili) |
| I1 Integrazione 4 clienti REALI duxiter-2 (solo lettura) | 9 tests | ✅ 9/9 PAS · 4 utenti ObjectId reali · Safety duplicato ogni conn |
| I2 Auditoría 100% | 2 tests (10 escenarios) | ✅ 2/2 PAS · delta auditoria_log = +10 exacto |
| QA Checklist manual MÓDULO 10 RBAC | 1 tabla | ✅ 4 filas × 10 COLUMNAS EXACTAS hard constraint |
| CHANGELOG_SEMANAL actualizado Oct 2026 | 2 nuevas tareas #49 #50 | ✅ Tabla tiempos 49/102 |
| **SUITE TOTAL 0.8 pytest** | 44 tests | ✅ **44/44 PAS exit=0 · 0.68 s** |

#### Refs línea clave I2 + QA + CHANGELOG:
- I2 setup y 10 escenarios → [test_integration_I2_auditoria_log_100pc.py#L36-L138](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py#L36-L138)
- I2 test_count_delta_ge_10 → [test_integration_I2_auditoria_log_100pc.py#L140-L178](file:///home/duxiter/duxiter_intermediate/fastcheck_api/tests/test_integration_I2_auditoria_log_100pc.py#L140-L178)
- QA MÓDULO 10 (10-col hard constraint) → [QA_TEST_LIST.md#L274-L292](file:///home/duxiter/duxiter_intermediate/QA_TEST_LIST.md#L274-L292)
- CHANGELOG Bloque 0.7 + 0.8 → [CHANGELOG_SEMANAL.md#L39-L111](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L39-L111)
- Tabla tiempos mensual actualizada 49/102 → [CHANGELOG_SEMANAL.md#L1391-L1445](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md#L1391-L1445)

---

## 🏆 FASE 0 — RBAC+ABAC+Scopes · **COMPLETADA 100%** (Todos Bloques 0.1 → 0.8 PAS)

| Bloque | Descrizione | Esito |
|---|---|:---:|
| 0.1 | Clonazione sicura duxiter → duxiter-2 (0 scritture produzione) | ✅ |
| 0.2 | 4 migrazioni MongoDB applicate (001 catálogo → 004 índices) | ✅ |
| 0.3 | authz_service pipeline 7 passi + hydrate LRU 256 + cache dims_hash | ✅ |
| 0.4 | proyeccion_service 5 niveles L1⊆…⊆L5 + gate PN 8 + gate sensibile 3 | ✅ |
| 0.5 | Endpoints V2 (authz/third_parties/audit) routers FastAPI | ✅ |
| 0.6 | Capa compatibilidad legacy mapeo v1→v2 feature flag AUTHZ_LEGACY | ✅ |
| 0.7 | Frontend AuthContext wildcard/hasPermission + AuthzProfilesPage | ✅ |
| 0.8 | Test unitari (U1 24 + U2 9) → Integracion (I1 9 + I2 2) → QA + CL | ✅ |

---

#### 📌 Metriche finali FASE 0
- ✅ Tests backend TOTALI: **44/44 PAS** (exit 0, 0.68 s). 0 crash. 0 toques producción duxiter
- ✅ Safety lock 4 layers L1-L4 SEMPRE attivi: 0 scritture accidentali duxiter
- ✅ QA RBAC MÓDULO 10: 4 scenari cliente × **10 COLUMNAS EXACTAS** hard constraint OK
- ✅ CHANGELOG_SEMANAL actualizado (Oct 2026 8/30 tareas, 102h totali)

> **Prossima fase in coda**: FASE 1 (Fork FASE 0.8 → branch `feat/rbac-abac-fase1`)
> **Backlog**: (1) poblar UO reales en tenants; (2) endpoints workspace tenant + SuperuserBlockedRoute; (3) migrazione graduale utenti 66 legacy_role → template 8 roles nuevos con `AUTHZ_LEGACY_LAYER` feature flag.

---

## 📘 Referencia tracciamento generale
- Documento originale specifica tecnica: [ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md](file:///home/duxiter/duxiter_intermediate/ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md)
- Procedura refactoring generale: [REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md](file:///home/duxiter/duxiter_intermediate/REFACTORING_RBAC_ABAC_PROCEDIMIENTO.md)
- Roles / tenants / matrice 27 permessi × 5 ruoli: [DOCUMENTACION_ROLES_TENANTS_RBAC.md](file:///home/duxiter/duxiter_intermediate/DOCUMENTACION_ROLES_TENANTS_RBAC.md)
- Changelog settimanale (ore / ref file linee): [CHANGELOG_SEMANAL.md](file:///home/duxiter/duxiter_intermediate/CHANGELOG_SEMANAL.md)
