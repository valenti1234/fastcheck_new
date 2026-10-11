#!/usr/bin/env bash
# ================================================================
# start_backend_staging.sh
# Inicia / Detiene / Verifica backend FastAPI RBAC+ABAC en DB STAGING = duxiter-2.
#
# ✅ Seguridad 4-capas activa: NUNCA se conecta a `duxiter` prod.
# ✅ URI duxiter-2 hardcodeada + AUTHZ_FORBID_PROD_DB=True
# ✅ Feature flags FASE2: AUTHZ_LEGACY_LAYER=False (G3 100% usuarios)
#
# USO:
#   chmod +x scripts/start_backend_staging.sh
#   ./scripts/start_backend_staging.sh                       # START   (port 8181 default --reload)
#   ./scripts/start_backend_staging.sh --port 9000            # START   puerto custom
#   ./scripts/start_backend_staging.sh --no-reload            # START   sin --reload (estable)
#   ./scripts/start_backend_staging.sh --status               # STATUS  verifica PID + puerto
#   ./scripts/start_backend_staging.sh --stop                 # STOP    mata proceso guardado
#   ./scripts/start_backend_staging.sh --restart              # RESTART stop + start
#   ./scripts/start_backend_staging.sh --logs   [-n 100]      # LOGS    tail -f stdout/stderr (últimas N líneas)
# ================================================================
set -euo pipefail

# ------ 0) Ubicaciones globales ------------------------
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
BACKEND_DIR="${PROJECT_ROOT}/fastcheck_api"
VENV_DIR="${PROJECT_ROOT}/.venv"
VENV_ACTIVATE="${VENV_DIR}/bin/activate"

# Directorio runtime (para PID + logs)
RUNTIME_DIR="${PROJECT_ROOT}/.runtime"
mkdir -p "${RUNTIME_DIR}"

# ------ 1) Argumentos CLI ---------------------------------------------------
MODE="start"        # start / stop / restart / status / logs
PORT=8181
RELOAD="--reload"
LOG_TAIL_N=120
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|-p)           PORT="$2";              shift 2 ;;
    --no-reload|-n)      RELOAD="";              shift   ;;
    --stop|-s)           MODE="stop";            shift   ;;
    --status|-S)         MODE="status";          shift   ;;
    --restart|-r)        MODE="restart";         shift   ;;
    --logs|-l)           MODE="logs";
                         if [[ $# -ge 2 && "$2" =~ ^[0-9]+$ ]]; then LOG_TAIL_N="$2"; shift 2; else shift; fi
                         ;;
    --help|-h)
      echo "Uso: $0 [ACCIÓN] [OPCIONES]"
      echo ""
      echo "  ACCIONES (elige una — default = start):"
      echo "    (sin accion)           Inicia el backend en modo foreground"
      echo "    --start                Inicia el backend en modo foreground (default)"
      echo "    --stop      | -s       Detiene el backend guardado en PIDFILE"
      echo "    --restart   | -r       Primero --stop, luego --start (mismo --port)"
      echo "    --status    | -S       Muestra: PID vivo?, puerto ocupado?, uptime?"
      echo "    --logs [-n N] | -l     Muestra LOGS stdout + stderr con tail -f (últimas N líneas)"
      echo "    --help      | -h       Esta ayuda"
      echo ""
      echo "  OPCIONES start/restart:"
      echo "    --port  | -p   PUERTO   Puerto escucha FastAPI (default 8181)"
      echo "    --no-reload | -n        Desactiva --reload (ejecución estable)"
      exit 0
      ;;
    # Explicit --start (mantenemos como alias de modo default):
    --start)             MODE="start";           shift   ;;
    *) echo "⚠️  Argumento desconocido: $1  (usa --help para ayuda)"; exit 2 ;;
  esac
done

# Actualiza paths runtime al PORT real (después de parsear --port):
PID_FILE="${RUNTIME_DIR}/fastcheck_backend_${PORT}.pid"
LOG_OUT="${RUNTIME_DIR}/fastcheck_backend_${PORT}.out"
LOG_ERR="${RUNTIME_DIR}/fastcheck_backend_${PORT}.err"

