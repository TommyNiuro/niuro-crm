#!/bin/bash
# Wrapper de com.niuro.whatsapp-sync (cada hora) para la .app instalada
# (niuro-crm-oss), migrado desde auto-crm el 2026-07-03.

set -e

export PATH="/Users/enderys/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export CRM_DATA_DIR="/Users/enderys/Library/Application Support/io.niuro.crm"

cd /Users/enderys/niuro/niuro-crm-oss

exec npx tsx scripts/sync-wa.ts --incr
