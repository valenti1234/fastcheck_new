# GUÍA ARQUITECTURA DUAL-STACK · SWITCH NODE ↔ FASTCHECK (RBAC FASE 0→2)
> **Fecha**: 04.10.2026 · **Objetivo**: Explicar como convivir el backend **Node.js/Express** (`server/src`) + **Python/FastAPI** (`fastcheck_api`) con el **mismo frontend React/Vite** (unico `src/`). Determina COMO activar cada stack.

---

## 📌 TL;DR (Pregunta del usuario: "¿Frontend funciona con DOBLE backend?")

| Pregunta corta | Respuesta |
|---|---|
| Funciona **directamente** con 2 backend a la vez? | ❌ **NO** — `axios apiClient` usa **UNA sola `baseURL`** global por ahora. Debes elegir 1 puerto. |
| Para testing **RBAC / ABAC FASE0/1/2** (90/90 tests): cuál elijo? | ✅ **Sólo FastAPI** (`VITE_API_BASE_URL=http://localhost:8181/api`) |
| ¿Puedo integrar DOBLE backend real (100% features)? | ✅ **SI**, elige **Opción B** (smart axios router, ~50 líneas TS) o **Opción C** (Vite Proxy Dev `vite.config.ts` → frontend 0 cambios). |
| ¿Compatibilidad de datos entre los 2? | ✅ **100%**: ambos se conectan a **MISMO MongoDB `duxiter-2`** (mismos usuarios · mismos resultados · mismos créditos · JWT Mismo secreto `your-secret-key`). Cambias URL y sigues viendo TODO IGUAL. |
| ¿Debo tener Node corriendo para probar RBAC? | ❌ **NO**. FastAPI **ya re-implementó** las 5 rutas legacy mínimas: `/auth/*`, `/rut/lookup`, `/checks/*`, `/usage/*` (montadas en [main.py#L168-L172](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/main.py#L168-L172)). |

---

## 🏗️ 1. Arquitectura real hoy (3 capas)

```
                  ┌───────────────────────────────────────────────┐
                  │  FRONTEND REACT / VITE (único src/)          │
                  │  src/services/api.ts · axios apiClient         │
                  └──────────────────────────┬────────────────────┘
                                             │ HTTP
          ┌──────────────────────────────────┼──────────────────────────┐
          │   (Eliges 1 opción por ahora en  │ .env VITE_API_BASE_URL) │
          ▼                                  ▼                           ▼
┌─────────────────────┐   ┌────────────────────────────┐   ┌───────────────────────────┐
│ NODE EXPRESS        │   │ PYTHON FASTCHECK           │   │ PRODUCCIÓN AZURE          │
│ server/src          │   │ fastcheck_api/             │   │  fastcheck.duxiter.cl     │
│ (Puerto típ. 4040)  │   │ (Puerto SIEMPRE 8181 via   │   │  (sólo deploy oficial)    │
│ 17 controladores    │   │  scripts/start_backend_    │   │                           │
│ (Leyes/AI/Sheriff)  │   │  staging.sh)               │   │                           │
└─────────────────────┘   └────────────────────────────┘   └───────────────────────────┘
          ↓ STORAGE                            ↓ STORAGE                    ↓ STORAGE
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│               MONGODB COMPARTIDO ·  duxiter-2  (staging)  ·  NUNCA duxiter (prod)        │
│  users · results · evaluationresults · auditoria_log · pool_planes · permisos · roles ... │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ 2. ¿Qué gestiona HOY cada backend?

### 2.1 PYTHON FASTCHECK API (nuevo stack RBAC/ABAC)
Montado por proceso dual en [main.py#L168-L174](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/main.py#L168-L174).

| Grupo Rutas | Prefijo URL | Cantidad | Estado (migración) | Tests |
|---|---|---|---|---|
| 🆕 **V2 RBAC/ABAC FASE0/1/2** | `/api/v2/*` | ≥ 43 endpoints | ✅ **100% nativo Python** (authz, users, org, comments, tags, export, gobierno_riesgo, capacidad_pool, workspace, timeline tercero) | Suite 90/90 |
| 🔗 **Compatibilidad V1 legacy** | `/api/auth/*` | 8 endpoints | ✅ **Re-implementado** en FastAPI: login/me/logout/register + JWT dual (token legacy + v2 claim) | 9/9 I1 |
| 🔗 **Compatibilidad V1 legacy** | `/api/rut/lookup` | 3 endpoints | ✅ **Re-implementado** en FastAPI | |
| 🔗 **Compatibilidad V1 legacy** | `/api/checks/*` | 4 endpoints | ✅ **Re-implementado** en FastAPI | |
| 🔗 **Compatibilidad V1 legacy** | `/api/usage/*` | 2 endpoints | ✅ **Re-implementado** en FastAPI | |

### 2.2 NODE EXPRESS (legacy, 17 controladores NO migrados aún)
Estos controladores siguen siendo **exclusivos Node**, **NO existen** en FastAPI hoy. Si tu frontend apunta a `:8181` → **HTTP 404**.

| Controlador · Ruta ejemplo | Vive en Node (`server/src/`) | Funcionalidad |
|---|---|---|
| Sheriff V2 provider | [sheriffV2Service.ts](file:///home/duxiter/duxiter_intermediate/server/src/services/sheriffV2Service.ts) | Llamadas proveedor tercero pagado THE-SHERIFF (antecedentes CH) |
| Equifax provider | [equifaxService.ts](file:///home/duxiter/duxiter_intermediate/server/src/services/equifaxService.ts) | Informes comerciales |
| Ley 21.121 Riesgo Medio | [lpmedioController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/lpmedioController.ts) | Evaluación Ley Chilena Riesgo Gráfico Laboral Medio |
| Ley 20.393 Riesgo Alto | [lpaltoController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/lpaltoController.ts) | Evaluación Ley 20393 Personas Expuestas |
| SNIFA | [snifaController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/snifaController.ts) | Superintendencia Medio Ambiente |
| Casos Anti-Sindicales | [antiunionCaseController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/antiunionCaseController.ts) | Expedientes legales |
| Billing / Créditos legacy | [creditController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/creditController.ts) | Sistema facturación ANTES de FASE2 capacidad_pool (ahora RBAC usa su propia tabla v2) |
| IA · Prompt Config | [ai.controller.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/ai.controller.ts) / [promptConfigurationController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/promptConfigurationController.ts) | LLM Interno FastCheck Eval. |
| Parámetros Evaluación | [evaluationParameterController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/evaluationParameterController.ts) | Umbrales fórmula riesgo (no confundir con **Gobierno Riesgo SENSIBLES** de FASE2 — el SENSIBLE de FASE2 es la versión RBAC+Auditoria Python) |
| Monitoring CRON | [monitoringService.ts](file:///home/duxiter/duxiter_intermediate/server/src/services/monitoringService.ts) | Scheduled tareas tipo CRON |
| Elasticsearch Middleware · Logs Search | [elkMiddleware.ts](file:///home/duxiter/duxiter_intermediate/server/src/middleware/elkMiddleware.ts) + [elasticsearchIndexManager.ts](file:///home/duxiter/duxiter_intermediate/server/src/services/elasticsearchIndexManager.ts) | Búsqueda full-text 17 operaciónes sobre logs Sheriff |
| Resumen / Summary / Reportes PDF · XLSX | [summary.controller.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/summary.controller.ts) | Reportes legacy; export multinivel FASE2 es la nueva versión RBAC en FastAPI |
| Empresas Análisis / SII Scraper | [companyAnalysisController.ts](file:///home/duxiter/duxiter_intermediate/server/src/controllers/companyAnalysisController.ts) + [scraperService.ts](file:///home/duxiter/duxiter_intermediate/server/src/services/scraperService.ts) | Servicio scraping SII + Análisis patrimonial |
| Notas · Notificaciones · Config Ambiente · Admins | userNote · notification · envConfig · adminEvaluations | Configuraciones operativas |
| AI Operation Logs · Sheriff Data Logs | aiOperationLog · sheriffDataLog | Auditoria vendor calls |

---

## 🚦 3. ESTADO ACTUAL: Config .env frontend (qué pasa si eliges 1 solo puerto)

Actualmente `src/services/api.ts` usa **UAN sola instancia axios**. Frontend apunta a UNO SOL0 de los 3 posibles: configurado en el `.env` root por las variables:
```env
REACT_APP_API_URL=...
VITE_API_URL=...
VITE_API_BASE_URL=...
```

### Tabla resultados por elección (HOY sin setup dual)

| `VITE_API_BASE_URL=` | RBAC FASE0/1/2 (Authz/Profiles/Timeline/Pool/Gobierno) | Login + Usuario + Dashboard Histórico | Sheriff + Equifax + Ley 20k + AI + CRON |
|---|---|---|---|
| `http://localhost:8181/api` ✅ **FASTCHECK (Python)** | ✅ 100% — nativo /v2/* | ✅ 100% — re-implementado en FastAPI v1 compat | ❌ **HTTP 404** — controladores NO existen en FastAPI |
| `http://localhost:4040/api` ⚠️ **NODE (Express)** | ⚠️ Funciona PERO en modo **LEGACY** (cae en fallback `ROLE_PERMISSIONS`, NO pasa por pipeline 7 pasos authz-service; `/v2/*` no existe → 404 | ✅ 100% nativo | ✅ 100% nativo |
| `https://fastcheck.duxiter.cl/api` (Prod Azure) | — ❌ NUNCA usar en desarrollo | | |

> **💡 Recomendación test RBAC (90/90 suite FASE2)**: apunta SIEMPRE a **:8181 (FastAPI)**. Únicamente activa Node si necesitas un flujo concreto Sheriff/Equifax/Ley 20k.

---

## 🧩 4. TRES OPCIONES DE SWITCH / INTEGRACIÓN (elige 1)

### 🅰️ Opción A — SIMPLE · Sólo 1 Backend según objetivo
**Workflows recomendados**:
- Flujo **RBAC / Autorizaciones / Perfiles / Timeline / Capacidad Pool / Gobierno Riesgo**
  ```bash
  # 1 Terminal: FastAPI Python (8181)
  cd /home/duxiter/duxiter_intermediate && ./scripts/start_backend_staging.sh
  # 2 Terminal: Frontend Vite (:3000 / :5173)
  cd /home/duxiter/duxiter_intermediate && npm run dev
  # .env FRONTEND ya listo con VITE_API_BASE_URL=http://localhost:8181/api
  ```
  > 🛂 **Credenciales oficiales TEST actualizadas 04/10/2026** (staging `duxiter-2`):
  > Login **`superadmin@gmail.com`** → Password **`SuperAdmin3465#`** (verificada end-to-end: login 200 · JWT valido · /me 200).
- Flujo **Evaluación con proveedor real (Sheriff) + Ley 21k + AI tuning**
  ```bash
  # 1 Terminal: Node Express (:4040 — default script package.json server)
  cd /home/duxiter/duxiter_intermediate/server && npm install && npm run dev
  # 2 Terminal: Frontend Vite (ajusta temporalmente VITE_API_BASE_URL=http://localhost:4040/api)
  ```

✅ Ventajas: 0 código cambiar. ❌ Desventaja: si haces ambos flows → debes editar `.env` + reiniciar vite a cada cambio.

---

### 🅱️ Opción B — DOBLE BACKEND REAL con Axios Smart Router
> **Implementación: ~50 líneas TypeScript en `src/services/api.ts`. El resto del proyecto NO CAMBIA.**

Paso 1 · Modifica [src/services/api.ts](file:///home/duxiter/duxiter_intermediate/src/services/api.ts):
```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import localStorageAuth from '../utils/localStorageAuth'; // helper típico existente para token

// --------- ISTANZA 1: FASTCHECK RBAC + nuevas features -----------
export const apiClientAuthz: AxiosInstance = axios.create({
  baseURL: (import.meta.env.VITE_API_FASTCHECK_URL || 'http://localhost:8181') + '/api',
  timeout: 30000,
});

// --------- ISTANZA 2: NODE LEGACY (Sheriff / Equifax / Leyes) -------
export const apiClientLegacy: AxiosInstance = axios.create({
  baseURL: (import.meta.env.VITE_API_NODE_URL || 'http://localhost:4040') + '/api',
  timeout: 60000, // Sheriff es más lento (llamadas proveedor externo 15~45s)
});

// -------- ISTANZA 3: DEFAULT (nombre apiClient se usa en TODO el proyecto)
//  · Smart routing por path:
//     - /v2/* → Python FastCheck
//     - sheriff/equifax/ley/snifa/antiunion/billing/monitoring/ai/prompts/parameters/summary → NODE
//     - resto (auth/rut/checks/usage/third-parties etc...) → PYTHON FASTCHECK
export const apiClient: AxiosInstance = axios.create({ baseURL: 'about:blank' });

const PREFIJOS_LEGACY_NODE = [
  '/sheriff', '/equifax', '/ley21121', '/ley20393', '/snifa', '/antiunion', '/billing',
  '/credit-legacy', '/monitoring', '/evaluation-parameters', '/prompt-configurations',
  '/ai', '/summary', '/company-analysis', '/reports-legacy',
];

// Interceptor común (attach token Authorization Bearer)
function _attachToken(config: InternalAxiosRequestConfig) {
  const token = localStorageAuth.getToken() || localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

// Aplica interceptor a las 3 instancias
[apiClientAuthz, apiClientLegacy, apiClient].forEach(cli => {
  cli.interceptors.request.use(_attachToken);
  cli.interceptors.response.use(
    (res) => res,
    (err) => { if (err?.response?.status === 401) localStorage.clear(); return Promise.reject(err); }
  );
});

// ⭐ SMART ROUTER: decide baseURL POR CADA LLAMADA en la apiClient default
apiClient.interceptors.request.use((config) => {
  const path = (config.url || '').toString();
  let target;
  if (path.startsWith('/v2')) {
    target = (import.meta.env.VITE_API_FASTCHECK_URL || 'http://localhost:8181') + '/api';
  } else if (PREFIJOS_LEGACY_NODE.some(p => path.startsWith(p))) {
    target = (import.meta.env.VITE_API_NODE_URL || 'http://localhost:4040') + '/api';
  } else {
    target = (import.meta.env.VITE_API_FASTCHECK_URL || 'http://localhost:8181') + '/api';
  }
  config.baseURL = target;
  return config;
});

export default apiClient;
```

Paso 2 · Añade al `.env` frontend (añade 2 vars nuevas, NO borres otras):
```env
# ===== DUAL-STACK (Opcion B Smart Router) =====
VITE_API_FASTCHECK_URL=http://localhost:8181     # Python RBAC /v2/*
VITE_API_NODE_URL=http://localhost:4040          # Node Sheriff / Equifax / Ley
# NOTA: VITE_API_BASE_URL / REACT_APP_API_URL se IGNORAN con Smart Router activo
```

✅ Ventajas: TODO el resto del frontend (47 files) usa `apiClient` SIN CAMBIOS. Un solo axios default ya rutea correctamente.

---

### 🅲️ Opción C — VITE DEV PROXY (Recomendado para Equipo QA / Desarrolladores)
> **0 líneas cambiar en `src/`**. Todo se maneja en **[vite.config.ts](file:///home/duxiter/duxiter_intermediate/vite.config.ts)**. Frontend ve UNA sola URL. Proxy transparente en dev.

Añade / edita la clave `server.proxy` en vite.config.ts:
```ts
// Ejemplo vite.config.ts (agrega dentro de defineConfig({ ... }))
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // ------- Rutas NUEVAS RBAC → PYTHON FastCheck 8181 ---------------
      '/api/v2': {
        target: 'http://localhost:8181',
        changeOrigin: true,
      },
      // ------- Rutas LEGACY proveedor / IA / Leyes → NODE 4040 ----------
      '/api/sheriff':                  { target: 'http://localhost:4040', changeOrigin: true },
      '/api/equifax':                  { target: 'http://localhost:4040', changeOrigin: true },
      '/api/ley21121':                 { target: 'http://localhost:4040', changeOrigin: true },
      '/api/ley20393':                 { target: 'http://localhost:4040', changeOrigin: true },
      '/api/snifa':                    { target: 'http://localhost:4040', changeOrigin: true },
      '/api/antiunion':                { target: 'http://localhost:4040', changeOrigin: true },
      '/api/billing':                  { target: 'http://localhost:4040', changeOrigin: true },
      '/api/monitoring':               { target: 'http://localhost:4040', changeOrigin: true },
      '/api/evaluation-parameters':    { target: 'http://localhost:4040', changeOrigin: true },
      '/api/prompt-configurations':    { target: 'http://localhost:4040', changeOrigin: true },
      '/api/ai':                       { target: 'http://localhost:4040', changeOrigin: true },
      '/api/summary':                  { target: 'http://localhost:4040', changeOrigin: true },
      '/api/company-analysis':         { target: 'http://localhost:4040', changeOrigin: true },
      // ------- RESTO DEFAULT (login, rut, checks, usage, terceros) → FastCheck
      '/api': {
        target: 'http://localhost:8181',
        changeOrigin: true,
      },
    },
  },
});
```

Después configura frontend con URL APUNTANDO AL PROPIO VITE (no a puertos 8181/4040!):
```env
# .env FRONTEND Opción C (Vite Proxy)
REACT_APP_API_URL=http://localhost:3000/api
VITE_API_URL=http://localhost:3000/api
VITE_API_BASE_URL=http://localhost:3000/api
# ↓ vite se encarga de routear /api/* a :8181 / :4040 transparentemente
```

✅ Ventajas: 0 cambios en `src/`. Compatible con todos los tests mock existentes. ❌ Desventaja: solo sirve en **DEV**. En Producción tendrás que replicar el patrón con NGINX / Caddy / Traefik (no problema hoy FASE2 local).

---

## 🚀 5. ¿Cómo levantar 2 backend + frontend en PARALELO? (3 terminales)
Valido para **Opción B y C**.

| # | Terminal | Comando | Qué sube | Puerto |
|---|---|---|---|---|
| ① | 1 | `cd /home/duxiter/duxiter_intermediate && ./scripts/start_backend_staging.sh` | FastCheck Python (RBAC) | **:8181** |
| ② | 2 | `cd /home/duxiter/duxiter_intermediate/server && npm install && npm run dev` | Node Express (Sheriff / Leyes / AI) | **:4040** |
| ③ | 3 | `cd /home/duxiter/duxiter_intermediate && npm run dev` | Frontend Vite | **:3000 / :5173** |

Finalmente abre `http://localhost:3000` o la URL vite:
- Login → va a FastCheck (pipeline 7 pasos authz V2)
- Click en "Perfiles Autorización → /v2" → va a FastCheck
- Click en "Nueva evaluación con Sheriff" → va a Node Express
- **Todo se resuelve automáticamente sin tocar el `.env`**.

---

## 🧪 6. Matriz final de compatibilidad Features × Opción

| Funcionalidad | Opción A (8181 Only FastCheck) | Opción A (4040 Only Node) | Opción B Smart Axios | Opción C Vite Proxy |
|---|---|---|---|---|
| Login JWT Dual | ✅ | ✅ | ✅ | ✅ |
| RBAC · Pipeline 7 pasos authz_service | ✅ nativo | ⚠️ Legacy fallback | ✅ nativo | ✅ nativo |
| Perfiles Admin `/admin/authz/profiles` | ✅ | ❌ 404 | ✅ | ✅ |
| Timeline Tercero HU-17 /history | ✅ | ❌ 404 | ✅ | ✅ |
| Capacidad Pool 5 Planes | ✅ | ❌ 404 | ✅ | ✅ |
| Gobierno Riesgo 4 SENSIBLES / Llamado Q4≥3 | ✅ | ❌ 404 | ✅ | ✅ |
| Export Multinivel N2/N4 | ✅ | ❌ 404 | ✅ | ✅ |
| Comentarios V2 Visibilidad · Etiquetas | ✅ | ❌ 404 | ✅ | ✅ |
| Evaluación **Sheriff real** | ❌ 404 | ✅ | ✅ | ✅ |
| Evaluación **Equifax real** | ❌ 404 | ✅ | ✅ | ✅ |
| Ley 21.121 Riesgo Medio | ❌ 404 | ✅ | ✅ | ✅ |
| Ley 20.393 Riesgo Alto | ❌ 404 | ✅ | ✅ | ✅ |
| Tuning Prompt AI / Parameters | ❌ 404 | ✅ | ✅ | ✅ |
| Monitoring CRON Schedules | ❌ 404 | ✅ (scheduler en server.ts) | ✅ (scheduler Node) | ✅ |
| Elasticsearch Full-Text logs Sheriff | ❌ 404 | ✅ | ✅ | ✅ |
| **Código cambiar** | 0 | 0 | ~50 líneas api.ts | 0 src, 30 lin. vite config |

---

## 📚 Referencias rápidas de archivos en esta guía

| Concepto | Ruta |
|---|---|
| Script inicio FastCheck (Staging) | [scripts/start_backend_staging.sh](file:///home/duxiter/duxiter_intermediate/scripts/start_backend_staging.sh) |
| Guía Prueba Frontend RBAC FASE2 | [GUIA_PRUEBA_FRONTEND_RBAC_ABAC_FASE2.md](file:///home/duxiter/duxiter_intermediate/GUIA_PRUEBA_FRONTEND_RBAC_ABAC_FASE2.md) |
| Main FastAPI (montaje routers v1 + v2) | [fastcheck_api/app/main.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/main.py#L150-L174) |
| .env FRONTEND root | [.env](file:///home/duxiter/duxiter_intermediate/.env#L1-L51) |
| Axios apiClient default | [src/services/api.ts](file:///home/duxiter/duxiter_intermediate/src/services/api.ts) |
| Config Vite dev | [vite.config.ts](file:///home/duxiter/duxiter_intermediate/vite.config.ts) |
| App Node Express entry | [server/src/app.ts](file:///home/duxiter/duxiter_intermediate/server/src/app.ts) |
| Pipeline authz 7 pasos Python | [authz_service.py autorizar()](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/authz_service.py#L451-L533) |
