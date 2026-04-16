# API Reference

The OpenAPI schema is the source of truth:

- JSON schema: `GET /openapi.json`
- Swagger UI (internal): `/internal/docs`
- ReDoc (internal): `/internal/redoc`

## Groups

- `auth`: login, refresh, profile
- `checks`: create and query evaluation jobs/results
- `reports`: fetch saved summaries/reports
- `usage`: tenant usage and credit operations

## Compatibility notes

- Identity, tenants, and permissions are derived from existing MongoDB collections and fields.
- The system does not introduce new auth/user/tenant collections.
