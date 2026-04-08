# Duxiter Project Description

## 1. Project Overview

Duxiter is a web application designed as a Provider Evaluation Platform. It allows users to register, log in, and perform evaluations of suppliers. The system appears to support different user roles (e.g., admin, tenant admin, evaluator) and manages tenants, which likely represent different client organizations using the platform. Key functionalities include single and bulk evaluations, company lookups, and viewing evaluation results and summaries. The project also includes administrative features for managing users and viewing logs (e.g., Sheriff logs).

The project is structured as a full-stack application with a separate frontend (React/TypeScript) and backend (Node.js/Express/TypeScript).

## 2. Technologies Used

*   **Frontend:**
    *   React (Vite as a build tool, inferred from `vite.config.ts` and `index.html` structure)
    *   TypeScript
    *   Tailwind CSS (inferred from `tailwind.config.js`, `postcss.config.js`)
    *   Axios (for API communication, seen in `src/services/api.ts`)
    *   React Router (inferred from typical React project structure and navigation needs)
*   **Backend:**
    *   Node.js
    *   Express.js
    *   TypeScript
    *   MongoDB (database, inferred from `VITE_MONGODB_URI` in `.env` and `server/src/config/db.ts`)
    *   Mongoose (ODM for MongoDB, inferred from model files like `server/src/models/User.ts`)
    *   JWT (for authentication, inferred from `VITE_JWT_SECRET` in `.env` and auth middleware)
    *   Swagger/OpenAPI (for API documentation, seen in `server/src/config/swagger.ts` and `server/src/index.ts`)
    *   Helmet (for security headers)
    *   Express-rate-limit (for API rate limiting)
    *   Cors (for Cross-Origin Resource Sharing)
*   **Development & Build Tools:**
    *   ESLint (inferred from `eslint.config.js`)
    *   Jest (for testing, inferred from `jest.config.js` and `rut.test.ts`)
    *   npm or yarn (package management, inferred from `package.json`)
*   **Deployment:**
    *   Nginx (as a reverse proxy, based on previous interactions)
    *   Docker (potentially, though not directly visible from file listings)

## 3. Frontend (`src/`)

The frontend application is built with React and TypeScript, located in the [`src`](src/) directory.

### 3.1. Structure

*   **[`src/assets`](src/assets/)**: Static assets like images (e.g., `duxiter_logo.png`).
*   **[`src/components`](src/components/)**: Reusable UI components.
    *   **[`src/components/auth`](src/components/auth/)**: Components related to authentication (e.g., `ProtectedRoute.tsx`, `RoleProtectedRoute.tsx`).
    *   **[`src/components/common`](src/components/common/)**: General-purpose common components (e.g., `PageLoader.tsx`).
    *   **[`src/components/layouts`](src/components/layouts/)**: Layout components (e.g., `DashboardLayout.tsx`).
    *   **[`src/components/modals`](src/components/modals/)**: Modal dialog components (e.g., `UserModal.tsx`).
*   **[`src/contexts`](src/contexts/)**: React Context API providers for global state management (e.g., `AuthContext.tsx`, `TenantContext.tsx`).
*   **[`src/models`](src/models/)**: Frontend data models/types, mirroring backend structures (e.g., `evaluation.ts`).
*   **[`src/pages`](src/pages/)**: Top-level page components representing different views/routes.
    *   **[`src/pages/admin`](src/pages/admin/)**: Pages for administrative users (e.g., `AdminDashboard.tsx`, `SheriffLogDetailPage.tsx`).
    *   **[`src/pages/auth`](src/pages/auth/)**: Authentication pages (e.g., `Login.tsx`, `Register.tsx`).
    *   **[`src/pages/dashboard`](src/pages/dashboard/)**: Main dashboard page.
    *   **[`src/pages/evaluations`](src/pages/evaluations/)**: Pages related to evaluations (e.g., `SingleEvaluation.tsx`, `BulkEvaluation.tsx`, `EvaluationsSummaryPage.tsx`).
    *   **[`src/pages/tenant`](src/pages/tenant/)**: Pages for tenant management (e.g., `TenantSettings.tsx`, `TenantUsers.tsx`).
    *   Other pages like `CompanyLookup.tsx`, `LandingPage.tsx`, `NotFound.tsx`.
*   **[`src/services`](src/services/)**: Modules for interacting with the backend API (e.g., `api.ts`, `companyService.ts`, `evaluationService.ts`).
*   **[`src/types`](src/types/)**: TypeScript type definitions for various data structures (e.g., `auth.ts`, `evaluation.ts`, `sheriff.ts`, `tenant.ts`).
*   **[`src/utils`](src/utils/)**: Utility functions (e.g., `rut.test.ts` suggests RUT validation utilities).
*   **Main entry points**: [`main.tsx`](src/main.tsx), [`App.tsx`](src/App.tsx), [`index.html`](index.html).
*   **Configuration**: `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`.

