#!/bin/bash
# Wrapper de com.niuro.categorize-chats (8:30) para la .app instalada (niuro-crm-oss).
# Migrado desde auto-crm el 2026-07-08: corre contra la DB de PROD (CRM_DATA_DIR,
# cifrada; llave del Keychain). Usa el CLI claude para categorizar (best effort).

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-/opt/homebrew/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec npx tsx scripts/categorize-chats.ts
