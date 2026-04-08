# Descripción del Proyecto Duxiter

## 1. Resumen del Proyecto

Duxiter es una aplicación web diseñada como una Plataforma de Evaluación de Proveedores. Permite a los usuarios registrarse, iniciar sesión y realizar evaluaciones de proveedores. El sistema parece soportar diferentes roles de usuario (ej. admin, admin de tenant, evaluador) y gestiona tenants, que  representan diferentes organizaciones cliente que utilizan la plataforma. Las funcionalidades clave incluyen evaluaciones individuales y masivas, búsquedas de empresas, y visualización de resultados y resúmenes de evaluaciones. El proyecto también incluye características administrativas para gestionar usuarios y ver registros (ej. registros Sheriff).

El proyecto está estructurado como una aplicación full-stack con un frontend separado (React/TypeScript) y backend (Node.js/Express/TypeScript).

## 2. Tecnologías Utilizadas

*   **Frontend:**
    *   React ( con Vite como herramienta de construcción, inferido de `vite.config.ts` y estructura de `index.html`)
    *   TypeScript
    *   Tailwind CSS (inferido de `tailwind.config.js`, `postcss.config.js`)
    *   Axios (para comunicación con API, visto en `src/services/api.ts`)
    *   React Router (inferido de la estructura típica de proyectos React y necesidades de navegación)
*   **Backend:**
    *   Node.js
    *   Express.js
    *   TypeScript
    *   MongoDB (base de datos, inferido de `VITE_MONGODB_URI` en `.env` y `server/src/config/db.ts`)
    *   Mongoose (ODM para MongoDB, inferido de archivos de modelo como `server/src/models/User.ts`)
    *   JWT (para autenticación, inferido de `VITE_JWT_SECRET` en `.env` y middleware de auth)
    *   Swagger/OpenAPI (para documentación de API, visto en `server/src/config/swagger.ts` y `server/src/index.ts`)
    *   Helmet (para headers de seguridad)
    *   Express-rate-limit (para limitación de velocidad de API)
    *   Cors (para Cross-Origin Resource Sharing)
*   **Herramientas de Desarrollo y Construcción:**
    *   ESLint (inferido de `eslint.config.js`)
    *   Jest (para testing, inferido de `jest.config.js` y `rut.test.ts`)
    *   npm o yarn (gestión de paquetes, inferido de `package.json`)
*   **Despliegue:**
    *   Nginx (como proxy reverso, basado en interacciones previas)
    *   Docker (potencialmente, aunque no directamente visible en los listados de archivos)

## 3. Frontend (`src/`)

La aplicación frontend está construida con React y TypeScript, ubicada en el directorio [`src`](src/).

### 3.1. Estructura

*   **[`src/assets`](src/assets/)**: Recursos estáticos como imágenes (ej. `duxiter_logo.png`).
*   **[`src/components`](src/components/)**: Componentes de UI reutilizables.
    *   **[`src/components/auth`](src/components/auth/)**: Componentes relacionados con autenticación (ej. `ProtectedRoute.tsx`, `RoleProtectedRoute.tsx`).
    *   **[`src/components/common`](src/components/common/)**: Componentes comunes de propósito general (ej. `PageLoader.tsx`).
    *   **[`src/components/layouts`](src/components/layouts/)**: Componentes de layout (ej. `DashboardLayout.tsx`).
    *   **[`src/components/modals`](src/components/modals/)**: Componentes de diálogo modal (ej. `UserModal.tsx`).
*   **[`src/contexts`](src/contexts/)**: Proveedores de React Context API para gestión de estado global (ej. `AuthContext.tsx`, `TenantContext.tsx`).
*   **[`src/models`](src/models/)**: Modelos/tipos de datos del frontend, reflejando estructuras del backend (ej. `evaluation.ts`).
*   **[`src/pages`](src/pages/)**: Componentes de página de nivel superior representando diferentes vistas/rutas.
    *   **[`src/pages/admin`](src/pages/admin/)**: Páginas para usuarios administrativos (ej. `AdminDashboard.tsx`, `SheriffLogDetailPage.tsx`).
    *   **[`src/pages/auth`](src/pages/auth/)**: Páginas de autenticación (ej. `Login.tsx`, `Register.tsx`).
    *   **[`src/pages/dashboard`](src/pages/dashboard/)**: Página principal del dashboard.
    *   **[`src/pages/evaluations`](src/pages/evaluations/)**: Páginas relacionadas con evaluaciones (ej. `SingleEvaluation.tsx`, `BulkEvaluation.tsx`, `EvaluationsSummaryPage.tsx`).
    *   **[`src/pages/tenant`](src/pages/tenant/)**: Páginas para gestión de tenants (ej. `TenantSettings.tsx`, `TenantUsers.tsx`).
    *   Otras páginas como `CompanyLookup.tsx`, `LandingPage.tsx`, `NotFound.tsx`.
*   **[`src/services`](src/services/)**: Módulos para interactuar con la API del backend (ej. `api.ts`, `companyService.ts`, `evaluationService.ts`).
*   **[`src/types`](src/types/)**: Definiciones de tipos TypeScript para varias estructuras de datos (ej. `auth.ts`, `evaluation.ts`, `sheriff.ts`, `tenant.ts`).
*   **[`src/utils`](src/utils/)**: Funciones de utilidad (ej. `rut.test.ts` sugiere utilidades de validación de RUT).
*   **Puntos de entrada principales**: [`main.tsx`](src/main.tsx), [`App.tsx`](src/App.tsx), [`index.html`](index.html).
*   **Configuración**: `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`.

### 3.2. Características y Componentes Clave

