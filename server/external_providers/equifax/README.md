# IC GCP Informe Personas – Python Client

A tiny CLI app to:
1) obtain an OAuth2 token (client_credentials), and  
2) call the Equifax **transaction/execute** endpoint for *Informe Personas*.

> Built from your integration manual.

---

## 📦 Setup

```bash
# Python 3.9+ recommended
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Prepare your settings
cp .env.example .env
# Edit .env with your CLIENT_ID / CLIENT_SECRET and payload fields
```

## ▶️ Run

```bash
# Uses .env values and UAT by default
python main.py

# Force PROD
python main.py --env prod

# Use a custom payload JSON (overrides .env fields)
python main.py --payload my_payload.json

# Ignore cached token (fetch a fresh one)
python main.py --no-cache
```

## 🧠 Notes

- Token is cached in `.token_cache.json` until near expiry (`expires_in_secs`), then re-used.
- OAuth flow tries **HTTP Basic** with `CLIENT_ID/CLIENT_SECRET` first, then falls back to sending them in the body — covering common server setups.
- If you get 401, 400, 404, or 5xx, the app surfaces readable errors matching the manual.

## 🧪 Sample Payload (env-driven)

All fields are required (see `.env.example`):

```json
{
  "applicants": {
    "primaryConsumer": {
      "personalInformation": {
        "chileanRut": "123456789",
        "chileanSerialNumber": "A000000002"
      }
    }
  },
  "productData": {
    "billTo": "087923B001",
    "shipTo": "087923B001S0001",
    "productName": "CLPLAT",
    "productOrch": "PLATV1",
    "configuration": "Config",
    "customer": "CLPLATFYG",
    "model": "PLATFYG"
  }
}
```

## ⚠️ Troubleshooting

- **401 Unauthorized** → token missing/expired/invalid. Re-run with `--no-cache` or check credentials.
- **404 Not Found** → check endpoint or `productOrch` value.
- **400 Bad Request / 500 Service error in orchestration** → validate your payload fields and values.