# ============================================================
# HELPER FUNCTIONS
# ============================================================
_is_pid_alive() {
  # Devuelve 0 si el PID está vivo (matchea uvicorn / python del proyecto)
  local pid="$1"
  [[ -z "${pid}" ]] && return 1
  if ! kill -0 "${pid}" 2>/dev/null; then return 1; fi
  # Extra safety: el comando debe corresponder a uvicorn / python fastcheck_api
  local cmdline
  cmdline="$(ps -p "${pid}" -o args= 2>/dev/null || echo '')"
  if [[ -z "${cmdline}" ]]; then return 1; fi
  if echo "${cmdline}" | grep -qE 'uvicorn|fastcheck_api.app.main'; then
    return 0
  fi
  return 1
}

_cleanup_dead_pidfile() {
  if [[ -f "$PID_FILE" ]]; then
    local saved
    saved="$(cat "$PID_FILE" 2>/dev/null || echo '')"
    if [[ -z "${saved}" ]] || ! _is_pid_alive "${saved}"; then
      rm -f "${PID_FILE}"
    fi
  fi
}

_port_in_use_by_our_backend() {
  # Devuelve PID si hay un proceso ESCUCHANDO en PORT Y es uvicorn/fastcheck
  local lsof_pid
  lsof_pid="$( (lsof -sTCP:LISTEN -i TCP:"${PORT}" -t 2>/dev/null || true) | head -n1 )"
  [[ -z "${lsof_pid}" ]] && echo "" && return 0
  if _is_pid_alive "${lsof_pid}"; then echo "${lsof_pid}"; else echo ""; fi
}

# ------ 2) Pre-flight checks (para start / restart) --------------------------
_preflight_start() {
  if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "❌ ERROR: No existe directorio backend: ${BACKEND_DIR}"
    echo "   Este script espera estar en <project_root>/scripts/"
    exit 3
  fi
  if [[ ! -f "$VENV_ACTIVATE" ]]; then
    echo "❌ ERROR: Virtualenv NO existe: ${VENV_ACTIVATE}"
    echo "   → Crealo en <project_root>/.venv e instala dependencias pyproject.toml"
    exit 4
  fi
  if [[ ! -f "${BACKEND_DIR}/app/main.py" ]]; then
    echo "❌ ERROR: No se encuentra app.main en ${BACKEND_DIR}/app/main.py"
    exit 5
  fi
}

# ------ 3) Variables FASE2 STAGING (hardcodeadas — seguridad por defecto) -----
# ✅ PYTHONPATH = PROJECT_ROOT (carpeta que CONTIENE fastcheck_api/) — necesario porque
#    app.main.py usa imports ABSOLUTOS `from fastcheck_api.app.api.v1...`
_export_env() {
  export PYTHONPATH="${PROJECT_ROOT}:${PYTHONPATH:-}"
  export MONGODB_URI='mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000'
  export AUTHZ_FORBID_PROD_DB=True
  export AUTHZ_LEGACY_LAYER=False
}

