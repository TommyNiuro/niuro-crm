#!/bin/bash
# Wrapper de com.niuro.prospect-radar (1 vez al día) para la .app instalada.
# Mismo patrón que run-external-radar.sh: CRM_DATA_DIR apunta a la DB de la .app.

set -e

export PATH="/Users/enderys/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="/Users/enderys/Library/Application Support/io.niuro.crm"

cd /Users/enderys/niuro/niuro-crm-oss

exec npx tsx scripts/scan-prospects.ts
