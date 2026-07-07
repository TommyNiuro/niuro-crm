#!/bin/bash
# Wrapper del Radar externo (com.niuro.external-radar, diario 08:45) para la
# .app instalada (niuro-crm-oss), migrado desde auto-crm el 2026-07-03.
# Lee la API pública de GetOnBoard y carga oportunidades en group_opportunities.
# Sin IA: score heurístico (ver scan-external-jobs.ts).

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-/Users/enderys/.nvm/versions/node/v24.14.0/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="/Users/enderys/Library/Application Support/io.niuro.crm"

cd /Users/enderys/niuro/niuro-crm-oss

echo "=== $(date '+%Y-%m-%d %H:%M:%S') external-radar (app) arrancando ==="

exec npx tsx scripts/scan-external-jobs.ts