# ------ 4) Banner pre-arranque ---------------------------------------------
_banner_start() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  🚀 FASTCHECK BACKEND  ·  STAGING DUxiter-2  ·  FASE2 100%       ║"
  echo "╠══════════════════════════════════════════════════════════════════╣"
  printf "║  📁 Project root : %-44s ║\n" "$PROJECT_ROOT"
  printf "║  📁 Backend dir  : %-44s ║\n" "$BACKEND_DIR"
  printf "║  📁 Venv activate: %-44s ║\n" "${VENV_DIR}/bin/activate"
  printf "║  🐍 Python path  : %-44s ║\n" "$( "${VENV_DIR}/bin/python" -c 'import sys;print(sys.executable)' )"
  printf "║  🐍 PYTHONPATH   : %-44s ║\n" "$PYTHONPATH"
  printf "║  🌐 Host:Puerto  : 0.0.0.0:%-38s ║\n" "$PORT"
  printf "║  🔄 --reload     : %-44s ║\n" "$( [[ -n "$RELOAD" ]] && echo 'SI (desarrollo)' || echo 'NO (estable)' )"
  echo "╠══════════════════════════════════════════════════════════════════╣"
  printf "║  🗄️  DB target    : %-44s ║\n" "duxiter-2 (STAGING)"
  printf "║  🛡️  Prod forbid  : AUTHZ_FORBID_PROD_DB=%-30s ║\n" "$AUTHZ_FORBID_PROD_DB"
  printf "║  🧩 Feature flag : AUTHZ_LEGACY_LAYER=%-33s ║\n" "$AUTHZ_LEGACY_LAYER"
  printf "║  📄 PID file     : %-44s ║\n" "$PID_FILE"
  printf "║  📄 Logs OUT/ERR : %-44s ║\n" ".runtime/fastcheck_backend_${PORT}.{out,err}"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "ℹ️   Safety: MONGODB_URI contiene '/duxiter-2' EN EL PATH (no solo querystring)."
  echo "    Cualquier intento de conectar a 'duxiter' (prod) → HTTP 503 forzado."
  echo ""
}

# ============================================================
# MODE: STOP
# ============================================================
_cmd_stop() {
  echo ""
  echo "🛑 FASTCHECK BACKEND STOP (puerto ${PORT})..."
  # Limpia primero pidfile si esta muerto
  _cleanup_dead_pidfile
  local pid_from_file=""
  local pid_from_port=""
  if [[ -f "${PID_FILE}" ]]; then pid_from_file="$(cat "${PID_FILE}")"; fi
  pid_from_port="$(_port_in_use_by_our_backend)"

  # Elegimos PID principal: primero port, luego archivo
  local final_pid=""
  if [[ -n "${pid_from_port}" ]] && _is_pid_alive "${pid_from_port}"; then
    final_pid="${pid_from_port}"
  elif [[ -n "${pid_from_file}" ]] && _is_pid_alive "${pid_from_file}"; then
    final_pid="${pid_from_file}"
  fi

  if [[ -z "${final_pid}" ]]; then
    echo "   ✅ No hay backend FastCheck activo sobre el puerto ${PORT}."
    rm -f "${PID_FILE}"
    return 0
  fi

  echo "   → PID vivo detectado: ${final_pid}"
  echo "   → Envio SIGTERM (apagado limpio)..."
  kill "${final_pid}" 2>/dev/null || true

  # Espera hasta 8s
  local waited=0
  while _is_pid_alive "${final_pid}"; do
    if [[ ${waited} -ge 8 ]]; then break; fi
    sleep 1
    waited=$((waited+1))
  done

  if _is_pid_alive "${final_pid}"; then
    echo "   → SIGTERM ignorato. Invio SIGKILL."
    kill -9 "${final_pid}" 2>/dev/null || true
    sleep 1
  fi

  # Cleanup figli (uvicorn --reload crea SpawnProcess watchfiles)
  local childs
  childs="$(pgrep -P "${final_pid}" 2>/dev/null || true)"
  for cp in ${childs}; do
    _is_pid_alive "${cp}" && kill -9 "${cp}" 2>/dev/null || true
  done

  rm -f "${PID_FILE}"
  echo "   ✅ Backend detenido. PID ${final_pid} rimosso."
  echo ""
}

