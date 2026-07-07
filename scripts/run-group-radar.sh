#!/bin/bash
# Wrapper del Radar de grupos (com.niuro.group-radar, cada 5 min) para la .app
# instalada (niuro-crm-oss), migrado desde auto-crm el 2026-07-03: antes
# escribía en la DB vieja y la .app no veía datos frescos.
# 1) Sync incremental (rápido, lock ~0.3s) para tener los mensajes frescos.
# 2) Escaneo de grupos + calificación IA (claude CLI, ver scan-groups.ts).

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-/Users/enderys/.nvm/versions/node/v24.14.0/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="/Users/enderys/Library/Application Support/io.niuro.crm"

cd /Users/enderys/niuro/niuro-crm-oss

echo "=== $(date '+%Y-%m-%d %H:%M:%S') group-radar (app) arrancando ==="

npx tsx scripts/sync-wa.ts --incr || echo "WARN: sync incremental falló, escaneando con lo que hay"

exec npx tsx scripts/scan-groups.ts
