# Procedimiento de Refactoring: RBAC Legacy → RBAC+ABAC+Scopes (DUXITER 2.0)
> Documento de ingeniería — **NO TOCAR CÓDIGO HASTA APROBACIÓN DE ESTE PLAN**
> Aplicación: Sistema Duxiter Intermediate (React + FastAPI/Fastcheck + MongoDB)

---

## ▶️ Decisiones arquitectónicas pre-confirmadas (input del cliente)

| # | Decisión | Impacto |
|---|----------|---------|
| **DA-01** | **Capa de compatibilidad legacy** (no reemplazo total inmediato): 5 roles actuales siguen funcionando mapeados a los 8 nuevos roles base plantilla. Corte al final Fase 1. | Evita big-bang; doble ejecución controlada |
| **DA-02** | **MongoDB extendido**: nuevas colecciones + campos en `users` / `tenants` existentes. NINGUNA tabla PostgreSQL. | Aprovecha la MongoDB existente. Requiere índices nuevos. |
| **DA-03** | **Permisos sensibles → Modal de confirmación doble intención**: checkbox *"Confirmo que otorgo permiso sensible"* + solicitud contraseña otorgante. | Cumplimiento Sección 12 RNF + DOCX Sección 3.2 |
| **DA-04** | **Superuser global (root/DUXITER) fuera del modelo por tenant**: wildcard `organizacion_id=*`, ignora scoping, bypass `ROLE_PERMISSIONS` para admin platforma, pero **NO** hereda permisos sensibles de PN o gobierno riesgo dentro de cada tenant. | Mantiene [DOCUMENTACION_ROLES_TENANTS_RBAC.md](file:///home/duxiter/duxiter_intermediate/DOCUMENTACION_ROLES_TENANTS_RBAC.md) consistente |
| **DA-05** | **Nombres archivos ES-español** | Visto y ok |

---

## 1. Gap Analysis: Modelo Actual vs. Modelo Objetivo

### 1.1 Modelo Actual (Legacy)

Fuentes:
- Tipos: [auth.ts](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts#L1-L20), [tenant.ts](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts#L1-L23)
- RBAC Backend: [dependencies.py#L86-L182](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L86-L182)
- Route Guards: [ProtectedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/ProtectedRoute.tsx), [RoleProtectedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/RoleProtectedRoute.tsx), [SuperuserBlockedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/SuperuserBlockedRoute.tsx)
- JWT: [security.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L42-L53)

| Aspecto | Modelo Actual (5 roles) | Modelo Objetivo (8 roles plantilla + ABAC) |
|---------|--------------------------|--------------------------------------------|
| Cantidad roles | `superuser, tenant_admin, evaluator, read_only, write_only` (5) | `Solicitante, Operativo, Evaluador, Aprobador, Auditor, Admin General, Gestor Listas, Gestor Riesgo` (8 plantillas; usuario puede tener **N roles**) |
| Modelo autorización | SOLO RBAC por rol único | RBAC + ABAC (atributos usuario/recurso) + **Scopes separados VER/ACTUAR** + 6 dimensiones perfil |
| Permiso efectivo | `user.role` = único fuente de verdad | `roles ∪ overrides GRANT − overrides DENY` (**DENY gana siempre**, deny-by-default) |
| Permisos sensibles | NO existen como categoría | `party.query.pn, exception.authorize, admin.grant_sensible, risk.lists.manage, risk.params.define, risk.thresholds.edit, risk.formula.edit` = **doble intención + NO heredados** |
| Multipertenencia | `User.tenants[]` (array) | `usuario_unidad` N:M + multi-UO + multi-país (D-06) |
| Tipos de tercero | NO categorizados | 4 categorias `PJ_NACIONAL / PN_NACIONAL / PJ_EXTRANJERA / PN_EXTRANJERA` |
| Personas naturales | SIN gate específico | `party.query.pn` (sensible explícito) + motivo consulta obligatorio Fase 1 |
| Nivel de información | 0 (entrega objeto completo) | **5 niveles acumulativos**: `RESULTADO_GENERAL → … → INFO_COMPLETA` con proyección antes de entregar al cliente |
| Alcance de permiso | Global dentro del tenant | `PROPIO / UNIDAD / CONJUNTO_UNIDADES / AREA / PAIS / ORGANIZACION` · **VER independiente de ACTUAR** |
| Estructura organizacional | `tenant` único · sin subniveles | `organizacion → ∞ pais → ∞ unidad_organizacional (árbol parent_id) → ∞ area_funcional` |
| Área funcional | NO existe | Existe como atributo usuario, NO otorga permisos |
| Proyección por nivel | NO | `min(usuario.nivel_info, accion.nivel_solicitado)` + `sin_campos_sensibles()` gate |
| Scoping de registros | Por `tenantId` + superuser bypass | `en_alcance(...)` por propósito VER / ACTUAR |
| Decisiones cliente | NO separadas del semáforo | Entidad `decision` separada: 7 estados, vigencia 4 tipos, origen auto/manual |
| Escalamiento | NO | Entidad `escalamiento` con niveles configurables |
| Colaboración | Comentarios planos | Comentarios 3 niveles visibilidad + audiencia restrictiva · Etiquetas 4 permisos × general/restringida |
| Auditoría | Básica (logs de request) | `auditoria_log` con {quién, qué, sobre qué, cuándo, valor_anterior, valor_nuevo, origen} |
| Roles usuario | 1 solo rol por user | N roles simultáneos |
| Sobrescrituras individuales | NO | GRANT/DENY individual con trazabilidad |
| Pool de capacidades | `creditBalance + usageStats` por tenant | `capacidad_pool` por 5 niveles + `usuario_limite_consumo` |
| Catálogo permisos | 27 permisos fijos hardcodeados en `ROLE_PERMISSIONS` | 23 atomicos + extensible por catálogo DB |

---

### 1.2 Mapeo Legacy → Nuevo (Plantillas de arranque)

> 🔑 Nota: Los 5 roles legacy no son "iguales". Se comportan como **macros** que al crearse expanden a **conjuntos de los 8 nuevos roles + dimensiones por defecto**.

| Rol Legacy | ➜ Expansión: Nuevo Rol(es) base plantilla + Dimensiones default | Permisos legacy afectados (referencia `ROLE_PERMISSIONS`) |
|------------|-----------------------------------------------------------------|----------------------------------------------------------|
| **`superuser`** | → Usuario global **fuera del modelo RBAC de tenant** (DA-04 wildcard `organizacion_id=*`). Operaciones globales admin platforma: `/users/superadmin/*`, `/tenant/all`, `/admin/*`. ▶️ **[Q1 Confirmado 2026-10-03]** Excepción PN: el `superuser` global **sí hereda automáticamente el sensible `party.query.pn` con `sensible_confirmado=true`** (marcado `granted_by=BOOTSTRAP_MIGRATION`) — únicamente por ser cuenta de plataforma DUXITER. El resto de sensibles `risk.lists.manage`, `risk.params.define`, `risk.formula.edit`, `risk.thresholds.edit` y `admin.grant_sensible` **NO se heredan**: si se requieren, se otorgan de forma explícita por cada tenant via modal doble intención. | Todos · bypass |
| **`tenant_admin`** | → **Admin General** (`admin.users, admin.structure, audit.view △`) + **Gestor de Listas** (△ opcional) + dimensiones default: producto=FAST_CHECK:FULL, nivel_info=INFO_COMPLETA, alcances VER=ORGANIZACION, alcances ACTUAR=ORGANIZACION · tipostercero=PJ_NACIONAL + PN_NACIONAL (pero PN requiere **otorgamiento sensible separado**, nunca automático por deny-by-default Q1) | 25 permisos · excepto `admin.settings, admin.logs, company:update` de superuser |
| **`evaluator`** | → **Operativo** + **Evaluador/Analista** (dual) · dimensiones default: producto=FAST_CHECK:FULL+CONSULTA+MONITOREO, tipostercero=PJ_NACIONAL, nivel_info=DETALLE_RIESGO, alcances VER=UNIDAD, alcances ACTUAR=UNIDAD | fastcheck.query, evaluation:*, company:read, rut:*, sheriff, monitoring:* |
| **`read_only`** | → **Auditor** plantilla · dimensiones default: nivel_info=INFO_NO_SENSIBLE, alcances VER=ORGANIZACION, tipostercero=PJ_NACIONAL (sin PN), solo lectura | user:read, evaluation:read, company:read, rut:read, sheriff, monitoring:read, tenant:read |
| **`write_only`** | → **Operativo** plantilla (escritura operativa) · dimensiones default: producto=FAST_CHECK:FULL+CONSULTA+MONITOREO, tipostercero=PJ_NACIONAL, nivel_info=RESULTADO_GENERAL, alcances VER/ACTUAR=PROPIO | evaluation:create/read, company:read, rut:lookup, monitoring:create/execute, notification:create, tenant:read/update |

> ⚠️ Regla no negociable del DOCX (Sec 7.2): `Admin General ⊃ acceso completo`. → Al expandir `tenant_admin` a **Admin General**, **NO** se asigna nunca `party.query.pn`, `admin.grant_sensitive` ni `risk.*` sin concesión sensible explícita posterior (modal DA-03).

---

### 1.3 Backward Compatibility Layer (DA-01)

**Objetivo**: durante Fase 0 y Fase 1, cualquier endpoint / route guard legacy que use `user.role === 'tenant_admin'` siga funcionando sin cambios.

**Diseño del layer**:
- Campo virtual `legacy_role` (computado, no persistido):
  - Si usuario tiene rol **Admin General** → `legacy_role='tenant_admin'`
  - Si **Evaluador** y **NO** Aprobador → `legacy_role='evaluator'`
  - Si **Solo Auditor** → `legacy_role='read_only'`
  - Si **Operativo + write sin read** → `legacy_role='write_only'`
  - Si wildcard superuser → `legacy_role='superuser'`
- **JWT doble compatibilidad**: token nuevo incluye claims antiguos (`role` = legacy_role calculado) + claims nuevos (`roles[]`, dims hash).
- **Feature flag**: `AUTHZ_LEGACY_LAYER=true` en variables entorno. Al final Fase 1 → `false`.

---

## 2. Impacto por archivo del Codebase Actual

> ⚠️ **NO MODIFICAR NINGÚN ARCHIVO HASTA APROBACIÓN DE FASE 0 Y 1** · se lista solo el impacto.

### 2.1 Backend FastCheck API (`fastcheck_api/app/`)

| Archivo | Cambio | Prioridad Fase |
|---------|--------|----------------|
| [core/security.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L42-L53) · `create_access_token` | Expandir payload JWT: `roles[]`, `dims_hash` (hash dimensiones + alcances para invalidación cache), `legacy_role`, `nivel_info_num`, `pn_authorized`. Mantener `role` legacy para compatibilidad (DA-01). | **F0** |
| [core/security.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L56-L65) · `decode_token` | No cambia firma; agregar función `enrich_from_db(token_payload)` para hidratar dims desde DB si el hash no coincide (cambio de permisos). | **F0** |
| [api/dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L26-L80) · `get_current_user` | Cambiar `CurrentUser.id/email/role/tenant` → `CurrentUser` nuevo: `organizacion_id, pais_ids[], unidad_ids[], area_id, roles[], legacy_role, nivel_info, pn_authorized(bool), scopes_ver[], scopes_actuar[], cache_version, sensibles_confirmados:Set[str]`. Inyectar el objeto enriquecido (llamada a `resolver_permisos_efectivos + scopes`). | **F0-crítico** |
| [api/dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L86-L182) · `ROLE_PERMISSIONS` | **DEPRECATED** como source of truth. Convertir en `bootstrap_legacy_mapping` usado solo en seeding DB y en compatibilidad layer. Nuevo SOT: colecciones `permiso, rol, rol_permiso, usuario_permiso_override`. Mantener diccionario como `SEED_ROLE_PERMISSIONS` p/ migración inicial. | **F0-crítico** |
| [api/dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L185-L195) · `require_permission(p)` | Nueva implementación: 7-pipeline `autorizar` del DOCX Sección 6.3. Usar `CurrentUser` enriquecido. Registrar auditoría. Retornar `HTTP_403_FORBIDDEN` con detalle de negación granular (`{motivo_denegacion, paso_fallido_1..7}`). | **F0-crítico** |
| Nuevo: `services/authz_service.py` | ✨ NUEVO SERVICIO · las 3 funciones puras: `permisos_efectivos(user)`, `en_alcance(user, recurso, proposito)`, `autorizar(user, accion, recurso, ctx)` · **único SOT no replicar lógica**. Agregar `LRU cache(user_id, dims_hash)` con TTL, invalidación al touch `updatedAt usuario/dimensiones/roles`. | **F0** |
| Nuevo: `services/proyeccion_service.py` | ✨ NUEVO · `proyectar(objeto_tercero, nivel_enum, pn_gate: bool, es_sensible_autorizado: bool)` → 5 niveles según Tabla 19. Campos marcados con metadata (p.ej. `level=INFO_COMPLETA`) se filtran. | **F0** |
| [services/auth_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/auth_service.py#L9-L47) · `AuthService.login` | Mantener endpoint. Después de validar password → ejecutar seeding dimensiones por defecto si `is_new_user` (primera vez usuario post-migración). Expandir roles legacy a plantillas nuevas vía compatibilidad layer. | **F0** |
| [api/v1/routers/auth.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/auth.py#L43-L56) · `/auth/me` | Expandir respuesta: `roles[], legacy_role, organizacion, pais, unidades[], area, nivel_info, tipostercero[], productos[], scopes_ver[], scopes_actuar[], sensibles_confirmados[]` + campos legacy. | **F0** |
| Nuevo: `api/v1/routers/authz.py` | ✨ NUEVO · `/authz/check` (POST) y `/authz/effective-permissions/{id}` (GET) según DOCX Sec 9.1. | **F0** |
| Nuevo: `api/v1/routers/org.py` | ✨ NUEVO · países, unidades (árbol), áreas funcionales. CRUD. Requieren `admin.structure`. | **F0** |
| Nuevo: `api/v1/routers/users_profiles.py` | ✨ NUEVO · dimensiones usuario: `POST /users/{id}/roles`, `POST /users/{id}/permissions` (con modal doble intención si sensible), `PUT /users/{id}/scopes`, `PUT /users/{id}/dimensions` (DOCX Sec 9.2). | **F0** |
| Nuevo: `api/v1/routers/third_parties.py` | ✨ NUEVO · `GET /third-parties`, `/third-parties/{id}/summary`, `/third-parties/{id}/history`, `/third-parties/{id}/decisions`. **TODOS los getters pasan por `proyeccion_service`**. | **F0+F1+F2** |
| Nuevo: `api/v1/routers/audit.py` | ✨ NUEVO · `GET /audit` con filtros. Inmutable. | **F0** |
| [middleware/tenant_context.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/middleware/tenant_context.py#L7-L11) | Mantener inicialización `request.state.tenant_id=None`; agregar además inicialización `request.state.authz_ctx=None` para datos del objeto CurrentUser enriquecido. | **F0** |
| [schemas/*.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/schemas) | Nuevos schemas Pydantic: `authz`, `org`, `third_party`, `decision`, `audit`, `permission`, `role`, `dimensiones`, `scopes`. | **F0** |
| Nuevo: `migraciones/` (migration runner pymongo) | Scripts MongoDB: crear colecciones nuevas, índices compuestos, data seed catálogo 23 permisos + 8 roles plantilla, migración one-shot usuarios actuales a nuevo esquema sin tocar data. | **F0** |

---

### 2.2 Frontend React (`src/`)

| Archivo | Cambio | Prioridad Fase |
|---------|--------|----------------|
| [types/auth.ts](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts#L1-L20) | Expandir `User`: `roles[]` (múltiples), `legacyRole`, `organizacionId`, `paisId?`, `unidadIds[]`, `areaFuncionalId?`, `nivelInfo`, `productos[]`, `tiposTercero[]`, `scopes{ver, actuar}`, `sensiblesConfirmados[]`, `cacheVersion`. Mantener `role` legacy para compatibilidad guards viejos. | **F0** |
| [types/tenant.ts](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts#L1-L23) | Expandir: `configDecision`, `paises[]`, `areas[]`, `unidadesRoot[]`. | **F0** |
| **Nuevo: `types/authz.ts`** | ✨ NUEVO · tipos permiso, rol, alcance, dimensión, projectionLevel, sensibleGrantRequest, authzCheck. | **F0** |
| **Nuevo: `types/organizacion.ts`** | ✨ NUEVO · Pais, UnidadOrganizacional (árbol), AreaFuncional. | **F0** |
| [contexts/AuthContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx#L26-L126) | Extender `fetchUserData()` para hidratar el `User` nuevo expandido. Agregar `refreshAuthzCache()` que invalida cache y refetcha `/auth/me` tras cambios de permisos (socket/SSE opcional F3). | **F0** |
| [contexts/TenantContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/TenantContext.tsx#L33-L90) | Rebautizar como `OrganizacionContext` (mantener alias export `useTenant` para compatibilidad). Fetch nuevo: estructura org (paises, unidades árbol, áreas). | **F0** |
| **Nuevo: `contexts/AuthzContext.tsx`** | ✨ NUEVO · wrapper cache cliente `permisos_efectivos`, `puede(accion,recurso)`, `nivel_autorizado`. Reducir llamadas a `/authz/check`. | **F0** |
| [components/auth/ProtectedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/ProtectedRoute.tsx#L6-L25) | Sin cambio interno: capa compatibilidad llena `isAuthenticated` legacy. Opcionalmente migrar a `useAuthz().isLoggedAndActivated`. | **F0** |
| [components/auth/RoleProtectedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/RoleProtectedRoute.tsx#L10-L25) | Mantener firma (`role` prop). En interior, chequear **via compatibilidad layer**: `user.legacyRole === role OR user.roles.includes(legacyRoleMap[role])`. | **F0** |
| [components/auth/SuperuserBlockedRoute.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/SuperuserBlockedRoute.tsx#L9-L24) | Cambiar condición: `user.legacyRole === 'superuser' OR (user.organizacionId === '*')`. | **F0** |
| [components/auth/RoleBasedRedirect.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/RoleBasedRedirect.tsx#L4-L18) | Mantener lógica con legacyRole (DA-01). Fase 2 agregar redirects inteligentes (Solicitante → pantalla mis solicitudes, Auditor → /audit, etc). | **F0 / F2** |
| [services/authService.ts](file:///home/duxiter/duxiter_intermediate/src/services/authService.ts#L14-L223) | Sin cambio firmas públicas. Agregar método: `assignRole(userId, roles[])`, `grantPermission(userId, permiso, {sensible, confirmPassword})`, `putScopes`, `putDimensions`. | **F0** |
| ✨ **Nuevo: `services/authzService.ts`** | Cliente p/ `/authz/check` y `/authz/effective-permissions/{id}` + `proyectarDatos(data, nivel)` helper cliente (double-check de proyección — trust-but-verify). | **F0** |
| ✨ **Nuevo: modals/GrantSensitiveModal.tsx** | Modal confirmación doble intención (DA-03): título descriptivo permiso, checkbox `Confirmo que deseo otorgar este permiso sensible`, input contraseña otorgante, botón deshabilitado hasta check. | **F0** |
| **AdminPages**: [SuperAdminUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/SuperAdminUsersPage.tsx), [TenantManagementPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantManagementPage.tsx), [TenantUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantUsersPage.tsx) | Rediseño profundo Fase 0/1. Nuevo tab layout Admin: `[Usuarios | Estructura Org | Roles | Permisos Individuales | Alcances | Dimensiones | Sensibles].` SuperAdmin vista global por tenant seleccionado. Cada pantalla integra el flujo completo Sec 9.2 DOCX. | **F0 / F1** |
| [App.tsx](file:///home/duxiter/duxiter_intermediate/src/App.tsx#L62-L111) · router | Agregar `/admin/org`, `/admin/permissions`, `/admin/scopes`, `/admin/dimensions`, `/audit`, `/third-parties/search`, `/third-parties/:id`. Mantener compatibilidad routes legacy. Agregar `AuthzProvider` wrapper. | **F0+F1** |
| [routes/AdminRoutes.tsx](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx#L25-L50) | Nuevas subrutas + wrappers `PermissionGate permiso='admin.structure'` granular. | **F0** |
| **Nuevo: components/authz/PermissionGate.tsx, LevelGate.tsx, ScopeGate.tsx** | ✨ NUEVOS · reemplazo granular futuro de `RoleProtectedRoute`. | **F0** |
| **Nuevo: pages/third-party/**`SearchPage`, `ThirdPartyDetailPage`, `DecisionHistoryTimeline` | UI proyectada por nivel, timeline decisiones/escalamientos/comentarios con proyección de sensibles. | **F1 / F2** |
| **Nuevo: pages/audit/AuditViewerPage.tsx** | Tabla auditoría con filtros; inmutable. | **F1** |
| Test suites: `contexts/__tests__/AuthContext.test.tsx`, `components/auth/__tests__/*.test.tsx`, `services/__tests__/authService.test.ts` | Extender tests con: permisos efectivos (con DENY > GRANT), proyección 5 niveles, scoping por VER/ACTUAR, gate sensible, legacy layer, 3 escenarios clientes Rheem, Clínica Dávila, Easy (Sec 11). | **F0 antes de mergear código** |

---

## 3. Procedimiento de Refactoring (Fases 0 → 3)

### PRE-WORK: Setup y Convenciones
- [ ] **W-01** Crear branch `feat/rbac-abac-refactor`, política squash-merge por Fase; PR mínimo 2 reviewers.
- [ ] **W-02** Bloquear `master` hasta merge Fase 0-1 completo; reglas CODEOWNERS sobre archivos security/dependencies.
- [ ] **W-03** Backup snapshot MongoDB production: `mongodump` antes de migración + rollback script 1:1.
- [ ] **W-04** Crear `CHANGELOG_SEMANAL.md` entrada nueva: Tema "Refactor RBAC-ABAC". Registrar horas por task y líneas modificadas.

---

### 🟡 FASE 0: Fundaciones (MVP) — 8 Capacidades — Dependencias: ninguna

#### Bloque 0.1 — MongoDB nuevas colecciones + migración one-shot de datos
- [ ] **0.1.1** Runner scripts migración: `fastcheck_api/app/migrations/runner.py` (up/down)
- [ ] **0.1.2** Script 001 — **seed catálogo atómico**: 23 permisos (DOCX Sec 7.1) en colección `permisos` (con `es_sensible=true/false`, `categoria` enum). Seed 8 roles base plantilla en `roles` (DOCX Sec 7.2). Seed `rol_permiso` con la matriz.
- [ ] **0.1.3** Script 002 — **nuevas colecciones estructura org**: `organizaciones` (mapea desde `tenants.id→organizaciones.id:1`, copia `nombre, activo`, `config_decision: MANUAL` default), `paises` (seed 1 entry por tenant: `codigo=CL` default mono-país), `unidades_organizacionales` (seed por tenant: 1 unidad raíz tipo `OTRO nombre="Default"`), `areas_funcionales` (seed 4 áreas default: Compras, Compliance, RRHH, Operaciones). Mantener `tenants` collection legacy (solo se marca `migrated_authz_v2=true`).
- [ ] **0.1.4** Script 003 — **migrar usuarios existentes**:
  - Por cada user en `users`:
    - Expandir `user.role` legacy a **8 roles plantilla** via mapeo (Gap Analysis Sec 1.2) → insertar en `usuario_rol`.
    - Calcular dimensión default por cada rol (usuario_producto, usuario_tipo_tercero, usuario_nivel_info, usuario_alcance VER/ACTUAR defaults).
    - Registrar `usuario_unidad` a la unidad root default.
    - `usuario_permiso_override`: **[Q1 2026-10-03 confirmado]** 2 comportamientos:
      1. **Si `users.role !== 'superuser'`** → **NINGÚN sensible se hereda automáticamente**; party.query.pn default DENY implícito + D-01 deny-by-default para risk.lists.manage, risk.params.define, risk.formula.edit, risk.thresholds.edit, admin.grant_sensitive, exception.authorize. (Ningún entry override = DENY)
      2. **Si `users.role === 'superuser'` (global DUXITER)** → única excepción: crea 1 entrada override **GRANT `party.query.pn`** con `sensible_confirmado=true`, `origen=BOOTSTRAP_MIGRACION_202610`, `granted_by=SYSTEM_MIGRATION`. El resto de sensibles sigue siendo DENY como todos.
    - Marcar `users.authz_v2_migrated=true, cache_version=1`.
- [ ] **0.1.5** Crear **índices nuevos**: `organizaciones(nombre, activo)`, `usuarios(organizacion_id, legacyRole, cache_version)`, `permiso(codigo, es_sensible)`, `usuario_rol(usuario_id, rol_id)`, `usuario_alcance(usuario_id, proposito)` índice compuesto `(usuario_id, proposito, tipo_alcance)`, `auditoria_log(organizacion_id, usuario_id, ts, entidad_tipo)` con TTL opcional futuro.

#### Bloque 0.2 — JWT doble compatibilidad + CurrentUser enriquecido
- [ ] **0.2.1** [security.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py) `create_access_token()` payload nuevo.
- [ ] **0.2.2** [dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py) nuevo `CurrentUser` data class expandido + `get_current_user` que hidrata desde las nuevas colecciones (incluye `dims_hash` = hash contenido dims para invalidación).
- [ ] **0.2.3** Agregar feature flag `AUTHZ_LEGACY_LAYER` que si `false` devuelve nuevo CurrentUser sin campo `legacy_role`.

#### Bloque 0.3 — Authz Service (motor 7 pasos)
- [ ] **0.3.1** Implementar `permisos_efectivos(user)` — test 20 casos unitarios: GRANT, DENY, sensibles require `sensible_confirmado=true`, no hay herencia sensible.
- [ ] **0.3.2** Implementar `en_alcance(user, recurso, 'VER'|'ACTUAR')` — test PROPIO/UNIDAD/AREA/PAIS/ORG + CONJUNTO_UNIDADES + `incluye_descendientes`.
- [ ] **0.3.3** Implementar `autorizar(user, accion, recurso, contexto)` pipeline 7 pasos DOCX Sec 6.3; retorna objeto decision con motivo denegación por paso.
- [ ] **0.3.4** LRU cache: `cache[(user_id, user.dims_hash)]`; TTL 5 minutos; invalidación touch `updatedAt` usuario o dimensiones.
- [ ] **0.3.5** Registrar auditoría: cada llamada a `autorizar` que caiga en PERMITIR inserta en `auditoria_log`.

#### Bloque 0.4 — Proyección por 5 niveles
- [ ] **0.4.1** Diseñar metadata `@authz_level(level=INFO_COMPLETA, sensible=true)` en todos los schemas de respuesta tercero/evaluación.
- [ ] **0.4.2** `proyectar(obj, nivel, es_sensible_autorizado)` — 10 tests unitarios incluyendo proyección a nivel RESULTADO_GENERAL y gate PN.

#### Bloque 0.5 — Endpoints mínimos Fase 0 (DOCX Sec 9.1–9.3)
- [ ] **0.5.1** `POST /authz/check`, `GET /authz/effective-permissions/{userId}`
- [ ] **0.5.2** `/org/countries`, `/org/units` (CRUD árbol), `/org/areas` — con protección `admin.structure`
- [ ] **0.5.3** `/users/{id}/roles`, `/users/{id}/permissions` (GRANT/DENY individual), `/users/{id}/scopes`, `/users/{id}/dimensions` — rutas admin.users y admin.grant_sensitive
- [ ] **0.5.4** `/third-parties?identificacion|nombre` y `/third-parties/{id}/summary` — **OBLIGATORIO** pasar por proyección y authz; si resultado queda vacío (nivel 1 sin semáforo) devolver 403 o 204.
- [ ] **0.5.5** `GET /audit` (solo `audit.view`)

#### Bloque 0.6 — Backend compatibilidad layer endpoints legacy
- [ ] **0.6.1** Mantener todos los endpoints legacy (Fast Check evaluations, sheriff, etc.) usando `legacy_role`. Los endpoints antiguos NO se rompen; bajo capó ejecutan **vía wrapper** `Depends(require_permission(...))`.
- [ ] **0.6.2** Tests de regresión: 20 tests legacy (`/auth/login`, `/evaluations/...`, `/tenant`) deben pasar con `AUTHZ_LEGACY_LAYER=true`.

#### Bloque 0.7 — Frontend setup y nueva UI administración
- [ ] **0.7.1** Nuevos types, `AuthzContext`, `AuthzService`, `OrganizacionContext`.
- [ ] **0.7.2** Compatibilidad guards legacy.
- [ ] **0.7.3** Modal `GrantSensibleModal.tsx` doble intención.
- [ ] **0.7.4** Nueva `AdminUsersPage` tabs (Usuarios · Estructura Org · Roles · Permisos Indiv · Alcances · Dimensiones). Test manual con login `tenant_admin` y `superuser`.
- [ ] **0.7.5** Pantalla `ThirdPartySearch` minimal con proyección.

#### Bloque 0.8 — Testing Fase 0
- [ ] **0.8.1** Tests unitarios: `permisos_efectivos`, `en_alcance`, `autorizar`, `proyectar`.
- [ ] **0.8.2** Tests integración: login legacy superuser + legacy tenant_admin + legacy evaluator → routes protegidas funcionan, y nuevo `POST /authz/check` niega party.query.pn por defecto.
- [ ] **0.8.3** QA: test 4 escenarios Casos Rheem, Clínica Dávila, Easy, UDLA (DOCX Sec 11) usando solo Fase 0.

---

### 🟠 FASE 1: Decisión y ciclo de vida — 5 capacidades
- [ ] **1.1** Colecciones `tercero`, `evaluacion` (extender la actual evaluations con `nivel_requerido, unidad_id, motivo_consulta`), `decision` 7 estados, `escalamiento`.
- [ ] **1.2** Workflow endpoint `POST /third-parties/{id}/decisions` (alcance ACTUAR), `/evaluations/{id}/escalate`.
- [ ] **1.3** Rol **Solicitante** plantilla + endpoint `/requests` (inicia alta sin ver detalle) — confirmar separación iniciar/evaluar/decidir caso UDLA.
- [ ] **1.4** Motivo/context PN obligatorio UI + back + registrar en auditoria (D-02).
- [ ] **1.5** Timeline decisión/escalamiento UI, ficha tercero Fase 1.

---

### 🟠 FASE 2: Colaboración y gobierno
- [ ] **2.1** Comentarios: `VISIBLE/RESTRINGIDO/PERSONAL`, audiencia restrictiva.
- [ ] **2.2** Etiquetas general/restringida, 4 permisos etiqueta.
- [ ] **2.3** Exportación multinivel.
- [ ] **2.4** Gobierno riesgo: `risk.lists.manage, risk.params.define, risk.thresholds.edit, risk.formula.edit` (sensible, modal doble intención). Modificar toda la actual lógica de listas propias + umbrales para enganchar a permisos.
- [ ] **2.5** `capacidad_pool` 5 niveles + `usuario_limite_consumo`. Reemplaza gradualmente `usageStats` y `creditBalance` (mantener ambos sincronizados con migration script periódico hasta corte).
- [ ] **2.6** `GET /third-parties/{id}/history` completo.

---

### 🟢 FASE 3: Evolución — Deseable
- [ ] **3.1** Motor workflow.
- [ ] **3.2** Decisión automática/mixta por reglas cliente (`organizacion.config_decision=MIXTA/AUTOMATICA`).
- [ ] **3.3** Documentos aportados como fuente.
- [ ] **3.4** Integración Deep Check / Smart Flow estado.
- [ ] **3.5** Corte compatibilidad: `AUTHZ_LEGACY_LAYER=false`; eliminar roles legacy `5` de código; remover `ROLE_PERMISSIONS` hardcodeado dependencies.py (guardar solo como fixture tests).

---

## 4. Procedimiento de Migración de Datos (MongoDB) — Orden estricto

```
 PASO 1 → Backup producción          (mongodump → bucket)
 PASO 2 → Crear colecciones seed     (001_seed_catalog_permisos_roles.up.py)
 PASO 3 → Migrar estructura tenant  (002_estructura_organizacional.up.py)
 PASO 4 → Migrar usuarios            (003_usuarios_to_authz_v2.up.py)
 PASO 5 → Índices                    (004_indices.up.py)
 PASO 6 → Smoke test 20 queries      (script smoke.py)
 PASO 7 → Feature flag AUTHZ_V2=true por tenant primero (canary)
 PASO 8 → Gradual rollout por país/UO
 PASO 9 → Full switch AUTHZ_LEGACY_LAYER=true → true pero doble ejecución
 PASO 10 → Fase3: AUTHZ_LEGACY_LAYER=false, limpieza código legacy.
```

**Rollback por paso**: `00X_....down.py` script drop colecciones nuevas, desmarcar `authz_v2_migrated`, restaurar backup si > PASO 4.

---

## 5. Procedimiento Testing — Coverage mínimo requerido

| Capa | Coverage | Herramienta |
|------|----------|-------------|
| `authz_service.py` (3 funciones puras) | ≥ 95% | pytest, parametrize casos DOCX |
| `proyeccion_service.py` | ≥ 90% | pytest |
| `dependencies.py · require_permission` | ≥ 90% | httpx FastAPI TestClient |
| Endpoints legacy (regresión) | 100% de los endpoints críticos login / evaluations / tenant | Jest y pytest |
| Route Guards frontend | ≥ 85% | React Testing Library |
| Integración 4 casos cliente (DOCX Sec 11) | 100% pass | QA manual + tests e2e |
| Modal doble intención sensibles | 3 casos otorgar/denegar/falta contraseña | RTL |

---

## 6. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Lógica dispersa authz en rutas legacy** | Fugas de permiso | **Linter rule + PR gate**: `require_permission(...)` debe aparecer en todas las rutas `router.*` del repo; `grep` en CI que falle si un endpoint no usa el dependency. |
| **Proyección incompleta → leak info sensible** | Criticidad **HIGH** | Double-projection: back-end (única fuente de verdad) + helper cliente trust-but-verify; tests e2e: mismo RUT con 3 perfiles, assert JSON fields. |
| **Cache invalidation fallida tras cambio permisos** | Autorización desactualizada | Cada cambio en `roles / permisos_override / dims / scopes` → bump `cache_version++` en users collection; TTL cache máximo 5 min. |
| **Migración one-shot usuarios con PN grant accidental** | Violación D-01 deny-by-default | Step migración: **por defecto PN DENY**, y entrada en `usuario_permiso_override` solo si se ejecuta script especial post-migración con aprobación manual. |
| **Performance degradación** pipeline 7 pasos por request | P99 < 50ms requerido | LRU cache; eager-load `CurrentUser` en dependencia; índices compuestos. |
| **Falta confirmar D-01…D-10** con negocio | Alcance ambiguo | Anexar sección 13 DOCX como **Definition of Ready**; bloquear paso a Fase 1 hasta confirmar D-01..D-10 en reunión cliente. |

---

## 7. Backlog HU extraído (19 historias, prioridad F0 → F3)

| ID HU | Título | Fase | Criterio de aceptación |
|--------|--------|------|------------------------|
| HU-01 | Como Admin General puedo crear una UO en el árbol | F0 | Crea en DB; se refleja en select; requiere `admin.structure` |
| HU-02 | Como Admin General asigno un rol a un usuario | F0 | Expande plantilla; aparece en permisos_efectivos; DENY gana |
| HU-03 | Como Admin General otorgo `party.query.pn` a un usuario | F0 | Abre modal doble intención; marca `sensible_confirmado=true`; requiere contraseña otorgante |
| HU-04 | Como Evaluador consulto un RUT PJ y veo DETALLE_RIESGO | F0 | Proyección nivel 3; 0 campos sensibles PN |
| HU-05 | Como Evaluador intento consultar PN → 403 con mensaje | F0 | Motivo denegación: "falta permiso sensible party.query.pn" |
| HU-06 | Como Operativo veo solo semáforo `RESULTADO_GENERAL` | F0 | Misma URL que HU-04; response solo semáforo |
| HU-07 | Como Superuser DUXITER puedo gestionar estructura de cualquier tenant y consultar PN globalmente (Q1 2026-10-03) | F0 | Wildcard `organizacion_id=*`; concede party.query.pn con sensible_confirmado=true automáticamente por bootstrap migration; NO hereda risk.* ni admin.grant_sensible (siguen siendo sensibles que requieren modal) |
| HU-08 | Como Solicitante creo solicitud alta con antecedentes SIN ver detalle | F1 | Crea request; lectura devuelve 403 |
| HU-09 | Como Jefe aprueba/desaprueba en su alcance de UO | F1 | Decision registrada; otra UO no puede |
| HU-10 | Como Aprobador escalo a central | F1 | Se crea `escalamiento`; aparece en timeline |
| HU-11 | Como Operativo ingresa motivo PN | F1 | Campo obligatorio; guardado auditoría |
| HU-12 | Como usuario veo comentario visible, restringido a mi ROL y personal | F2 | 3 tipos visibilidad auditar |
| HU-13 | Como Gestor Listas modifico listas propias (sensible) | F2 | Modal doble intención; valor_anterior/nuevo en auditoría |
| HU-14 | Como Gestor Riesgo cambio umbral semáforo | F2 | Sensible; auditoria |
| HU-15 | Como Admin General exporta certificado vs informe detallado | F2 | 2 niveles; siempre auditado |
| HU-16 | Como Operativo excedo tope individual consumo | F2 | Operación bloqueada con mensaje |
| HU-17 | Como Compliance veo timeline completo del tercero | F2 | Historia proyectada según nivel |
| HU-18 | Workflow automático: verde → aprobado auto | F3 | Decision AUTOMATICA, sin responsable |
| HU-19 | Como Admin General, deep check estado integrado en ficha | F3 | Campo visible solo para INFO_COMPLETA |

---

## 8. Criterios de Terminación por Fase (Definition of Done)

### Fase 0 DoD
- [ ] **Scripts migración** ejecutados en staging con backup previo + rollback testado 3 veces.
- [ ] `permisos_efectivos` 100% pasan tests 20 casos.
- [ ] `require_permission` en **TODAS** las rutas FastAPI (linter PR gate pasa).
- [ ] Proyección tested contra 3 perfiles diferentes en misma consulta misma URL.
- [ ] Modal sensible registra contraseña otorgante (hash check).
- [ ] 4 casos docx Sec11 Rheem/Clinica/Easy/UDLA pasan.
- [ ] Routes legacy 100% funcionan (AUTHZ_LEGACY_LAYER=true).
- [ ] QA_TEST_LIST actualizado con 50 casos + Excel regenerado vía `.scripts/gen_qa_xlsx.py`.

### Fase 1 DoD
- [ ] 7 decisiones funcionan; vigencia 4 tipos; escalamiento por 3 niveles.
- [ ] D-01…D-10 confirmadas cliente; actualizar sección 13 especificación.
- [ ] PN motivo obligatorio.

### Fase 2 DoD
- [ ] Toda funcionalidad gobierno riesgo / comentarios / exportación.
- [ ] Capacidad pool por 5 niveles.

### Fase 3 DoD
- [ ] `AUTHZ_LEGACY_LAYER=false` en prod sin regresión.
- [ ] 5 roles legacy, `ROLE_PERMISSIONS` hardcodeado, `role` single en User types eliminados o marcados `@deprecated`.
- [ ] `CHANGELOG_SEMANAL.md` cierra la task con horas y referencias líneas.

---

## 9. Respuestas Confirmadas ✅ (Cerrado - No DoD Pendiente Inicio F0)

> 🟢 **OK para iniciar ejecución código Fase 0**. Respuestas cliente 2026-10-03:

| # | ID | Respuesta Cliente | Implicación en código |
|---|----|-------------------|-----------------------|
| ✔ | **Q1** | **SI deny-by-default PN para TODOS los usuarios… SALVO `superuser` global (wildcard DUXITER)** — que **sí hereda `party.query.pn` automáticamente por ser cuenta de plataforma**; dentro de cada tenant el superadmin sigue necesitando otorgamiento explícito sensible como cualquier otro admin. | Script migración 003: `usuario_permiso_override` crea GRANTE `party.query.pn` con `sensible_confirmado=true` (granted_by=BOOTSTRAP_MIGRATION) **solo** para users con `users.role === 'superuser'`. Para resto `DENY` por defecto. |
| ✔ | **Q2** | **`incluye_descendientes = TRUE` por defecto** al crear alcance UNIDAD/AREA/PAIS. | Valor default `true` en colección `usuario_alcance`; queries MongoDB recursivas árbol habilitadas. |
| ✔ | **Q3** | **Multipertenencia UO/área BLOQUEADA en MVP (Fase 0) → 1 usuario = máx 1 UO + 1 Área.** Se habilita multipertenencia a partir Fase 1. | Constraint UI + validación backend: al PUT dimensiones falla si `len(unidad_ids) > 1`. F1 se quita el constraint. |
| ✔ | **Q4** | **Escalamiento FASES FIJAS 3 niveles (Operativo → Jefatura UO → Central) para MVP F0/F1.** Configurable por tenant a partir Fase 2. | Colección `escalamiento` con `nivel=1|2|3` hardcodeado + F2 agrega `escalamiento_config` por organizacion. |
| ✔ | **Q5** | **Catálogo Motivo PN FIJO de 6 entradas del DOCX en F0.** Catálogo editable por admin desde Fase 1. | Enum Pydantic `MotivoConsultaPN` 6 valores. F1 agrega colección `motivos_consulta_pn`. |
| ✔ | **Q6** | **Límite NO es duro: se permite SOBREGIRO CONTROLADO.** Bloqueo solo cuando sobrepasa umbral configurable (default 150% del plan). Notificaciones UI + mail a los `admin.users` del tenant al 90%, 100%, 120%. | Billing service: NO bloquea automáticamente a los 100% exactos; `usuario_limite_consumo` bloquea *individualmente* si se configura un tope personal por usuario. |

---

## 10. Índice de Archivos Clave + Referencias

| Archivo | Función | Fase |
|---------|---------|------|
| [ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md](file:///home/duxiter/duxiter_intermediate/ESPECIFICACION_TECNICA_PERFILAMIENTO_FASTCHECK.md) | Especificación técnica cliente (traducción DOCX) | Lectura previa |
| [DOCUMENTACION_ROLES_TENANTS_RBAC.md](file:///home/duxiter/duxiter_intermediate/DOCUMENTACION_ROLES_TENANTS_RBAC.md) | Sistema roles/tenants actual (legacy) | Gap analysis |
| [dependencies.py#L86-L182](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L86-L182) | ROLE_PERMISSIONS legacy (deprecated F0) | Mapeo inicial |
| [security.py#L42-L53](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L42-L53) | JWT create_access_token (expandir) | F0 |
| [TENANT_ACTIVE_CRITERIA.md](file:///home/duxiter/duxiter_intermediate/TENANT_ACTIVE_CRITERIA.md) | Criterio tenant activo (extender a pool capacidad) | F2 |
| `.scripts/gen_qa_xlsx.py` | QA xlsx generator | Cada fase |
| `CHANGELOG_SEMANAL.md` | Registro horas y refs | Cada fase |

---

> Fin Procedimiento Refactoring.
> Estado: pendiente aprobación.
> **Siguiente paso**: responder Q1…Q6 para pasar a ejecución.