# ============================================================
# MODE: STATUS
# ============================================================
_cmd_status() {
  echo ""
  echo "ℹ️   FASTCHECK BACKEND STATUS (puerto ${PORT}):"
  _cleanup_dead_pidfile
  local pid_from_file=""
  local pid_from_port=""
  if [[ -f "${PID_FILE}" ]]; then pid_from_file="$(cat "${PID_FILE}")"; fi
  pid_from_port="$(_port_in_use_by_our_backend)"

  # Dato pid viviente (con prioridad puerto porque es + preciso)
  local alive_pid=""
  if [[ -n "${pid_from_port}" ]] && _is_pid_alive "${pid_from_port}"; then alive_pid="${pid_from_port}"
  elif [[ -n "${pid_from_file}" ]] && _is_pid_alive "${pid_from_file}"; then alive_pid="${pid_from_file}"
  fi

  if [[ -z "${alive_pid}" ]]; then
    echo "   ❌ No hay backend FastCheck activo sul puerto ${PORT}."
    [[ -f "${PID_FILE}" ]] && echo "   → PID file trovato ma PID non vivo (rimosso)."
    return 1
  fi

  # Info sul processo
  local started
  started="$(ps -p "${alive_pid}" -o lstart= 2>/dev/null || echo '?')"
  local cmdline
  cmdline="$(ps -p "${alive_pid}" -o args= 2>/dev/null || echo '')"
  local memory
  memory="$(ps -p "${alive_pid}" -o rss= 2>/dev/null || echo 0)"
  memory_kb="${memory// /}"
  echo "   ✅ Backend attivo. PID = ${alive_pid}"
  echo "   📅 Avviato il      = ${started}"
  echo "   💾 Memoria RSS     = $(( memory_kb / 1024 )) MB"
  echo "   🧾 Comando         = ${cmdline}"
  echo "   🔌 Porta           = TCP 0.0.0.0:${PORT} (LISTEN)"
  echo "   📄 Log stdout      = ${LOG_OUT}"
  echo "   📄 Log stderr      = ${LOG_ERR}"
  echo ""
  # Echo leggero health check HTTP (non bloccante, timeout 3s)
  local hc
  hc="$(curl -sS -m 3 -o /dev/null -w "HTTP %{http_code}" "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo 'N/A (non raggiungibile)')"
  echo "   🏥 Health /health  = ${hc}"
  echo ""
  return 0
}

# ============================================================
# MODE: LOGS
# ============================================================
_cmd_logs() {
  echo "📋 LOGS FastCheck backend (puerto ${PORT}) — últimas ${LOG_TAIL_N} lineas + follow: CTRL+C per uscire"
  echo "   stdout = ${LOG_OUT}"
  echo "   stderr = ${LOG_ERR}"
  echo "──────────────────────────────────────────────────────────────────────"
  # Se non esistono, avvisa
  if [[ ! -f "${LOG_OUT}" && ! -f "${LOG_ERR}" ]]; then
    echo "❌ Nessun log file trovato per la porta ${PORT}. Il backend è mai stato avviato?"
    return 1
  fi
  # tail -f su entrambi (stdout+stderr insieme):
  tail -n "${LOG_TAIL_N}" -f "${LOG_OUT}" "${LOG_ERR}" 2>/dev/null || true
}

