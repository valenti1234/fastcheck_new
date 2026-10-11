# GUÍA PRUEBA FRONTEND — RBAC + ABAC + SCOPES FASE 2
> **Fecha**: 04.10.2026 · **Branch**: `feat/rbac-abac-fase2` · **DB Staging**: `duxiter-2` (NUNCA `duxiter` producción)

---

## 🎯 2 modos para probar

| Modo | Descripción | Público |
|---|---|---|
| **A. FULL STACK (recomendado)** | Backend FastAPI (`duxiter-2`) + Frontend Vite juntos. Prueba TOTALMENTE integrado. | QA manual / validación real |
| **B. MOCK RÁPIDO (≤ 5 min)** | Solo frontend Vite. Escribe `localStorage` directamente. Omite login formulario. | Smoke test rápido UI |

---

## ⚠️ CONFIGURACIÓN CRÍTICA (OBLIGATORIO ANTES DE LANZAR)

### 1. Backend FastAPI — apunta a `duxiter-2` (staging)
**POR DEFECTO ESTÁ MAL**: el `.env` apunta a `duxiter` producción (HTTP 503 si no lo cambias).

Archivo: [fastcheck_api/.env](file:///home/duxiter/duxiter_intermediate/fastcheck_api/.env)

**Sustituye la línea 1 completa**:
```env
# ↓ ANTES (PRODUCCIÓN — ❌ NO USAR): MONGODB_URI=.../duxiter?replicaSet=rs0
# ↓ AHORA (STAGING — ✅ SÍ):
MONGODB_URI=mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000

# ===== AGREGA ABAJO (feature flags FASE 2) =====
AUTHZ_FORBID_PROD_DB=True
AUTHZ_LEGACY_LAYER=False
```

> 💡 Safety lock 4-capas: si dejas `duxiter` en URI → **TODAS las rutas devuelven HTTP 503**.

### 2. Frontend Vite — apunta a backend LOCAL (no Azure prod)
Archivo: [.env](file:///home/duxiter/duxiter_intermediate/.env) — **renglones 20 / 21 / 22**:

```env
# ===== SI LANZAS BACKEND EN LOCAL =====
REACT_APP_API_URL=http://localhost:8181/api
VITE_API_URL=http://localhost:8181/api
VITE_API_BASE_URL=http://localhost:8181/api
```

> Si backend no está en `:8181`, ajusta la puerto. La hardcode fallback en [TenantContext.tsx#L31](file:///home/duxiter/duxiter_intermediate/src/contexts/TenantContext.tsx#L31) apunta a Azure prod y sobreescribe env si este está vacío.

### 3. Puerto backend confirmado
Default en `.env` renglón 8 de `fastcheck_api/.env` → `FASTCHECK_API_PORT=8181`. CORS ya abierto (`FASTCHECK_CORS_ORIGINS=*`).

---

## 🅰️ MODO A — FULL STACK (2 terminales)

### ▶️ Terminal 1 · Levantar Backend FastAPI (Staging `duxiter-2`)
#### 🚀 Método 1 RECOMENDADO — script `start_backend_staging.sh` (1 línea, env + safety HARDCODED → 0 errores)
```bash
cd /home/duxiter/duxiter_intermediate
./scripts/start_backend_staging.sh                 # default: puerto 8181 + --reload (desarrollo)
```

Variantes útiles (mismo script):
```bash
./scripts/start_backend_staging.sh --port 9000     # puerto custom 9000
./scripts/start_backend_staging.sh -p 9000          # versión corta --port
./scripts/start_backend_staging.sh --no-reload     # sin --reload (ejecución estable)
./scripts/start_backend_staging.sh -n -p 9000      # puerto custom + estable
./scripts/start_backend_staging.sh --help          # muestra ayuda
```

| Flag Largo | Flag Corto | Valor | Descripción |
|---|---|---|---|
| `--port` | `-p` | número (ej 8181, 9000) | Escucha FastAPI en puerto custom |
| `--no-reload` | `-n` | (ninguno) | Desactiva `--reload` para staging no-desh |
| `--help` | `-h` | (ninguno) | Muestra ayuda y sale |

> 🛡️ Safety hardcodeado en el script (NUNCA se equivoca):
> - `MONGODB_URI` = `/duxiter-2` EN EL PATH (no solo querystring) → imposible caer en `duxiter` prod
> - `AUTHZ_FORBID_PROD_DB=True` · `AUTHZ_LEGACY_LAYER=False` · `PYTHONPATH=.`
> - Pre-flight 4 checks: si falta `.venv`, `fastcheck_api/` o `app/main.py` → falla inmediato con mensaje claro
> - `set -euo pipefail` strict-mode

---

#### Método 2 MANUAL (legacy — SOLO si necesitas override temporal)
```bash
cd /home/duxiter/duxiter_intermediate/fastcheck_api
source ../.venv/bin/activate
export PYTHONPATH=.
export MONGODB_URI='mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000'
export AUTHZ_FORBID_PROD_DB=True
export AUTHZ_LEGACY_LAYER=False
python -m uvicorn app.main:app --host 0.0.0.0 --port 8181 --reload
```

✅ Espera el log:
```
Uvicorn running on http://0.0.0.0:8181 (Press CTRL+C to quit)
Application startup complete.
```

**Verificación safety (curl 1 línea)**:
```bash
curl -s http://localhost:8181/api/auth/me -I | head -3
# Esperado: HTTP/1.1 401 Unauthorized  (❌ NO 503 DB_PROD — significa URI apunta a `duxiter`)
```

### ▶️ Terminal 2 · Levantar Frontend Vite
```bash
cd /home/duxiter/duxiter_intermediate
npm install        # Solo la 1ª vez (si node_modules/ no existe)
npm run dev        # Espera http://localhost:5173 o http://localhost:3000
```
Abre la URL que imprima vite en consola.

### 👤 4 USUARIOS REALES `duxiter-2` para login
> **🛂 Credenciales OFICIALES staging (actualizadas: 04/10/2026)**.  
> SuperAdmin global reseteada BCrypt ✅ → se **PROBÓ end-to-end login 200 + /me 200** en FastAPI `:8181` (seguridad: 0 escrituras en `duxiter` prod).  
> Los otros 3 perfiles CMPC / Virbac / UCSC → *contraseña legacy (copia 1:1 desde `duxiter`)*: si no funcionan → salta directo al **Modo B Mock** (5min, token manual).

| ID | Icono | Rol FASE2 | Email real | Password oficial staging (04/10/2026) | Qué PROBAR en UI |
|---|:---:|---|---|---|---|
| **A** | 🔴 | Superuser Global · Wildcard | `superadmin@gmail.com` | ✅ **`SuperAdmin3465#`** (100% verificada · login 200) | `/admin/authz/profiles` 3 Tabs · `/admin/riesgo-parametros` (Gobierno Riesgo SENSIBLES) · `/admin/capacidad-pool` Cambiar Plan · `/v2/workspace/*` → **HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED` (Q7)** |
| **B** | 🟡 | Tenant Admin CMPC · ADMIN_GENERAL + GESTOR_LISTAS | `anibal.fernandez@cmpc.com` | ⚠️ *Pendiente reseteo manual · usar Modo B si falla* | `/admin/users` editar roles · Export Certificado (L4) · `/v2/workspace/*` 200 (no superuser) |
| **C** | 🟢 | Evaluador Virbac · DETALLE_RIESGO (L4) | `ghap68@yahoo.com` | ⚠️ *Pendiente reseteo manual · usar Modo B si falla* | Dashboard **ResultsTable = 7 columnas** (incluye TAG · `filterColumns` L4 pasa) · Timeline Terzo projection L4 cuerpo + valores |
| **D** | 🔵 | Read Only UCSC · RESULTADO_GENERAL (L1) | `clsalgado@ucsc.cl` | ⚠️ *Pendiente reseteo manual · usar Modo B si falla* | Dashboard **ResultsTable SOLO 6 columnas** (TAG oculta · Q3 MVP 1 UO max) · Timeline Terzo SOLO 6 campos N1 · Export → HTTP 403 |

---

## 🎯 CASOS DE PRUEBA EN UI (por módulo FASE2)

### Caso 1 · ResultsTable Filtro Columnas según Nivel (Bloq0.7 S3)
1. Login **D) CCU read only (L1)** → Ir a `/dashboard`
   > ✅ Esperado: **SOLO 6 columnas** (RUT · Razón Social · Nivel Riesgo · Creado · Semáforo · Acciones) · COLUMNA TAG OCULTA
2. Logout → Login **C) AXA evaluador (L4)** → Recarga `/dashboard`
   > ✅ Esperado: **7 columnas** (COLUMNA TAG VISIBLE) — hook `useProyeccionNivel().filterColumns(colDefs)` [AuthContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx) + [ResultsTable.tsx#L279-L461](file:///home/duxiter/duxiter_intermediate/src/components/dashboard/ResultsTable.tsx#L279-L461)

### Caso 2 · Admin UI Authz Profiles 3 Tabs (Bloq0.7 S2 · SOLO Superuser A)
Rota: **`/admin/authz/profiles`** (menú drawer lateral "Perfiles Autorización" · icono Shield · solo role superuser visible)
- **TAB 1 → Usuarios**: cambia rol CHC de `ADMIN_GENERAL` → `READ_ONLY_TENANT`. Guarda. Logout → login CHC. ✅ Resultado: CHC ya NO ve rutas admin.
- **TAB 2 → Permisos Sensibles (Q1 PN gate)**: botón **"Otorgar permiso sensible"**. Abre modal [GrantSensibleModal.tsx](file:///home/duxiter/duxiter_intermediate/src/components/modals/GrantSensibleModal.tsx#L1-L180). Doble confirm: checkbox awareness + password otorgante. Default **Q4 Nivel 1** (dropdown 1, 2, 3 niveles fijos).
- **TAB 3 → Alcances**: selects MVP UO / Área (Q3 máximo 1 UO · Q2 `incluye_descendientes=True` por defecto).

### Caso 3 · Timeline Tercero 4 Fuentes (HU-17 · Bloq2.6)
1. Ir a lista resultados → click en cualquier detalle tercero
2. Añade `/history` al final URL: `http://localhost:5173/third-parties/{DOC_ID}/history`

| Usuario (Nivel) | Timeline renderiza |
|---|---|
| A / B (L5 + sensible) | 15 tipos evento · cuerpo completo + `campos_sensibles` marcador `__TEST_I8_BLOQ26__` |
| C (L4) | cuerpo + `valor_anterior / valor_nuevo` present; SIN `campos_sensibles` |
| D (L1) | **SOLO 6 campos** (id / tipo_evento / titulo / ts / ts_humano / fuente) · 0 leak datos |
| CHC (scope mismatch) → ve recurso de AXA | **HTTP 404 / 403** |

### Caso 4 · Gobierno Riesgo + Capacidad Pool (FASE2 Bloq2.4 / 2.5)
| Ruta | Esperado Superuser A | Esperado D) CCU |
|---|---|---|
| `/admin/riesgo-parametros` (SENSIBLE Q4 ≥3) | Panel completo · edición params umbrales fórmula | 403 Forbidden |
| `/admin/capacidad-pool` | Cambiar plan BASIC → STARTUP → PRO → BUSINESS → ENTERPRISE · Overshoot ≥150% → HTTP 402 Payment Required | 403 (sin `pool.credit.view`) |
| `/v2/workspace/anything` | **HTTP 403 `SUPERUSER_WORKSPACE_BLOCKED`** (Q7) · FASE1 Bloq1.2 | 200 OK (usuario tenant) |

---

## 🅱️ MODO B — MOCK RÁPIDO (sin contraseñas reales)
Sitúate en la página de login (sin loguearte). Pulsa **F12 → Console**, elige UN usuario (SOLO 1), pega el código correspondiente y pulsa Enter → **la página recarga sola** con el usuario ya autenticado.

```javascript
// ============================================================
// ELIJE SOLO 1 DE ESTOS 4 (COMENTA LOS OTROS 3)
// ============================================================

// --- (A) 🔴 SUPERUSER GLOBAL (prueba ADMIN) ---
const userProfile = {
  id: "696eaa2bddea6b91873de160",
  email: "superadmin@gmail.com",
  name: "Usuario Superadmin",
  role: "superuser",
  legacy_role: "superuser",
  authz_v2_migrated: true,
  roles: ["SUPER_WILDCARD"],
  nivel_info: "INFO_COMPLETA",
  pn_authorized: true,
  cache_version: 6,
  organizacion_id: null,
  pais_ids: [],
  unidad_ids: [],
  area_id: null,
  sensibles_confirmados: ["party.query.pn", "exception.authorize", "admin.grant_sensitive", "risk.lists.manage", "risk.params.define", "risk.thresholds.edit", "risk.formula.edit", "pool.credit.manage"]
};

/*
// --- (B) 🟡 TENANT ADMIN CMPC ---
const userProfile = {
  id: "6a710ccc41eb4a347a7b2afa",
  email: "anibal.fernandez@cmpc.com",
  name: "Aníbal Fernández (CMPC)",
  role: "tenant_admin",
  legacy_role: "tenant_admin",
  authz_v2_migrated: true,
  roles: ["ADMIN_GENERAL", "GESTOR_LISTAS"],
  nivel_info: "DETALLE_RIESGO",
  pn_authorized: false,
  cache_version: 5,
  organizacion_id: "cmpc_object_id_placeholder",
  pais_ids: ["CL"],
  unidad_ids: ["uo_cmpc_1"],
  area_id: "area_cmpc_finanzas",
  sensibles_confirmados: []
};

// --- (C) 🟢 EVALUADOR VIRBAC (L4 DETALLE) ---
const userProfile = {
  id: "696f6405174b6c5725971aaf",
  email: "ghap68@yahoo.com",
  name: "Evaluador Virbac",
  role: "evaluator",
  legacy_role: "evaluator",
  authz_v2_migrated: true,
  roles: ["EVALUADOR_ANALISTA"],
  nivel_info: "DETALLE_RIESGO",
  pn_authorized: false,
  cache_version: 5,
  organizacion_id: "virbac_id",
  pais_ids: ["CL"],
  unidad_ids: [],
  area_id: null,
  sensibles_confirmados: []
};

// --- (D) 🔵 READ ONLY UCSC (L1 RESULTADO GENERAL) ---
const userProfile = {
  id: "6a2971190e276e4dabaa6b6e",
  email: "clsalgado@ucsc.cl",
  name: "Claudio Salgado (UCSC)",
  role: "tenant_admin", // legacy_role copiado en migración
  legacy_role: "tenant_admin",
  authz_v2_migrated: true,
  roles: ["READ_ONLY_TENANT"],
  nivel_info: "RESULTADO_GENERAL", // SOLO 6 columnas en ResultsTable!
  pn_authorized: false,
  cache_version: 4,
  organizacion_id: "ucsc_id",
  pais_ids: ["CL"],
  unidad_ids: [],
  area_id: null,
  sensibles_confirmados: []
};
*/

// ================= APLICA =================
localStorage.setItem('token', 'MOCKED_RBAC_TEST_TOKEN_DO_NOT_USE_PROD_' + Date.now());
localStorage.setItem('user',  JSON.stringify(userProfile));
location.reload();
```

---

## 🔧 DIAGNÓSTICO RÁPIDO (1 minuto si falla algo)
| Síntoma | Causa más probable | Arreglo 1 línea |
|---|---|---|
| **Cualquier request → HTTP 503** `AUTHZ_FORBID_PROD_DB` | Backend conectado a **`duxiter`** prod | Recarga uvicorn con URI `/duxiter-2` en el PATH **no solo querystring** |
| Login → HTTP 401 Unauthorized | JWT secret `VITE_JWT_SECRET` (.env frontend r9) **difiere** de `Settings.jwt_secret` (backend r26 `your-secret-key`) | Haz ambos iguales a `your-secret-key` |
| Consola: `Access-Control-Allow-Origin` blocked (CORS) | Fastcheck API puerto != 8181 o `FASTCHECK_CORS_ORIGINS` vacío | `fastcheck_api/.env` r22 `FASTCHECK_CORS_ORIGINS=*` |
| Redirige a `duxiter.azurianlab.com` (prod Azure) | Variable `VITE_API_BASE_URL` vacía + fallback en [TenantContext.tsx#L31](file:///home/duxiter/duxiter_intermediate/src/contexts/TenantContext.tsx#L31) | Añade las 3 URLs correctamente en `.env` frontend root |
| ResultsTable siempre 7 cols, incluso con usuario D CCU | `useAuth().nivel_info` no se carga (`undefined` → default max) | Mira DevTools → Application → Local Storage → "user" JSON, `nivel_info` debe ser `"RESULTADO_GENERAL"` |
| `/admin/authz/profiles` → 404 Not Found | (a) No Superuser role (Route la oculta); (b) No `lazy` importado en [AdminRoutes.tsx](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx#L23-L38) | Reloguea como (A) Superuser; revisa vite no crash al lazy load (terminal npm run dev) |

---

## ✅ VALIDACIÓN PREVIA BACKEND ANTES DE UI (1 sola línea)
Antes de abrir Vite, confirma backend 100% con suite FULL FASE2:
```bash
cd /home/duxiter/duxiter_intermediate/fastcheck_api && source ../.venv/bin/activate && PYTHONPATH=. MONGODB_URI='mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000' AUTHZ_FORBID_PROD_DB=True AUTHZ_LEGACY_LAYER=False python3 -m pytest tests/ -q 2>&1 | tail -3
```

> ✅ **Resultado esperado**: `90 passed, xxx warnings in x.xx s` (ninguna FAIL). Si 90/90 PASS → cualquier problema de UI es **front-end / env / port / puntamento URL**.

---

### 🗂️ Referencia archivos clave usados en esta guía
| Categoría | Archivo |
|---|---|
| Backend env | [fastcheck_api/.env](file:///home/duxiter/duxiter_intermediate/fastcheck_api/.env) |
| Frontend env | [.env](file:///home/duxiter/duxiter_intermediate/.env) |
| **Script arranque backend staging (1-línea)** | [**start_backend_staging.sh**](file:///home/duxiter/duxiter_intermediate/scripts/start_backend_staging.sh) |
| Backend API main | [main.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/main.py) |
| Auth Service v1 login | [authService.ts](file:///home/duxiter/duxiter_intermediate/src/services/authService.ts) |
| Authz V2 service | [authzService.ts](file:///home/duxiter/duxiter_intermediate/src/services/authzService.ts) |
| Auth Provider V2 hooks | [AuthContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx) |
| HOC `<RequirePermission>` | [RequirePermission.tsx](file:///home/duxiter/duxiter_intermediate/src/components/auth/RequirePermission.tsx) |
| Grant Sensible modal | [GrantSensibleModal.tsx](file:///home/duxiter/duxiter_intermediate/src/components/modals/GrantSensibleModal.tsx) |
| ResultsTable filtro cols | [ResultsTable.tsx](file:///home/duxiter/duxiter_intermediate/src/components/dashboard/ResultsTable.tsx) |
| Admin Profiles Page 3 Tabs | [AuthzProfilesPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/AuthzProfilesPage.tsx) |
| Routes Admin (lazy import) | [AdminRoutes.tsx](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx) |
