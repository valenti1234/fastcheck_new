#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3010}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}/api}"

EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
BACKUP_NAME="${BACKUP_NAME:-backup-2026-04-04T06-33-19-418Z}"
MODE="${MODE:-dropAndInsert}"

if [[ -z "${EMAIL}" || -z "${PASSWORD}" ]]; then
  echo "Imposta EMAIL e PASSWORD. Esempio:" >&2
  echo "  EMAIL='superadmin@gmail.com' PASSWORD='...' $0" >&2
  exit 1
fi

login_payload="$(printf '{"email":"%s","password":"%s"}' "${EMAIL//\"/\\\"}" "${PASSWORD//\"/\\\"}")"

login_resp="$(curl -sS -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "${login_payload}")"

extract_token() {
  local resp="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r '.token // empty' <<<"$resp"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "$resp"
import json, sys
try:
  print(json.loads(sys.argv[1]).get("token","") or "")
except Exception:
  print("")
PY
    return
  fi
  sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$resp" | head -n 1
}

token="$(extract_token "$login_resp")"
if [[ -z "${token}" ]]; then
  echo "Login fallito o token non trovato. Risposta:" >&2
  printf '%s\n' "$login_resp" >&2
  exit 1
fi

restore_payload="$(printf '{"backupName":"%s","mode":"%s"}' "${BACKUP_NAME//\"/\\\"}" "${MODE//\"/\\\"}")"

echo "Restore start: backup=${BACKUP_NAME} mode=${MODE} collections=ALL"
restore_resp="$(curl -sS -X POST "${BASE_URL}/admin/database/restore" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d "${restore_payload}")"

echo "$restore_resp"