# ============================================================
# MODE: START (foreground = script lascia controllo all'user; con PID salvato)
# ============================================================
_cmd_start() {
  _preflight_start
  _export_env

  # Check: PID già attivo?
  _cleanup_dead_pidfile
  local pid_from_port
  pid_from_port="$(_port_in_use_by_our_backend)"
  if [[ -n "${pid_from_port}" ]] && _is_pid_alive "${pid_from_port}"; then
    echo "⚠️  Attenzione: il backend FASTCHECK è GIA ATTIVO sul puerto ${PORT} (PID ${pid_from_port})."
    echo "   → Se vuoi riavviarlo usa:   $0 --restart --port ${PORT}"
    echo "   → Se vuoi solo vedere lo stato: $0 --status --port ${PORT}"
    exit 6
  fi

  _banner_start

  # shellcheck disable=SC1090
  source "${VENV_ACTIVATE}"

  # ✅ Eseguiamo SEMPRE da PROJECT_ROOT per package fastcheck_api top-level
  cd "${PROJECT_ROOT}"

  # ──────────────────────────────────────────────────────────────────────────
  # ESECUZIONE:
  #   Avviamo uvicorn come subprocesso e SALVIAMO IL PID nel PIDFILE (così
  #   --stop / --status trovano il processo anche se l'utente CTRL+C il
  #   terminale foreground da cui è partito).
  #   Inoltre redirigiamo stdout/stderr anche su file log per --logs.
  # ──────────────────────────────────────────────────────────────────────────
  echo "▶️  uvicorn fastcheck_api.app.main:app --host 0.0.0.0 --port ${PORT} ${RELOAD}"
  echo "   Log in tempo reale su terminale + salvati in:"
  echo "     stdout: ${LOG_OUT}"
  echo "     stderr: ${LOG_ERR}"
  echo "   Usa CTRL+C per fermare, oppure '$0 --stop --port ${PORT}' da un altro terminale."
  echo ""

  # Avviamo uvicorn in background, salviamo PID, Poi usiamo `tail -f` su PID, +
  # redirezione contemporaneamente su terminale e file tramite `tee`.
  # Usiamo `setsid + nohup ... > LOG_OUT 2> LOG_ERR &` per separare dal tty
  # padre (così CTRL+C in shell non lo killa se l'utente usa --status da altri
  # terminali). Poi attach ai logs in tempo reale con `tail -f` finché PID vivo.
  # shellcheck disable=SC2086
  nohup python -m uvicorn fastcheck_api.app.main:app --host 0.0.0.0 --port "${PORT}" ${RELOAD} \
    >> "${LOG_OUT}" 2>> "${LOG_ERR}" </dev/null & disown 2>/dev/null || true
  local BG_PID=$!
  echo "${BG_PID}" > "${PID_FILE}"

  # Attendiamo 2 secondi per vederlo partire; se esce immediatamente (crash
  # tipo ModuleNotFound o errore porta occupata), logghiamo e usciamo.
  sleep 2

  if ! _is_pid_alive "${BG_PID}"; then
    echo "❌ CRASH: uvicorn non è riuscito a partire (PID ${BG_PID} non più vivo)."
    echo "   Ultime 30 linee stderr per diagnosticare:"
    echo "────────────────────────────────────────────────────────────────────"
    tail -n 30 "${LOG_ERR}" 2>/dev/null || echo "(nessun log)"
    echo "────────────────────────────────────────────────────────────────────"
    rm -f "${PID_FILE}"
    exit 7
  fi

  echo "✅ Backend FASTCHECK avviato con successo. PID ${BG_PID} salvato in ${PID_FILE}."
  echo ""
  # Ora agganciamo i logs in tempo reale (come se fosse foreground). Se utente
  # preme CTRL+C → tail termina MA IL PROCESSO UVICORN RIMANE VIVO (per
  # riprenderlo con --logs o fermarlo con --stop). Questo è il comportamento
  # più convenzionale tipo `systemd --user` / `docker logs`.
  echo "────────────────────────────────── TAIL LOGS (CTRL+C per staccare senza fermare backend) ──────────────────────────"
  # Importante: SIGINT / SIGTERM in questo script NON devono propagare a uvicorn
  # (per via di nohup non lo faranno), ma tail -f deve solo uscire.
  trap "echo; echo '👉 Ultimo tail terminato. Backend rimane vivo (PID '"${BG_PID}"'). Usa '$0 --stop --port ${PORT}' per fermarlo.'; exit 0" INT TERM
  tail -n 50 -f "${LOG_OUT}" "${LOG_ERR}" 2>/dev/null || true
}

# ============================================================
# DISPATCH MODALITÀ
# ============================================================
case "${MODE}" in
  start)   _cmd_start   ;;
  stop)    _cmd_stop    ;;
  restart)
    _cmd_stop
    # Attendi 2s tra stop e start per sicurezza TCP TIME_WAIT
    sleep 2
    _cmd_start
    ;;
  status)  _cmd_status  ;;
  logs)    _cmd_logs    ;;
  *) echo "❌ Modalità sconosciuta: ${MODE}"; exit 2 ;;
esac
