# Authentication

FastCheck uses bearer JWT authentication.

## Source of truth

Authentication is compatible with the existing Node.js backend:

- Users are stored in the existing `users` collection.
- Passwords are verified against the existing bcrypt hash in `users.password`.
- Tenant membership is read from `users.tenant`.
- Access control is enforced using `users.role` (role → permissions mapping in code).

## Obtain a token

### cURL

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"********"}'
```

### Python (httpx)

```python
import httpx

resp = httpx.post(
    "http://127.0.0.1:8080/api/v1/auth/login",
    json={"email": "user@example.com", "password": "********"},
)
resp.raise_for_status()
token = resp.json()["token"]
```

### JavaScript (fetch)

```js
const resp = await fetch("http://127.0.0.1:8080/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "********" }),
});
if (!resp.ok) throw new Error(await resp.text());
const { token } = await resp.json();
```

## Use the token

Send it as:

```
Authorization: Bearer <jwt>
```

## Token refresh

```bash
curl -sS -X POST "http://127.0.0.1:8080/api/v1/auth/refresh" \
  -H "Authorization: Bearer <jwt>"
```
