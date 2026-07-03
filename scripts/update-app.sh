#!/usr/bin/env bash
#
# Actualiza la .app instalada en /Applications con el código actual del repo,
# SIN rebuild de Tauri (~3 min vs ~15): regenera el server standalone de Next,
# lo swapea dentro del bundle y reinicia la app. El launcher Rust y el bridge
# embebido no se tocan (para esos, correr desktop:build completo).
#
# Uso: bash scripts/update-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_RES="/Applications/Niuro CRM.app/Contents/Resources/resources"

[ -d "$APP_RES" ] || { echo "ERROR: no existe /Applications/Niuro CRM.app"; exit 1; }

echo "==> 1/4 Build standalone (webpack, ver build-desktop.sh para el porqué)"
BUILD_STANDALONE=1 npx next build --webpack

echo "==> 2/4 Swap del server dentro del bundle"
rm -rf "$APP_RES/server.nuevo"
mkdir -p "$APP_RES/server.nuevo"
cp -R .next/standalone/. "$APP_RES/server.nuevo"/
mkdir -p "$APP_RES/server.nuevo/.next"
cp -R .next/static "$APP_RES/server.nuevo/.next/static"
if [ -d public ]; then cp -R public "$APP_RES/server.nuevo/public"; fi
rm -rf "$APP_RES/server.old"
if [ -d "$APP_RES/server" ]; then mv "$APP_RES/server" "$APP_RES/server.old"; fi
mv "$APP_RES/server.nuevo" "$APP_RES/server"

echo "==> 3/4 Reinicio de la app"
osascript -e 'quit app "Niuro CRM"' 2>/dev/null || true
sleep 3
open "/Applications/Niuro CRM.app"

echo "==> 4/4 Esperando que el server responda..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:4555/login; then
    echo "Listo: la app corre el build nuevo (rollback en server.old)."
    exit 0
  fi
  sleep 1
done
echo "AVISO: la app no respondió en 60s; revisar manualmente." >&2
exit 1
