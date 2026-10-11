#!/usr/bin/env bash
#
# start_services.sh
# Gestisce avvio / stop / restart / status di:
#   A) Backend  FastAPI uvicorn 8181 (duxiter-2 staging · safety lock attivo)
#   B) Frontend Vite (dev)      4030 strictPort · proxy /api → localhost:8181
#
# Uso:
#   ./scripts/start_services.sh help
#   ./scripts/start_services.sh status
#   ./scripts/start_services.sh restart     <-- default se non passi nulla
#   ./scripts/start_services.sh start
#   ./scripts/start_services.sh stop
#   ./scripts/start_services.sh start-backend  / stop-backend  / status-backend
#   ./scripts/start_services.sh start-frontend / stop-frontend / status-frontend
#
# Regole produzione safety:
#   · Backend USA SEMPRE /tmp/_forker.py · demone doppio fork + setsid
#       → env MONGODB_URI=duxiter-2 + AUTHZ_FORBID_PROD_DB=True (hardcodati nel forker!)
#   · Frontend usa package-lock.json → npm run dev (pnpm/yarn se c'è lock corrispettivo)
#
set -Eeuo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# 0 ·  PATH & COSTANTI  (auto-detect PROJ_ROOT tramite path script stesso)
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJ_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME="${PROJ_ROOT}/.runtime"
mkdir -p "${RUNTIME}"

# --- Backend  (ufficiale: /tmp/_forker.py)  ---
BACKEND_PORT="8181"
BACKEND_PIDFILE="${RUNTIME}/fastcheck_backend_8181.pid"
BACKEND_LOG_OUT="${RUNTIME}/fastcheck_backend_8181.out"
BACKEND_LOG_ERR="${RUNTIME}/fastcheck_backend_8181.err"
BACKEND_FORKER="/tmp/_forker.py"
BACKEND_HEALTH="http://localhost:${BACKEND_PORT}/api/system/info"
BACKEND_BOOT_MAX_SEC=60   # quanti secondi max aspettiamo che la 8181 sia in LISTEN

# --- Frontend Vite 4030  ---
FRONTEND_PORT="4030"
FRONTEND_PIDFILE="${RUNTIME}/vite_frontend_4030.pid"
FRONTEND_LOG_OUT="${RUNTIME}/vite_frontend_4030.out"
FRONTEND_LOG_ERR="${RUNTIME}/vite_frontend_4030.err"
FRONTEND_HEALTH="http://localhost:${FRONTEND_PORT}/"
FRONTEND_BOOT_MAX_SEC=60  # quanti secondi max aspettiamo che la 4030 sia in LISTEN