### 3.2. Key Features & Components

*   User Authentication (Login, Register)
*   Protected Routes based on authentication status and user roles.
*   Dashboard for authenticated users.
*   Supplier Evaluation (single and bulk).
*   Viewing Evaluation Results and Summaries.
*   Company Lookup.
*   Tenant Management (settings, users).
*   Admin functionalities (dashboard, log viewing).
*   Global state management for Auth and Tenant information.

## 4. Backend (`server/src/`)

The backend API is built with Node.js, Express, and TypeScript, located in the [`server/src`](server/src/) directory.

### 4.1. Structure

*   **[`server/src/config`](server/src/config/)**: Configuration files for database (`db.ts`, `database.ts`), Swagger (`swagger.ts`).
*   **[`server/src/controllers`](server/src/controllers/)**: Request handlers that interact with services and models (e.g., `auth.controller.ts`, `evaluation.controller.ts` - assumed, `user.controller.ts`, `tenant.controller.ts`).
*   **[`server/src/middleware`](server/src/middleware/)**: Express middleware functions (e.g., `auth.middleware.ts` for authentication, `role.middleware.ts` for role-based access control).
*   **[`server/src/models`](server/src/models/)**: Mongoose models defining the database schema (e.g., `User.ts`, `Company.ts`, `Evaluation.ts`, `Tenant.model.ts`, `SheriffDataLog.ts`).
*   **[`server/src/routes`](server/src/routes/)**: Express router modules defining API endpoints (e.g., `auth.routes.ts`, `user.routes.ts`, `evaluation.routes.ts`, `tenant.routes.ts`). The main router is [`server/src/routes/index.ts`](server/src/routes/index.ts).
*   **[`server/src/scripts`](server/src/scripts/)**: Utility scripts (e.g., `migrate-tenant-usage.ts`).
*   **[`server/src/services`](server/src/services/)**: Business logic modules that interact with models and external services (e.g., `auth.service.ts`, `evaluationService.ts`, `userService.ts`, `OpenAIService.ts`, `siiService.ts`, `sheriffService.ts`).
*   **[`server/src/types`](server/src/types/)**: Backend-specific TypeScript type definitions.
*   **Main entry point**: [`server/src/index.ts`](server/src/index.ts) which sets up the Express app, middleware, routes, and starts the server.
*   **Environment Configuration**: [`server/.env`](server/.env) (though the primary `.env` at the root is also used).

### 4.2. Key Features & Components

*   RESTful API for frontend interaction.
*   User authentication and authorization (JWT-based).
*   CRUD operations for Users, Tenants, Evaluations, Companies.
*   Services for handling complex business logic related to evaluations, user management, etc.
*   Integration with external services (OpenAI, SII, Sheriff).
*   API documentation via Swagger.
*   Security measures (Helmet, rate limiting).
*   Database interaction via Mongoose.

## 5. Database

*   The project uses **MongoDB** as its primary database.
*   Configuration is managed in [`server/src/config/db.ts`](server/src/config/db.ts) and connection URI is specified in the `.env` file (`VITE_MONGODB_URI`).
*   **Mongoose** is used as the Object Data Mapper (ODM) to interact with MongoDB, with schemas defined in [`server/src/models`](server/src/models/).

## 6. Deployment & Environment

*   The application is served via **Nginx**, which acts as a reverse proxy for both the frontend (React app) and the backend API.
*   Nginx handles SSL termination and HTTP to HTTPS redirection.
*   Environment variables are managed through `.env` files at the project root and within the `server/` directory. These variables configure database connections, API keys (JWT secret, Sheriff API token), server ports, and API base URLs.
*   The backend includes rate limiting and security headers (Helmet) for production readiness.

## 7. Core Functionalities Summary

*   **User Management:** Registration, login, user roles, password management.
*   **Tenant Management:** Organization-specific instances of the platform, user management within tenants.
*   **Supplier Evaluation:**
    *   Performing individual and bulk evaluations of suppliers.
    *   Processing and storing evaluation data.
    *   Displaying evaluation results and summaries.
*   **Company Information:** Looking up and displaying company details.
*   **Data Scraping/Integration:** Services like `scraperService.ts`, `siiService.ts`, `sheriffService.ts` suggest integration with external data sources or web scraping for enriching supplier data.
*   **AI Integration:** `OpenAIService.ts` suggests the use of OpenAI for some features, possibly related to data analysis or processing in evaluations.
*   **Administration:** Dashboard for admins, logging (Sheriff data logs).

This document provides a high-level overview based on the project's file structure and previous interactions. A deeper dive into specific files would be required for a more granular understanding of each component's implementation.