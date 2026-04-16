#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/fastcheck_api"
VENV_DIR="${ROOT_DIR}/.venv"

cd "${ROOT_DIR}"

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

python -m pip install --upgrade pip >/dev/null
python -m pip install -r "${API_DIR}/requirements.txt"

if [[ -f "${API_DIR}/.env" ]]; then
  set -a
  source "${API_DIR}/.env"
  set +a
elif [[ -f "${API_DIR}/.env.example" ]]; then
  cp -n "${API_DIR}/.env.example" "${API_DIR}/.env" || true
  set -a
  source "${API_DIR}/.env"
  set +a
fi

HOST="${FASTCHECK_API_HOST:-127.0.0.1}"
PORT="${FASTCHECK_API_PORT:-8080}"

exec uvicorn fastcheck_api.app.main:app --host "${HOST}" --port "${PORT}" --reload