*   Autenticación de Usuario (Login, Registro)
*   Rutas Protegidas basadas en estado de autenticación y roles de usuario.
*   Dashboard para usuarios autenticados.
*   Evaluación de Proveedores (individual y masiva).
*   Visualización de Resultados y Resúmenes de Evaluaciones.
*   Búsqueda de Empresas.
*   Gestión de Tenants (configuraciones, usuarios).
*   Funcionalidades de Admin (dashboard, visualización de registros).
*   Gestión de estado global para información de Auth y Tenant.

## 4. Backend (`server/src/`)

La API del backend está construida con Node.js, Express y TypeScript, ubicada en el directorio [`server/src`](server/src/).

### 4.1. Estructura

*   **[`server/src/config`](server/src/config/)**: Archivos de configuración para base de datos (`db.ts`, `database.ts`), Swagger (`swagger.ts`).
*   **[`server/src/controllers`](server/src/controllers/)**: Manejadores de solicitudes que interactúan con servicios y modelos (ej. `auth.controller.ts`, `evaluation.controller.ts` - asumido, `user.controller.ts`, `tenant.controller.ts`).
*   **[`server/src/middleware`](server/src/middleware/)**: Funciones de middleware de Express (ej. `auth.middleware.ts` para autenticación, `role.middleware.ts` para control de acceso basado en roles).
*   **[`server/src/models`](server/src/models/)**: Modelos de Mongoose definiendo el esquema de base de datos (ej. `User.ts`, `Company.ts`, `Evaluation.ts`, `Tenant.model.ts`, `SheriffDataLog.ts`).
*   **[`server/src/routes`](server/src/routes/)**: Módulos de router de Express definiendo endpoints de API (ej. `auth.routes.ts`, `user.routes.ts`, `evaluation.routes.ts`, `tenant.routes.ts`). El router principal es [`server/src/routes/index.ts`](server/src/routes/index.ts).
*   **[`server/src/scripts`](server/src/scripts/)**: Scripts de utilidad (ej. `migrate-tenant-usage.ts`).
*   **[`server/src/services`](server/src/services/)**: Módulos de lógica de negocio que interactúan con modelos y servicios externos (ej. `auth.service.ts`, `evaluationService.ts`, `userService.ts`, `OpenAIService.ts`, `siiService.ts`, `sheriffService.ts`).
*   **[`server/src/types`](server/src/types/)**: Definiciones de tipos TypeScript específicas del backend.
*   **Punto de entrada principal**: [`server/src/index.ts`](server/src/index.ts) que configura la aplicación Express, middleware, rutas y arranca el servidor.
*   **Configuración de Entorno**: [`server/.env`](server/.env) (aunque también se usa el `.env` principal en la raíz).

### 4.2. Características y Componentes Clave

*   API RESTful para interacción con el frontend.
*   Autenticación y autorización de usuarios (basada en JWT).
*   Operaciones CRUD para Usuarios, Tenants, Evaluaciones, Empresas.
*   Servicios para manejar lógica de negocio compleja relacionada con evaluaciones, gestión de usuarios, etc.
*   Integración con servicios externos (OpenAI, SII, Sheriff).
*   Documentación de API vía Swagger.
*   Medidas de seguridad (Helmet, limitación de velocidad).
*   Interacción con base de datos vía Mongoose.

## 5. Base de Datos

*   El proyecto utiliza **MongoDB** como su base de datos principal.
*   La configuración se gestiona en [`server/src/config/db.ts`](server/src/config/db.ts) y la URI de conexión se especifica en el archivo `.env` (`VITE_MONGODB_URI`).
*   **Mongoose** se utiliza como el Object Data Mapper (ODM) para interactuar con MongoDB, con esquemas definidos en [`server/src/models`](server/src/models/).

## 6. Despliegue y Entorno

*   La aplicación se sirve vía **Nginx**, que actúa como un proxy reverso tanto para el frontend (aplicación React) como para la API del backend.
*   Nginx maneja la terminación SSL y redirección de HTTP a HTTPS.
*   Las variables de entorno se gestionan a través de archivos `.env` en la raíz del proyecto y dentro del directorio `server/`. Estas variables configuran conexiones de base de datos, claves de API (secreto JWT, token de API Sheriff), puertos del servidor y URLs base de API.
*   El backend incluye limitación de velocidad y headers de seguridad (Helmet) para preparación de producción.

## 7. Resumen de Funcionalidades Principales

*   **Gestión de Usuarios:** Registro, login, roles de usuario, gestión de contraseñas.
*   **Gestión de Tenants:** Instancias específicas de organización de la plataforma, gestión de usuarios dentro de tenants.
*   **Evaluación de Proveedores:**
    *   Realizar evaluaciones individuales y masivas de proveedores.
    *   Procesar y almacenar datos de evaluación.
    *   Mostrar resultados y resúmenes de evaluaciones.
*   **Información de Empresas:** Búsqueda y visualización de detalles de empresas.
*   **Scraping/Integración de Datos:** Servicios como `scraperService.ts`, `siiService.ts`, `sheriffService.ts` sugieren integración con fuentes de datos externas o web scraping para enriquecer datos de proveedores.
*   **Integración con IA:** `OpenAIService.ts` sugiere el uso de OpenAI para algunas características, posiblemente relacionadas con análisis de datos o procesamiento en evaluaciones.
*   **Administración:** Dashboard para admins, logging (registros de datos Sheriff).

Este documento proporciona una visión general de alto nivel basada en la estructura de archivos del proyecto e interacciones previas. Se requeriría una inmersión más profunda en archivos específicos para una comprensión más granular de la implementación de cada componente.