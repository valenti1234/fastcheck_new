# End-to-end examples

## Create a check, poll results, fetch report (cURL)

```bash
API="http://127.0.0.1:8080"

TOKEN="$(curl -sS -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"********"}' | python -c 'import sys, json; print(json.load(sys.stdin)["token"])')"

JOB_ID="$(curl -sS -X POST "$API/api/v1/checks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"supplier":{"rut":"12345678-9","name":"ACME SpA"}}' | python -c 'import sys, json; print(json.load(sys.stdin)["_id"])')"

curl -sS "$API/api/v1/checks/$JOB_ID/results" -H "Authorization: Bearer $TOKEN"

curl -sS "$API/api/v1/reports/fast-check/12345678-9" -H "Authorization: Bearer $TOKEN"
```

## Python example (httpx)

```python
import time
import httpx

api = "http://127.0.0.1:8080"

with httpx.Client() as client:
    token = client.post(
        f"{api}/api/v1/auth/login",
        json={"email": "user@example.com", "password": "********"},
    ).json()["token"]

    headers = {"Authorization": f"Bearer {token}"}

    job = client.post(
        f"{api}/api/v1/checks",
        headers=headers,
        json={"supplier": {"rut": "12345678-9", "name": "ACME SpA"}},
    ).json()

    job_id = job["_id"]

    for _ in range(30):
        results = client.get(f"{api}/api/v1/checks/{job_id}/results", headers=headers).json()
        if results["total"] > 0:
            break
        time.sleep(1)

    report = client.get(f"{api}/api/v1/reports/fast-check/12345678-9", headers=headers)
    if report.status_code == 200:
        print(report.json()["content"])
```

## JavaScript example (fetch)

```js
const api = "http://127.0.0.1:8080";

const loginResp = await fetch(`${api}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "********" }),
});
if (!loginResp.ok) throw new Error(await loginResp.text());
const { token } = await loginResp.json();

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const createResp = await fetch(`${api}/api/v1/checks`, {
  method: "POST",
  headers,
  body: JSON.stringify({ supplier: { rut: "12345678-9", name: "ACME SpA" } }),
});
if (!createResp.ok) throw new Error(await createResp.text());
const job = await createResp.json();

const resultsResp = await fetch(`${api}/api/v1/checks/${job._id}/results`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!resultsResp.ok) throw new Error(await resultsResp.text());
console.log(await resultsResp.json());
```
