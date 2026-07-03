#!/bin/bash
# health-check.sh — Monitoreo liviano de los servicios del Niuro CRM (.app OSS)
# Migrado desde auto-crm el 2026-07-03: la .app corre en 4555 y su DB está
# cifrada (SQLCipher), así que el estado del sync se lee del log del wrapper
# (run-whatsapp-sync.sh escribe "Último sync guardado: <UTC>" en cada corrida)
# en vez de consultar wa_last_sync por sqlite3.
# Corre cada hora vía launchd (com.niuro.health-check).

set -u

SYNC_LOG="$HOME/Library/Logs/niuro-whatsapp-sync.log"
BACKUP_DIR="$HOME/niuro/backups/crm"
LOG="$HOME/Library/Logs/niuro-health.log"
PROBLEMS=()

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# 1. La .app responde
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:4555/login 2>/dev/null)
if [ "$HTTP" != "200" ]; then
  PROBLEMS+=("La .app no responde en 127.0.0.1:4555 (HTTP ${HTTP:-sin respuesta})")
fi

# 2. El sync de WhatsApp corrió hace <2h (timestamp UTC en el log del wrapper)
LAST_SYNC=""
if [ -f "$SYNC_LOG" ]; then
  TS=$(grep 'Último sync guardado:' "$SYNC_LOG" | tail -1 | sed 's/.*guardado: //')
  if [ -n "$TS" ]; then
    TS_EPOCH=$(date -j -u -f '%Y-%m-%d %H:%M:%S' "$TS" +%s 2>/dev/null)
    if [ -n "$TS_EPOCH" ]; then
      LAST_SYNC=$(( ( $(date -u +%s) - TS_EPOCH ) / 3600 ))
    fi
  fi
fi
if [ -z "$LAST_SYNC" ]; then
  PROBLEMS+=("No se pudo leer el último sync de $SYNC_LOG")
elif [ "$LAST_SYNC" -ge 2 ]; then
  PROBLEMS+=("El sync de WhatsApp lleva ${LAST_SYNC}h sin correr (umbral 2h)")
fi

# 3. Hay un backup de las últimas 26h
NEWEST=$(ls -t "$BACKUP_DIR"/crm-*.db.gz 2>/dev/null | head -1)
if [ -z "$NEWEST" ]; then
  PROBLEMS+=("No existe ningún backup en $BACKUP_DIR")
else
  AGE_H=$(( ( $(date +%s) - $(stat -f %m "$NEWEST") ) / 3600 ))
  if [ "$AGE_H" -ge 26 ]; then
    PROBLEMS+=("El último backup tiene ${AGE_H}h (umbral 26h)")
  fi
fi

# 4. Rotación simple de logs: si uno supera 20MB se conserva la mitad final.
for lf in "$HOME"/Library/Logs/niuro-*.log; do
  [ -f "$lf" ] || continue
  SIZE=$(stat -f %z "$lf" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt $((20 * 1024 * 1024)) ]; then
    tail -c $((10 * 1024 * 1024)) "$lf" > "$lf.tmp" && mv "$lf.tmp" "$lf"
    log "log rotado: $(basename "$lf") (${SIZE} bytes → 10MB)"
  fi
done

if [ ${#PROBLEMS[@]} -eq 0 ]; then
  log "OK (http=$HTTP, sync hace ${LAST_SYNC:-?}h, backup hace ${AGE_H:-?}h)"
  exit 0
fi

for p in "${PROBLEMS[@]}"; do
  log "PROBLEMA: $p"
  /usr/bin/osascript -e "display notification \"$p\" with title \"Niuro CRM: health-check\"" 2>/dev/null
done
exit 0
