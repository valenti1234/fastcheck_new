# FastCheck API (FastAPI)

This is a parallel, client-facing API that reuses the existing MongoDB database and collections used by the Node.js backend.

## Documentation

- OpenAPI schema: `GET /openapi.json`
- Customer docs (UI): `/docs`
- Swagger UI (internal): `/internal/docs`
- ReDoc (internal): `/internal/redoc`
- Customer docs (repo): [docs/index.md](file:///home/duxiter/duxiter_intermediate/fastcheck_api/docs/index.md)

## Local run (no Docker)

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r fastcheck_api/requirements.txt
```

3. Create an env file:

```bash
cp fastcheck_api/.env.example fastcheck_api/.env
```

4. Start the API:

```bash
export $(cat fastcheck_api/.env | xargs)
uvicorn fastcheck_api.app.main:app --host ${FASTCHECK_API_HOST:-127.0.0.1} --port ${FASTCHECK_API_PORT:-8080} --reload
```

5. Start the worker (in a separate shell):

```bash
export $(cat fastcheck_api/.env | xargs)
python -m fastcheck_api.app.workers.check_worker
```