# ─────────────────────────────────────────────────────────────────────────────
# 1 ·  COLOURS  (disabilitati se stdout non è tty)
# ─────────────────────────────────────────────────────────────────────────────
if [ -t 1 ] ; then
  C_RED=$'\033[31m';   C_GREEN=$'\033[32m';   C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m';  C_BOLD=$'\033[1m';     C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_BOLD=""; C_OFF=""
fi
_info()    { echo -e "${C_CYAN}[INFO]${C_OFF}    $*"; }
_ok()      { echo -e "${C_GREEN}[OK]${C_OFF}      $*"; }
_warn()    { echo -e "${C_YELLOW}[WARN]${C_OFF}    $*"; }
_err()     { echo -e "${C_RED}[ERROR]${C_OFF}   $*" 1>&2; }
_banner()  { echo -e "\n${C_BOLD}${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_OFF}"; }

# ─────────────────────────────────────────────────────────────────────────────
# 2 ·  HELPERS  generici
# ─────────────────────────────────────────────────────────────────────────────
_pid_alive()  { local pid="$1"; [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; }
_port_open()  { local port="$1"; ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}\$"; }

_kill_gently_then_hard() {
  # $1 = pidfile path, $2 = nome servizio, $3 = extra kill filter (opzionale, tipo porta)
  local pidfile="$1"  svc="$2"  extra="${3:-}"
  local pid=""
  if [ -f "${pidfile}" ] ; then
    pid="$(head -n1 "${pidfile}" | tr -d '[:space:]')"
  fi
  if _pid_alive "${pid}" ; then
    _info "Fermo ${svc}  (PID=${pid} · SIGTERM 15)"
    kill -TERM "${pid}" 2>/dev/null || true
    # aspetta max 10s
    for _ in {1..20}; do
      _pid_alive "${pid}" || break
      sleep 0.5
    done
    if _pid_alive "${pid}" ; then
      _warn "${svc} ancora vivo dopo 10s · SIGKILL 9"
      kill -9 "${pid}" 2>/dev/null || true
    fi
  fi
  # Fallback safety: se è passato extra filter (es. porta 8181) e c'è ancora qs in ascolto → kill -9
  if [ -n "${extra}" ] ; then
    local leftovers
    if command -v fuser >/dev/null 2>&1 ; then
      leftovers="$(fuser "${extra}/tcp" 2>/dev/null || true)"
      if [ -n "${leftovers}" ] ; then
        _warn "KILL -9 leftover ${svc} sulla ${extra}"
        fuser -k -9 "${extra}/tcp" 2>/dev/null || true
        sleep 1
      fi
    fi
  fi
  [ -f "${pidfile}" ] && rm -f "${pidfile}"
  return 0
}

# Helper: aspetta che una porta sia in LISTEN per ≤N secondi
_wait_for_port() {
  local port="$1"  max_sec="$2"  label="$3"
  local slept=0
  _info "Attendo ${label}  port=${port}  max=${max_sec}s"
  until _port_open "${port}" || [ "${slept}" -ge "${max_sec}" ] ; do
    sleep 1
    slept=$(( slept + 1 ))
  done
  if _port_open "${port}" ; then
    _ok "${label}  in LISTEN  port=${port}  (dopo ~${slept}s)"
    return 0
  else
    _err "${label} NON è andato in LISTEN entro ${max_sec}s"
    _info "  → controlla i logs:"
    _info "       stderr = ${RUNTIME}/$(basename "${RUNTIME}")_$( [ "${port}" = "8181" ] && echo fastcheck_backend_8181.err || echo vite_frontend_4030.err )"
    return 1
  fi
}

# Helper: auto-detect package manager per frontend (lockfile)
_detect_frontend_pkg() {
  if   [ -f "${PROJ_ROOT}/pnpm-lock.yaml" ] ; then echo "pnpm"
  elif [ -f "${PROJ_ROOT}/package-lock.json" ] ; then echo "npm"
  elif [ -f "${PROJ_ROOT}/yarn.lock" ]         ; then echo "yarn"
  else
    if command -v npm  >/dev/null 2>&1 ; then echo "npm"
    elif command -v pnpm >/dev/null 2>&1 ; then echo "pnpm"
    elif command -v yarn >/dev/null 2>&1 ; then echo "yarn"
    else echo "npm" ; fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 3 ·  HELP  &  USAGE
# ─────────────────────────────────────────────────────────────────────────────
print_help() {
  echo "
${C_BOLD}FastCheck · Stack Start/Restart/Stop/Status${C_OFF}

${C_BOLD}Uso:${C_OFF}  ${C_CYAN}$(basename "$0") <COMANDO>${C_OFF}

  ${C_BOLD}COMANDO${C_OFF}           ${C_BOLD}Descrizione${C_OFF}
  ──────────────────────────────────────────────────────
  help                Mostra questo messaggio
  status              Mostra stato  BACKEND + FRONTEND
  start               Avvia   entrambi (se non sono già vivi)
  stop                Ferma   entrambi
  restart             STOP + START  (COMANDO DEFAULT)
  ──────────────────────────────────────────────────────
  status-backend      Stato backend solo  (FastAPI 8181)
  start-backend       Avvia backend solo
  stop-backend        Ferma backend solo
  restart-backend     Restart backend solo
  ──────────────────────────────────────────────────────
  status-frontend     Stato frontend solo (Vite 4030)
  start-frontend      Avvia frontend solo
  stop-frontend       Ferma frontend solo
  restart-frontend    Restart frontend solo

${C_BOLD}Esempi:${C_OFF}
  ./scripts/start_services.sh            # = restart (tutto)
  ./scripts/start_services.sh status     # check veloce
  ./scripts/start_services.sh restart-backend   # solo backend
"
}

# ─────────────────────────────────────────────────────────────────────────────
# 4 ·  BACKEND  ·  status / start / stop  (FastAPI uvicorn 8181 · duxiter-2)
# ─────────────────────────────────────────────────────────────────────────────
status_backend() {
  _banner
  echo -e "${C_BOLD}  ⚙️  BACKEND  FastAPI · duxiter-2 staging  PORT=${BACKEND_PORT}${C_OFF}"
  echo ""
  local pid=""  alive="NO"  listen="NO"  health="❌ NON TESTATO"  db_name="" safety=""
  if [ -f "${BACKEND_PIDFILE}" ] ; then pid="$(head -n1 "${BACKEND_PIDFILE}" | tr -d '[:space:]')"; fi
  if [ -n "${pid}" ] && _pid_alive "${pid}" ; then alive="SI (PID=${pid})"; fi
  if _port_open "${BACKEND_PORT}" ; then listen="SI"; fi
  if _port_open "${BACKEND_PORT}" ; then
    local resp
    resp="$(curl -sS --max-time 5 "${BACKEND_HEALTH}" 2>/dev/null || true)"
    if [ -n "${resp}" ] ; then
      health="✅ HTTP 200"
      db_name="$( echo "${resp}" | grep -oE '"db_name"\s*:\s*"[^"]+"' | cut -d'"' -f4 || echo "" )"
      safety="$(  echo "${resp}" | grep -oE '"safety_lock_active"\s*:\s*[^,}]+' | awk -F: '{print $2}' | tr -d '[:space:]' || echo "" )"
      [ "${safety}" = "true" ] && safety="VERDE 🔒" || safety="SPENTO ⚠️"
      [ -n "${db_name}" ] && db_name="db=${db_name}"
    fi
  fi
  echo "   Alive        :  ${alive}"
  echo "   Port LISTEN  :  ${listen}"
  echo "   Health check :  ${health}"
  [ -n "${db_name}" ] && echo "   ${db_name} · safety_lock=${safety}"
  echo "   PID File     :  ${BACKEND_PIDFILE}"
  echo "   stdout log   :  ${BACKEND_LOG_OUT}"
  echo "   stderr log   :  ${BACKEND_LOG_ERR}"
  echo ""
}

start_backend() {
  _banner
  echo -e "${C_BOLD}  🟢 AVVIO BACKEND  FastAPI uvicorn :${BACKEND_PORT}${C_OFF}"
  echo ""
  # Safety 1: non riavviare se già vivo + in ascolto
  local pid=""
  [ -f "${BACKEND_PIDFILE}" ] && pid="$(head -n1 "${BACKEND_PIDFILE}" | tr -d '[:space:]')"
  if _pid_alive "${pid}" && _port_open "${BACKEND_PORT}" ; then
    _ok "BACKEND già attivo  (PID=${pid} · port=${BACKEND_PORT} LISTEN) · skip avvio"
    return 0
  fi
  # Safety 2: assicurati che il forker esista
  if [ ! -f "${BACKEND_FORKER}" ] ; then
    _err "Forker backend NON trovato in '${BACKEND_FORKER}'."
    _info "  Ricrealo con il template ufficiale (summary: demone doppio fork + env duxiter-2 hardcodate)."
    return 1
  fi
  # Pulisci leftover porta e pidfile morto
  _kill_gently_then_hard "${BACKEND_PIDFILE}" "BACKEND leftover" "${BACKEND_PORT}"

  _info "Lancio demone via forker: python3 ${BACKEND_FORKER}"
  local out
  out="$(python3 "${BACKEND_FORKER}" 2>&1 || true)"
  _info "Forker output: ${out}"
  sleep 1

  # Aspetta boot
  if ! _wait_for_port "${BACKEND_PORT}" "${BACKEND_BOOT_MAX_SEC}" "BACKEND FastAPI" ; then
    _err "BACKEND FAILED to start. Ultime righe log errore:"
    tail -n 40 "${BACKEND_LOG_ERR}" 2>/dev/null || true
    return 1
  fi

  # Health curl (db_name + safety)
  local resp
  resp="$(curl -sS --max-time 8 "${BACKEND_HEALTH}" 2>/dev/null || true)"
  if [ -z "${resp}" ] ; then
    _warn "Health check '/api/system/info' ha ritornato vuoto · porta OK ma controlla log."
  else
    local db safety
    db="$(     echo "${resp}" | grep -oE '"db_name"\s*:\s*"[^"]+"'     | cut -d'"' -f4 || echo "" )"
    safety="$( echo "${resp}" | grep -oE '"safety_lock_active"\s*:\s*[^,}]+' | awk -F: '{print $2}' | tr -d '[:space:]' || echo "" )"
    if [ "${db}" != "duxiter-2" ] ; then
      _err "SAFETY LOCK FAIL! db_name=${db} · ATTESO 'duxiter-2'. UCCIDO SUBITO BACKEND."
      stop_backend
      return 1
    fi
    _ok "SAFETY LOCK OK  db_name=${db}  safety_lock_active=${safety}"
  fi
  return 0
}

stop_backend() {
  _banner
  echo -e "${C_BOLD}  🔴 STOP BACKEND  FastAPI uvicorn :${BACKEND_PORT}${C_OFF}"
  echo ""
  _kill_gently_then_hard "${BACKEND_PIDFILE}" "BACKEND FastAPI" "${BACKEND_PORT}"
  sleep 1
  if _port_open "${BACKEND_PORT}" ; then
    _warn "BACKEND stop_forced incompleta · ultimo tentativo SIGKILL"
    local leftovers_pids
    leftovers_pids="$(ss -ltnp 2>/dev/null | grep -E "[:.]${BACKEND_PORT}[[:space:]]" | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2 || true)"
    if [ -n "${leftovers_pids}" ] ; then
      kill -9 "${leftovers_pids}" 2>/dev/null || true
    fi
    if command -v fuser >/dev/null 2>&1 ; then
      fuser -k -9 "${BACKEND_PORT}/tcp" 2>/dev/null || true
    fi
  fi
  _ok "BACKEND fermato  (port=${BACKEND_PORT} non più in ascolto)."
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# 5 ·  FRONTEND  ·  status / start / stop  (Vite dev · PORT 4030 strict)
# ─────────────────────────────────────────────────────────────────────────────
status_frontend() {
  _banner
  echo -e "${C_BOLD}  🖥️  FRONTEND  Vite (dev)  PORT=${FRONTEND_PORT}${C_OFF}"
  echo ""
  local pid=""  alive="NO"  listen="NO"  health="❌ NON TESTATO"
  if [ -f "${FRONTEND_PIDFILE}" ] ; then pid="$(head -n1 "${FRONTEND_PIDFILE}" | tr -d '[:space:]')"; fi
  if [ -n "${pid}" ] && _pid_alive "${pid}" ; then alive="SI (PID=${pid})"; fi
  if _port_open "${FRONTEND_PORT}" ; then listen="SI"; fi
  if _port_open "${FRONTEND_PORT}" ; then
    local http_code
    http_code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${FRONTEND_HEALTH}" 2>/dev/null || echo "000")"
    if [ "${http_code}" = "200" ] ; then health="✅ HTTP 200"; else health="⚠️  HTTP ${http_code}"; fi
  fi
  local pkg
  pkg="$(_detect_frontend_pkg)"
  echo "   Package mgmt :  ${pkg}"
  echo "   Alive        :  ${alive}"
  echo "   Port LISTEN  :  ${listen}"
  echo "   Health check :  ${health}"
  echo "   PID File     :  ${FRONTEND_PIDFILE}"
  echo "   stdout log   :  ${FRONTEND_LOG_OUT}"
  echo "   stderr log   :  ${FRONTEND_LOG_ERR}"
  echo ""
}

start_frontend() {
  _banner
  echo -e "${C_BOLD}  🟢 AVVIO FRONTEND  Vite dev server :${FRONTEND_PORT}${C_OFF}"
  echo ""
  local pid="" pkg
  pkg="$(_detect_frontend_pkg)"
  [ -f "${FRONTEND_PIDFILE}" ] && pid="$(head -n1 "${FRONTEND_PIDFILE}" | tr -d '[:space:]')"
  if _pid_alive "${pid}" && _port_open "${FRONTEND_PORT}" ; then
    _ok "FRONTEND già attivo  (PID=${pid} · port=${FRONTEND_PORT} LISTEN) · skip avvio"
    return 0
  fi
  # Pulisce leftover
  _kill_gently_then_hard "${FRONTEND_PIDFILE}" "FRONTEND leftover" "${FRONTEND_PORT}"
  # Verifica che node_modules ci siano (fallisce velocemente se mancano)
  if [ ! -d "${PROJ_ROOT}/node_modules" ] ; then
    _err "node_modules MANCANTE in ${PROJ_ROOT}"
    _info "  Installa prima le dipendenze:"
    _info "    cd ${PROJ_ROOT} && ${pkg} install"
    return 1
  fi
  _info "Package manager frontend = ${pkg}"
  _info "Working directory = ${PROJ_ROOT}"
  _info "Logs stdout → ${FRONTEND_LOG_OUT}   stderr → ${FRONTEND_LOG_ERR}"

  # Avvia come DEMONE (setsid = NUOVA SESSIONE INDIPENDENTE · SIGHUP immune quando shell padre muore)
  local bg_cmd="
    set +euo pipefail
    cd '${PROJ_ROOT}'
    exec '$(command -v "${pkg}")' run dev
  "
  setsid bash -c "${bg_cmd}" \
    >"${FRONTEND_LOG_OUT}" 2>"${FRONTEND_LOG_ERR}" \
    </dev/null &
  echo $! > "${FRONTEND_PIDFILE}"
  disown 2>/dev/null || true
  sleep 2

  if ! _wait_for_port "${FRONTEND_PORT}" "${FRONTEND_BOOT_MAX_SEC}" "FRONTEND Vite" ; then
    _err "FRONTEND FAILED to start. Ultime righe log errore:"
    tail -n 60 "${FRONTEND_LOG_ERR}" 2>/dev/null || true
    return 1
  fi

  # Health check Vite index.html HTTP 200
  local http_code
  http_code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 "${FRONTEND_HEALTH}" 2>/dev/null || echo "000")"
  if [ "${http_code}" = "200" ] ; then
    _ok "FRONTEND raggiungibile · ${FRONTEND_HEALTH} HTTP 200"
  else
    _warn "FRONTEND LISTEN ma HTTP ${http_code} · potrebbe essere ancora in fase di optimizeDeps. Prova a ricaricare tra 10s."
  fi
  return 0
}

stop_frontend() {
  _banner
  echo -e "${C_BOLD}  🔴 STOP FRONTEND  Vite :${FRONTEND_PORT}${C_OFF}"
  echo ""
  _kill_gently_then_hard "${FRONTEND_PIDFILE}" "FRONTEND Vite" "${FRONTEND_PORT}"
  sleep 1
  if _port_open "${FRONTEND_PORT}" ; then
    _warn "FRONTEND stop_forced incompleta · ultimo tentativo SIGKILL"
    if command -v fuser >/dev/null 2>&1 ; then
      fuser -k -9 "${FRONTEND_PORT}/tcp" 2>/dev/null || true
    fi
    local leftovers_pids
    leftovers_pids="$(ss -ltnp 2>/dev/null | grep -E "[:.]${FRONTEND_PORT}[[:space:]]" | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2 || true)"
    if [ -n "${leftovers_pids}" ] ; then kill -9 "${leftovers_pids}" 2>/dev/null || true ; fi
  fi
  _ok "FRONTEND fermato  (port=${FRONTEND_PORT} non più in ascolto)."
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# 6 ·  COMPOSIZIONE  start / stop / restart / status  (entrambi i servizi)
# ─────────────────────────────────────────────────────────────────────────────
status_all()   { status_backend ; status_frontend ; }
stop_all()     { stop_frontend || true ; stop_backend  || true ; _ok "TUTTI I SERVIZI FERMI."; }
restart_all()  { _banner; echo -e "   ${C_BOLD}🔄  RESTART COMPLETO  backend (${BACKEND_PORT}) + frontend (${FRONTEND_PORT})${C_OFF}"; \
                 stop_all ; \
                 start_backend || { _err "BACKEND FAILED. Abort prima di avviare frontend."; exit 1; }; \
                 start_frontend || { _err "FRONTEND FAILED."; exit 1; }; \
                 sleep 2 ; status_all ; }
start_all()    { start_backend || exit 1 ; start_frontend || exit 1 ; sleep 2 ; status_all ; }

# ─────────────────────────────────────────────────────────────────────────────
# 7 ·  MAIN  dispatcher
# ─────────────────────────────────────────────────────────────────────────────
CMD="${1:-restart}"
case "${CMD}" in
  help|-h|--help|-help)  print_help ; exit 0 ;;
  status)                status_all   ; exit 0 ;;
  start)                 start_all    ; exit $? ;;
  stop)                  stop_all     ; exit 0 ;;
  restart)               restart_all  ; exit $? ;;
  # ----- solo backend -----
  status-backend)        status_backend  ; exit 0 ;;
  start-backend)         start_backend   ; exit $? ;;
  stop-backend)          stop_backend    ; exit 0 ;;
  restart-backend)       stop_backend ; start_backend ; exit $? ;;
  # ----- solo frontend -----
  status-frontend)       status_frontend ; exit 0 ;;
  start-frontend)        start_frontend  ; exit $? ;;
  stop-frontend)         stop_frontend   ; exit 0 ;;
  restart-frontend)      stop_frontend ; start_frontend ; exit $? ;;
  *)
    _err "Comando sconosciuto: '${CMD}'"
    print_help
    exit 2 ;;
esac
