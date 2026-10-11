# Documentación: Roles, Tenants, RBAC y Perfiles de Usuario
> Sistema Duxiter Intermediate
> Última actualización: Octubre 2026

---

## 1. Arquitectura General

El sistema implementa un modelo **Multi-Tenant** con **Control de Acceso Basado en Roles (RBAC)** distribuido en tres capas:

| Capa | Ubicación | Propósito |
|------|-----------|-----------|
| Frontend Auth Context | [AuthContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx#L26-L126) | Gestión de sesión, estado de usuario y token |
| Frontend Route Guards | [src/components/auth/](file:///home/duxiter/duxiter_intermediate/src/components/auth) + [App.tsx](file:///home/duxiter/duxiter_intermediate/src/App.tsx) | Protección de rutas y redirecciones por rol |
| Backend FastAPI | [fastcheck_api/app/](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app) | Validación JWT, permisos RBAC y aislamiento por tenant |

---

## 2. Sistema de Roles

### 2.1 Roles Definidos (5 roles)

Los roles están definidos en:
- Frontend Types: [auth.ts#L5](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts#L5-L5) — Unión discriminada: `'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only'`
- Backend RBAC: [dependencies.py#L86-L182](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L86-L182) — Diccionario `ROLE_PERMISSIONS`

---

### 2.2 Matriz de Permisos (RBAC)

Fuente única de verdad: [dependencies.py#L86-L182](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L86-L182)

| Permiso | superuser | tenant_admin | evaluator | read_only | write_only |
|---------|:---------:|:------------:|:---------:|:---------:|:----------:|
| `user:create` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `user:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `user:update` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `user:delete` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `evaluation:create` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `evaluation:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `evaluation:update` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `evaluation:delete` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `evaluation:bulk` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `company:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company:update` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `rut:lookup` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `rut:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `sheriff:logs:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `monitoring:create` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `monitoring:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `monitoring:update` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `monitoring:delete` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `monitoring:execute` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `tenant:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tenant:update` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `tenant:users:manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `admin:dashboard` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `admin:settings` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `admin:logs` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `notification:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `notification:create` | ✅ | ✅ | ❌ | ❌ | ✅ |

#### 2.2.1 Implementación Backend

Función de dependencia: [dependencies.py#L185-L195](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L185-L195)

```python
def require_permission(permission: Permission):
    async def _dep(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        perms = ROLE_PERMISSIONS.get(user.role, set())
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Forbidden: Insufficient permissions", "required": permission, "userRole": user.role},
            )
        return user
    return _dep
```

Uso en routers: `Depends(require_permission("evaluation:create"))`

---

### 2.3 Descripción de cada Rol

| Rol | Alcance | Caso de Uso |
|-----|---------|-------------|
| **`superuser`** | Global (todos los tenants) | Administrador de plataforma Duxiter. Acceso a panel `/admin/*`, gestión completa de tenants, usuarios y configuración global. |
| **`tenant_admin`** | Dentro de su tenant | Jefe/Administrador de una empresa cliente. Gestiona usuarios de su tenant, créditos, configuraciones y tiene full acceso a evaluaciones. |
| **`evaluator`** | Dentro de su tenant | Analista / Evaluador. Puede crear/editar/eliminar evaluaciones, ver reportes, gestionar monitoreos. No gestiona usuarios ni configuraciones de tenant. |
| **`read_only`** | Dentro de su tenant | Auditor / Consultor. Solo lectura: evaluaciones, empresas, logs, monitoreos. Sin escritura de ningún tipo. |
| **`write_only`** | Dentro de su tenant | Integración / API / Robot. Puede crear evaluaciones y ejecutar monitoreos, con lectura limitada. Pensado para servicios que consumen la API. |

---

## 3. Entidad Usuario (User)

### 3.1 Interfaz Frontend
[auth.ts#L1-L8](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts#L1-L8)

```typescript
export interface User {
  id: string;                    // MongoDB ObjectId
  email: string;                 // Email único (normalizado lowercase)
  name: string;                  // Nombre visible
  role: UserRole;                // 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only'
  defaultTenantId: string;       // Tenant por defecto al login
  tenants: string[];             // Array de IDs de tenants a los que pertenece (multi-tenant)
}
```

### 3.2 Schema Backend (MongoDB Collection: `users`)

Campos relevantes (inferidos de [auth_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/auth_service.py) y [dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py)):
- `_id`: ObjectId
- `email`: string (índice único, lowercase)
- `password`: string (hash bcrypt)
- `name`: string
- `role`: string
- `tenant`: ObjectId | null (tenant principal — null para superusers)
- `isActive`: boolean (flag de activación manual por superadmin)
- `createdAt`: Date
- `lastLogin`: Date | null

---

### 3.3 Ciclo de Vida del Usuario

| Estado | Trigger | Validador |
|--------|---------|-----------|
| **Pendiente de activación** | Registro exitoso | Cuenta creada con `isActive: false` |
| **Error 401 `ACCOUNT_NOT_ACTIVATED`** | Intento de login con `isActive=false` | [auth_service.py#L16-L17](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/auth_service.py#L16-L17) + [dependencies.py#L53-L57](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L53-L57) |
| **Activo** | Superadmin cambia `isActive: true` | Endpoint `/users/{id}/superadmin-toggle-status` |
| **Suspendido** | Superadmin cambia `isActive: false` | Mismo endpoint — bloquea login y todas las rutas |

> **Hard Constraint**: La activación de cuentas nuevas requiere aprobación manual del superadmin. No hay auto-activación.

---

## 4. Entidad Tenant

### 4.1 Interfaz Frontend
[tenant.ts#L1-L13](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts#L1-L13)

```typescript
export interface Tenant {
  id: string;
  name: string;                                    // Nombre empresa
  slug: string;                                    // URL-friendly identifier
  plan: 'free' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  createdAt: string;
  usageStats: {
    evaluationsTotal: number;
    evaluationsRemaining: number;
    lastEvaluationDate: string | null;
  };
}
```

### 4.2 Estructura Extendida (AdminPanel)
[TenantManagementPage.tsx#L6-L22](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantManagementPage.tsx#L6-L22) añade:
- `isActive: boolean`
- `creditBalance.availableCredits: number`
- `creditBalance.totalCreditsUsed: number`
- `creditBalance.lastCreditOperation: string | null`
- `updatedAt: string`

### 4.3 Planes y Estados

| Plan | Descripción (implícita) |
|------|-------------------------|
| `free` | Plan gratuito, créditos limitados |
| `basic` | Plan básico pago |
| `premium` | Plan avanzado |
| `enterprise` | Plan corporativo |

| Status / Flag | Efecto |
|---------------|--------|
| `status: 'active'` + `isActive: true` | Operaciones normales |
| `status: 'suspended'` o `isActive: false` | Login denegado con error `TENANT_NOT_ACTIVATED` — [dependencies.py#L70-L75](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L70-L75) |
| `status: 'cancelled'` | Tenant dado de baja |

---

### 4.4 Criterio de Tenant "Activo" (Estadísticas)
Fuente: [TENANT_ACTIVE_CRITERIA.md](file:///home/duxiter/duxiter_intermediate/TENANT_ACTIVE_CRITERIA.md)

> **Un tenant se considera "activo" si ha consumido al menos 1 crédito de evaluación.**

Implementación (referenciada en el doc): agregación sobre la colección `CreditOperation` filtrando `operationType: 'evaluation'` AND `creditsChanged < 0`, agrupado por `tenantId`.

Categorías adicionales:
- **Recientemente activo**: última evaluación en los últimos 30 días
- **Heavy users**: >50 evaluaciones
- **Moderate users**: 11-50 evaluaciones
- **Light users**: 1-10 evaluaciones

> **Hard Constraint**: Los documentos `Result` históricos son inmutables; no se re-calcula riesgo en endpoints GET.

---

### 4.5 Usuarios dentro de un Tenant (TenantUser)
[tenant.ts#L15-L23](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts#L15-L23)

```typescript
export interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: 'tenant_admin' | 'evaluator';        // Solo estos 2 roles dentro del tenant
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  lastLogin: string | null;
}
```

---

## 5. Autenticación

### 5.1 Flujo JWT (Backend)

#### 5.1.1 Generación del Token
[security.py#L42-L53](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L42-L53)

```python
def create_access_token(*, user_id: str, email: str, role: str, tenant_id: str) -> str:
    payload = {
        "id": user_id,
        "email": email,
        "role": role,
        "tenant": tenant_id,     # Aislamiento multi-tenant embebido en JWT
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
```

#### 5.1.2 Configuración de Expiración
[security.py#L20-L33](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L20-L33)
- Formato soportado: `{número}{s|m|h|d}` (ej: `"7d"` = 7 días)
- Default: 7 días si el valor no parsea

#### 5.1.3 Validación de Token + Chain of Trust
[dependencies.py#L26-L80](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L26-L80) — `get_current_user()`

```
Paso 1: Extraer Bearer token del header
Paso 2: Decodificar JWT (firma HS256 + expiración)
Paso 3: Validar que payload tenga id, email, role, tenant NO vacíos
Paso 4: Buscar usuario en DB → validar isActive==true (si no → 403 ACCOUNT_NOT_ACTIVATED)
Paso 5: Validar que tenant del JWT coincida con tenant almacenado en el user doc
Paso 6: SI role ≠ superuser → buscar tenant en DB → validar isActive==true (si no → 403 TENANT_NOT_ACTIVATED)
Paso 7: Inyectar CurrentUser en request.state.current_user y tenant_id en request.state.tenant_id
```

#### 5.1.4 Password Hashing
[security.py#L35-L39](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py#L35-L39) — `bcrypt` con salt por defecto.

---

### 5.2 Servicio Auth Frontend
[authService.ts#L14-L223](file:///home/duxiter/duxiter_intermediate/src/services/authService.ts#L14-L223) — Clase estática `AuthService`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `login(credentials)` | `POST /auth/login` | 401 con `activationStatus: pending` para cuentas inactivas |
| `register(data)` | `POST /auth/register` | Crea usuario + tenant inicial (`companyName`) |
| `getCurrentUser()` | `GET /auth/me` | Refresca perfil desde backend |
| `logout()` | `POST /auth/logout` | Limpia token en localStorage (siempre, aunque falle backend) |
| `changePassword()` | `POST /auth/change-password` | Requiere contraseña actual |
| `requestPasswordReset(email)` | `POST /auth/forgot-password` | Envía email con token |
| `resetPassword(token, newPwd)` | `POST /auth/reset-password` | Token de un solo uso |
| `verifyEmail(token)` | `POST /auth/verify-email` | Verificación email |
| `resendEmailVerification()` | `POST /auth/resend-verification` | Reenvío de email |
| `refreshSession()` | n/a | Compuesto: `getCurrentUser()` + `logout()` si falla |
| `isAuthenticated()` | n/a | Checkeo síncrono por presencia de token en localStorage |

---

### 5.3 AuthContext (React Provider)
[AuthContext.tsx#L26-L126](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx#L26-L126)

Estado expuesto por `useAuth()`:
```typescript
{
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login, register, logout, handleOAuthCallback;
}
```

Bootstrapping (`useEffect` L49-58):
1. Lee `token` de `localStorage.getItem('token')`
2. Si existe → llama `fetchUserData()` → `AuthService.getCurrentUser()`
3. Si falla → limpia token y estado (logout silencioso)

---

## 6. Aislamiento Multi-Tenant

### 6.1 Middleware de Contexto (Backend)
[tenant_context.py#L7-L11](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/middleware/tenant_context.py#L7-L11)

Inicializa `request.state.tenant_id = None` **antes** de que corran las dependencias. Luego `get_current_user()` ([dependencies.py#L79](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py#L79)) lo sobrescribe con el valor validado del JWT.

> **Hard Constraint**: Toda query a DB **debe** incluir `tenantId` como filtro. El valor safe está en `request.state.tenant_id`.

---

### 6.2 TenantContext Frontend
[TenantContext.tsx#L33-L90](file:///home/duxiter/duxiter_intermediate/src/contexts/TenantContext.tsx#L33-L90)

Estado expuesto por `useTenant()`:
```typescript
{
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  updateTenant(tenant: Tenant) => void;  // Mutación optimista
}
```

- Fetch: `GET /tenant` (con Bearer token) — ejecuta automáticamente cuando `isAuthenticated` cambia
- Tratamiento especial **superusers**: si `GET /tenant` retorna 404 → no es error, es comportamiento esperado (superuser no tiene tenant asociado)
- Inconsistencias detectadas: el provider define `Tenant` interno con `_id` y `usageStats.evaluationsUsed`, distinto del [tenant.ts](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts) que usa `id` y `evaluationsTotal`.

---

## 7. Guardias de Rutas (Frontend)

### 7.1 Resumen de Componentes

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| `ProtectedRoute` | [ProtectedRoute.tsx#L6-L25](file:///home/duxiter/duxiter_intermediate/src/components/auth/ProtectedRoute.tsx#L6-L25) | Base: requiere `isAuthenticated`. Envuelve con `DashboardLayout`. Si no auth → `/login` (con `state.from` para deep-link) |
| `RoleProtectedRoute` | [RoleProtectedRoute.tsx#L10-L25](file:///home/duxiter/duxiter_intermediate/src/components/auth/RoleProtectedRoute.tsx#L10-L25) | Requiere `user.role === role` exacto. Si no → `/dashboard`. Acepta `layout` opcional. |
| `SuperuserBlockedRoute` | [SuperuserBlockedRoute.tsx#L9-L24](file:///home/duxiter/duxiter_intermediate/src/components/auth/SuperuserBlockedRoute.tsx#L9-L24) | **Bloquea** acceso a `superuser`. Si es superuser → `/admin`. |
| `RoleBasedRedirect` | [RoleBasedRedirect.tsx#L4-L18](file:///home/duxiter/duxiter_intermediate/src/components/auth/RoleBasedRedirect.tsx#L4-L18) | Ruta "/" y auth-callback: `superuser` → `/admin`, resto → `/dashboard`. |

---

### 7.2 Estructura de Rutas (App.tsx)
[App.tsx#L62-L111](file:///home/duxiter/duxiter_intermediate/src/App.tsx#L62-L111)

```
├── PUBLICAS: /, /login, /register, /auth/callback, /terms, /privacy, /debug/audit
└── PROTEGIDAS (ProtectedRoute wrapper)
    ├── Usuarios generales autenticados
    │   ├── /dashboard (SuperuserBlocked)
    │   ├── /company/lookup, /evaluations/*, /consultas/*
    │   ├── /alerting/*, /monitoring, /help
    │   ├── /fast-chec-ex/*, /fast-check-ex (SuperuserBlocked)
    │   └── RoleProtectedRoute [tenant_admin]
    │       ├── /tenant/users, /tenant/settings
    │       └── /tenant/lpalto, /tenant/lpmedio
    └── /admin/* (AdminRoutes → RoleProtectedRoute [superuser])
        ├── /admin (AdminDashboard)
        ├── /admin/tenants (TenantManagementPage)
        ├── /admin/tenants/:tenantId/users (TenantUsersPage)
        ├── /admin/users (SuperAdminUsersPage)
        ├── /admin/billing (TenantBillingPage)
        ├── /admin/evaluation-settings, /admin/prompt-configuration
        ├── /admin/env-configuration, /admin/database
        ├── /admin/ley20393, /admin/ley21121
        ├── /admin/sheriff-monitor, /admin/equifax-monitor
        ├── /admin/sheriff-log/:id
        ├── /admin/monitoring, /admin/evaluations-summary, /admin/results
        ├── /admin/antiunion-cases, /admin/snifa-import
        └── [+18 subrutas]
```

**AdminRoutes**: [AdminRoutes.tsx#L25-L50](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx#L25-L50) — todo el subárbol `/admin/*` está envuelto en `<RoleProtectedRoute role="superuser">`. Si un `tenant_admin` intenta `/admin` → redirección a `/dashboard`.

---

## 8. Páginas de Gestión (Admin / Tenant)

### 8.1 SuperAdminUsersPage (Gestión Global de Usuarios)
[SuperAdminUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/SuperAdminUsersPage.tsx)

**Solo superuser.** Funcionalidades:
- `fetchUsers()` → `GET /users/superadmin/all`
- Editar usuario (name, email, role) → `PUT /users/{id}/superadmin-update`
- Resetear contraseña (sin conocer la actual) → `PATCH /users/{id}/superadmin-reset-password`
- (Implícito por patrón): Activar/desactivar usuario → `PATCH /users/{id}/superadmin-toggle-status`

Roles disponibles en el select de edición: mismo enum `'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only'`.

---

### 8.2 TenantManagementPage (Gestión de Tenants)
[TenantManagementPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantManagementPage.tsx)

**Solo superuser.** CRUD completo:

| Acción | Endpoint | Campos gestionados |
|--------|----------|--------------------|
| Listar | `GET /tenant/all` | Nombre, isActive, usageStats, creditBalance, fechas |
| Crear | `POST /tenant` | name + availableCredits (default 100) |
| Editar | `PATCH /tenant/{id}` | name + availableCredits (preserva totalUsed y lastOp) |
| Eliminar | `DELETE /tenant/{id}` | Validación de integridad (error en response.data.message) |
| Navegar usuarios | link → | `/admin/tenants/{tenantId}/users` |

---

### 8.3 TenantUsersPage (Usuarios de un Tenant)
[TenantUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantUsersPage.tsx)

**Solo superuser** (está bajo `/admin/*`).
- Obtiene `tenantId` por URL params
- `GET /tenant/{tenantId}` — datos tenant
- `GET /tenant/{tenantId}/users` — lista usuarios
- Badges de role: `superuser`=morado, `tenant_admin`=azul, `evaluator`=verde
- Activar/Desactivar usuario → `PATCH /users/{id}/superadmin-toggle-status`

---

### 8.4 TenantUsers (Tenant Admin)
[App.tsx#L98](file:///home/duxiter/duxiter_intermediate/src/App.tsx#L98-L98) — Ruta `/tenant/users` bajo `RoleProtectedRoute [tenant_admin]`.
Gestiona usuarios pero **solo dentro de su propio tenant** (no tiene superpoderes).

---

## 9. Facturación, Créditos y Planes

### 9.1 Modelos de Billing
[billing.ts#L1-L185](file:///home/duxiter/duxiter_intermediate/src/types/billing.ts#L1-L185)

| Interfaz | Uso |
|----------|-----|
| `TenantBilling` | Factura mensual por tenant: usage (evaluations, api, tokens, storage, bandwidth), costs, invoice status |
| `TrafficReport` | Reporte diario de tráfico + stats del período |
| `BillingSettings` | Configuración global de precios: $/evaluation, $/apiCall, $/1000tokens, $/GB storage/bandwidth, impuestos, días vencimiento |
| `CreditOperation` | Registro atómico de movimientos: `evaluation`, `api_call`, `credit_purchase`, `credit_refund` — con `creditsUsed`/`creditsRemaining` |
| `TenantCreditBalance` | Saldo consolidado: total / used / remaining |
| `CreditStats` | Estadísticas agregadas mensuales (overview + por tenant + por tipo operación + top balances) |

Estados de factura (`TenantBilling.invoice.status`):
`pending` → `sent` → `paid` (o `overdue` si pasa dueDate)

---

### 9.2 TenantBillingPage (Panel Facturación)
[TenantBillingPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantBillingPage.tsx) — **Solo superuser.**

4 tabs:
1. **Invoices** — Filtros por status/mes/año/rango, actualizar estado, descargar
2. **Traffic** — Reportes de tráfico
3. **Credits** — Estadísticas créditos + `AddCreditsModal` para acreditar créditos a un tenant (handler `handleCreditsAdded` refresh stats)
4. **Settings** — Configuración de precios globales

---

## 10. Endpoints Auth + Users (resumen)

### Backend Fastcheck API
[auth.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/auth.py)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | ❌ | Retorna `{token, user}` |
| GET | `/auth/me` | ✅ | Perfil usuario actual |
| POST | `/auth/refresh` | ✅ | Nuevo JWT con misma identidad |

### Frontend Legacy API (Node.js implícito por apiClient)
Usado por `SuperAdminUsersPage`, `TenantManagementPage`, `TenantUsersPage`:

| Método | Ruta | Rol requerido |
|--------|------|---------------|
| GET | `/users/superadmin/all` | superuser |
| PUT | `/users/{id}/superadmin-update` | superuser |
| PATCH | `/users/{id}/superadmin-reset-password` | superuser |
| PATCH | `/users/{id}/superadmin-toggle-status` | superuser |
| GET | `/tenant/all` | superuser |
| GET | `/tenant/{id}` | superuser (o tenant_admin propio) |
| POST | `/tenant` | superuser |
| PATCH | `/tenant/{id}` | superuser |
| DELETE | `/tenant/{id}` | superuser |
| GET | `/tenant/{id}/users` | superuser |

---

## 11. Resumen de Hard Constraints (Project Memory)

✅ **Obligatorios**:
1. **Matching RUT**: 3 niveles de fallback (normalizado → solo dígitos → base-8)
2. **Todo en español**: código y documentación
3. **Aislamiento datos**: `tenantId` SIEMPRE en queries (fuente: `request.state.tenant_id`)
4. **Result históricos inmutables**: nunca re-calcular riesgo en endpoints GET
5. **Cuenta nueva**: requiere activación manual superadmin (`isActive=false` por defecto)
6. **Tenant inactivo**: bloquea acceso a TODOS sus usuarios, aunque estén activos individualmente
7. **Superuser**: NO puede acceder a rutas de workspace tenant (`SuperuserBlockedRoute`)

---

## 12. Archivos Clave Referenciados

| Propósito | Path | Líneas clave |
|-----------|------|--------------|
| Tipos Usuario/Roles | [auth.ts](file:///home/duxiter/duxiter_intermediate/src/types/auth.ts) | #L1-L20 |
| Tipos Tenant | [tenant.ts](file:///home/duxiter/duxiter_intermediate/src/types/tenant.ts) | #L1-L23 |
| Tipos Billing/Créditos | [billing.ts](file:///home/duxiter/duxiter_intermediate/src/types/billing.ts) | #L1-L185 |
| AuthContext React | [AuthContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/AuthContext.tsx) | #L26-L126 |
| TenantContext React | [TenantContext.tsx](file:///home/duxiter/duxiter_intermediate/src/contexts/TenantContext.tsx) | #L33-L90 |
| AuthService Frontend | [authService.ts](file:///home/duxiter/duxiter_intermediate/src/services/authService.ts) | #L14-L223 |
| Route Guards | [src/components/auth/](file:///home/duxiter/duxiter_intermediate/src/components/auth) | 4 archivos |
| App Router | [App.tsx](file:///home/duxiter/duxiter_intermediate/src/App.tsx) | #L62-L111 |
| Admin Sub-routes | [AdminRoutes.tsx](file:///home/duxiter/duxiter_intermediate/src/routes/AdminRoutes.tsx) | #L25-L50 |
| SuperUser Gestión Usuarios | [SuperAdminUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/SuperAdminUsersPage.tsx) | inicio L1 |
| Gestión Tenants | [TenantManagementPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantManagementPage.tsx) | inicio L1 |
| Usuarios por Tenant (Admin) | [TenantUsersPage.tsx](file:///home/duxiter/duxiter_intermediate/src/pages/admin/TenantUsersPage.tsx) | inicio L1 |
| JWT Security | [security.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/core/security.py) | #L35-L65 |
| RBAC + get_current_user | [dependencies.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/dependencies.py) | #L18-L195 |
| AuthService Backend | [auth_service.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/services/auth_service.py) | #L9-L47 |
| Router Auth API | [auth.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/api/v1/routers/auth.py) | #L16-L66 |
| Tenant Middleware | [tenant_context.py](file:///home/duxiter/duxiter_intermediate/fastcheck_api/app/middleware/tenant_context.py) | #L7-L11 |
| Criterios Tenants Activos | [TENANT_ACTIVE_CRITERIA.md](file:///home/duxiter/duxiter_intermediate/TENANT_ACTIVE_CRITERIA.md) | doc completo |
