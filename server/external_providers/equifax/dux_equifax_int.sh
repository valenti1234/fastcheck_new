#!/bin/bash
# Shell wrapper per avviare il provider Python Equifax
# Tutte le linee loggate usano il prefisso [EXT] per coerenza con preferenze utente (log filter DEBUG).

set -euo pipefail

EXT_PREFIX="[EXT] [SHELL]"

echo "$EXT_PREFIX ========================================================"
echo "$EXT_PREFIX dux_equifax_int.sh invocato — $(date -u +"%Y-%m-%dT%H:%M:%S.%NZ")"
echo "$EXT_PREFIX CWD: $(pwd)"
echo "$EXT_PREFIX Script dir: $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "$EXT_PREFIX Venv path: $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.venv"
echo "$EXT_PREFIX Python: $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.venv/bin/python"
echo "$EXT_PREFIX ========================================================"

if [ ! -f "$(dirname "${BASH_SOURCE[0]}")/.venv/bin/python" ]; then
  echo "$EXT_PREFIX FATAL: .venv/bin/python not found. Run setup_venv.sh first."
  exit 2
fi

echo "$EXT_PREFIX Launching main.py FastAPI server via venv interpreter..."

trap "echo '$EXT_PREFIX Received termination signal — exiting'; exit 0" SIGINT SIGTERM

"$(dirname "${BASH_SOURCE[0]}")/.venv/bin/python" "$(dirname "${BASH_SOURCE[0]}")/main.py"
EXIT_CODE=$?

echo "$EXT_PREFIX main.py exited with code $EXIT_CODE — $(date -u +"%Y-%m-%dT%H:%M:%S.%NZ")"
exit $EXIT_CODE


