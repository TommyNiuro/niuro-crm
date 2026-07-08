#!/bin/bash
# Wrapper de com.niuro.prospect-radar (1 vez al día) para la .app instalada.
# Mismo patrón que run-external-radar.sh: CRM_DATA_DIR apunta a la DB de la .app.

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-$HOME/.nvm/versions/node/v24.14.0/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm"

cd $HOME/niuro/niuro-crm-oss

exec npx tsx scripts/scan-prospects.ts
