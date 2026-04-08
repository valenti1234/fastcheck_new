# Sheriff API Endpoints Documentation

This document lists all Sheriff API endpoints used by the Duxiter server application.

## Overview

The Duxiter server integrates with The Sheriff API (https://prod.api.thesheriff.cl/api/v1) to fetch comprehensive company and individual data for risk assessment and compliance checking.

## Authentication

All Sheriff API calls use:
- **Base URL**: `https://prod.api.thesheriff.cl/api/v1`
- **Authorization**: Bearer token (configured via `SHERIFF_API_TOKEN` environment variable)
- **Client Identifier**: `SheriffSecureClient-v1` (configured via `SHERIFF_CLIENT_IDENTIFIER` environment variable)
- **Content-Type**: `application/json`
- **Accept**: `application/json`

## External Sheriff API Endpoints Used

### 1. Load RUT Data
- **Endpoint**: `POST /helper/loadRut`
- **Purpose**: Initialize RUT data in Sheriff system
- **Payload**: `{ rut: string, isMonitoring: boolean }`
- **Used in**: `SheriffService.queryRut()`

### 2. Summary Data
- **Endpoint**: `GET /helper/{rut}/summary`
- **Purpose**: Get comprehensive summary including compliance data
- **Used in**: `SheriffService.queryRut()`
- **Note**: Includes compliance, SII data, and risk assessment

### 3. Civil Cases Data
- **Endpoint**: `GET /helper/{rut}/getCivilCases`
- **Purpose**: Retrieve civil court cases
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 4. Labor Cases Data
- **Endpoint**: `GET /helper/{rut}/getLaboralCases`
- **Purpose**: Retrieve labor court cases
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 5. Collection Cases Data
- **Endpoint**: `GET /helper/{rut}/getCobranzaCases`
- **Purpose**: Retrieve debt collection cases
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 6. Pension Arrears Cases
- **Endpoint**: `GET /helper/{rut}/getMoraPrevisionalCases`
- **Purpose**: Retrieve pension/social security arrears cases
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 7. Labor Fines Data
- **Endpoint**: `GET /helper/{rut}/getMultaLaboralCases`
- **Purpose**: Retrieve labor-related fines and sanctions
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 8. Corporate Network Data
- **Endpoint**: `GET /helper/{rut}/mallaSocietaria`
- **Purpose**: Retrieve corporate network and partnership information
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items
- **Note**: Contains PDF links for corporate documents

### 9. Official Diary Data
- **Endpoint**: `GET /helper/{rut}/getOfficialDiary`
- **Purpose**: Retrieve official government diary publications
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 10. Commercial Bulletin Cases
- **Endpoint**: `GET /helper/{rut}/getCommercialBulletinCases`
- **Purpose**: Retrieve commercial bulletin publications
- **Used in**: `SheriffService.queryRut()`
- **Limit**: Results limited to 10 items

### 11. Credit Scoring Data
- **Endpoint**: `GET /notification/creditScoring/{rut}/getByRut`
- **Purpose**: Retrieve credit scoring and financial risk data
- **Used in**: `SheriffService.queryRut()`

## Internal Duxiter API Endpoints (Sheriff-related)

### RUT Routes (`/api/rut`)

#### 1. RUT Lookup
- **Endpoint**: `POST /api/rut/lookup`
- **Purpose**: Perform comprehensive RUT lookup using Sheriff API
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.lookupRut`
- **Request Body**: `{ rut: string, isMonitoring?: boolean }`

#### 2. Get RUT Resume
- **Endpoint**: `GET /api/rut/resume/{rut}`
- **Purpose**: Generate AI-powered resume with PDF downloads
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getRutResume`

#### 3. Get All Sheriff Logs
- **Endpoint**: `GET /api/rut/sheriff-logs`
- **Purpose**: Retrieve paginated list of Sheriff data logs
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getAllSheriffLogs`
- **Query Parameters**: `page`, `limit`

#### 4. Get Sheriff Log Detail
- **Endpoint**: `GET /api/rut/sheriff-logs/{logId}`
- **Purpose**: Retrieve specific Sheriff data log by ID
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getSheriffLogDetail`

#### 5. Get Results
- **Endpoint**: `GET /api/rut/results`
- **Purpose**: Retrieve all results
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getResults`

#### 6. Get Latest Result
- **Endpoint**: `GET /api/rut/results/latest`
- **Purpose**: Retrieve the most recent result
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getLatestResult`

#### 7. Get Result by RUT
- **Endpoint**: `GET /api/rut/results/rut/{rut}`
- **Purpose**: Retrieve result for specific RUT
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getResultByRut`

#### 8. Get Result by ID
- **Endpoint**: `GET /api/rut/results/{id}`
- **Purpose**: Retrieve result by specific ID
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getResultById`

#### 9. Get Company Details
- **Endpoint**: `GET /api/rut/company-details/{rut}`
- **Purpose**: Retrieve company details by RUT
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getCompanyDetailsByRut`

#### 10. Get Company Risks
- **Endpoint**: `GET /api/rut/company-risks/{rut}`
- **Purpose**: Retrieve company risk assessment by RUT
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.getCompanyRisksByRut`

#### 11. Delete Result
- **Endpoint**: `DELETE /api/rut/results/{id}`
- **Purpose**: Delete specific result by ID
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `RutController.deleteResult`

### Sheriff Data Log Routes (`/api/sheriff-data-logs`)

#### 1. Get Logs by Tenant
- **Endpoint**: `GET /api/sheriff-data-logs/tenant`
- **Purpose**: Retrieve all Sheriff data logs for authenticated tenant
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `getSheriffDataLogsByTenant`

#### 2. Get Log by RUT
- **Endpoint**: `GET /api/sheriff-data-logs/rut/{rut}`
- **Purpose**: Retrieve Sheriff data log by RUT
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `getSheriffDataLogByRut`

#### 3. Get Log by ID
- **Endpoint**: `GET /api/sheriff-data-logs/{id}`
- **Purpose**: Retrieve Sheriff data log by ID
- **Authentication**: Required (Bearer token)
- **Middleware**: `authenticate`, `tenantFilter`
- **Controller**: `getSheriffDataLogById`

## Data Models

### SheriffDataLog
Stores comprehensive data from Sheriff API calls including:
- Basic info (RUT, tenant, timestamps)
- API call results (summary, cases, corporate network, etc.)
- Error tracking
- PDF associations
- AI-generated summaries

### SheriffApiCallLog
Stores individual API call results separately for better performance:
- Links to main SheriffDataLog
- Specific call name and data
- Optimized for large datasets

## Environment Variables

- `SHERIFF_API_URL`: Sheriff API base URL (default: https://prod.api.thesheriff.cl/api/v1)
- `SHERIFF_API_TOKEN`: Bearer token for Sheriff API authentication
- `SHERIFF_CLIENT_IDENTIFIER`: Client identifier header (default: SheriffSecureClient-v1)
- `SHERIFF_PAGINATION_LIMIT`: Default pagination limit for logs (default: 10)

## Error Handling

All Sheriff API calls include comprehensive error handling:
- Individual call failures are logged but don't stop the entire process
- Error details are stored in `apiCallErrors` array
- `allCallsSucceeded` boolean indicates overall success status
- Tenant isolation ensures data security

## Rate Limiting and Performance

- Results are limited to 10 items per endpoint to manage payload size
- PDF downloads are handled asynchronously
- Separate collections optimize query performance
- Tenant filtering ensures data isolation