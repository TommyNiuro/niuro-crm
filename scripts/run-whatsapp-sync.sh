#!/bin/bash
# Wrapper de com.niuro.whatsapp-sync (cada hora) para la .app instalada
# (niuro-crm-oss), migrado desde auto-crm el 2026-07-03.

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-$HOME/.nvm/versions/node/v24.14.0/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm"

cd $HOME/niuro/niuro-crm-oss

exec npx tsx scripts/sync-wa.ts --incr
