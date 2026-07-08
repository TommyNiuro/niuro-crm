#!/bin/bash
# Wrapper de io.niuro.crm.digest (8:00) para la .app instalada (niuro-crm-oss).
# Migrado desde auto-crm el 2026-07-08: el digest corre contra la DB de PROD
# (CRM_DATA_DIR, cifrada; llave del Keychain) directamente, sin depender del
# server viejo en 3001. Carga .env.local para las credenciales de Resend.

set -e

NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NODE_BIN:-/opt/homebrew/bin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Las credenciales de Resend (RESEND_API_KEY / DIGEST_EMAIL / DIGEST_FROM) las
# carga send-digest.ts de .env.local con el parser dotenv de Node.
exec npx tsx scripts/send-digest.ts
