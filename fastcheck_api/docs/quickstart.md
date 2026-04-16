# Quickstart

## 1) Run the API

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r fastcheck_api/requirements.txt

cp fastcheck_api/.env.example fastcheck_api/.env
export $(cat fastcheck_api/.env | xargs)

uvicorn fastcheck_api.app.main:app --host ${FASTCHECK_API_HOST:-127.0.0.1} --port ${FASTCHECK_API_PORT:-8080} --reload
```

## 2) Login

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"********"}'
```

## 3) Create a check

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/v1/checks" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"supplier":{"rut":"12345678-9","name":"ACME SpA"}}'
```

## 4) Fetch results

```bash
curl -sS "http://127.0.0.1:8080/api/v1/checks/<job_id>/results" \
  -H "Authorization: Bearer <jwt>"
```

## 5) Run the worker (async processing)

```bash
export $(cat fastcheck_api/.env | xargs)
python -m fastcheck_api.app.workers.check_worker
```
