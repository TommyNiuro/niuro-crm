#!/usr/bin/env bash
#
# Empaqueta Niuro CRM como app de Mac (.app + .dmg) con Tauri.
# Requisitos: Node >= 24, Rust (rustup) y Xcode Command Line Tools.
# Ver docs/DESKTOP.md para el detalle.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER_DIR="src-tauri/resources/server"

echo "==> 1/4  Build de Next en modo standalone (webpack)"
# --webpack es OBLIGATORIO acá: el build por defecto de Next 16 usa Turbopack, y
# Turbopack en modo standalone le pone un nombre hasheado a los paquetes externos
# nativos (ej. better-sqlite3-<hash>) que NO resuelve dentro del .app, tirando
# "Failed to load external module ... Cannot find module" -> 500. Webpack +
# serverExternalPackages los externaliza por su nombre real y el standalone los
# resuelve bien. (bug upstream vercel/next.js #86652 / #87737)
BUILD_STANDALONE=1 npx next build --webpack

echo "==> 2/4  Staging del server standalone en $SERVER_DIR"
rm -rf "$SERVER_DIR"
mkdir -p "$SERVER_DIR"
cp -R .next/standalone/. "$SERVER_DIR"/
# Next standalone NO copia static ni public: hay que ubicarlos junto al server.
mkdir -p "$SERVER_DIR/.next"
cp -R .next/static "$SERVER_DIR/.next/static"
if [ -d public ]; then cp -R public "$SERVER_DIR/public"; fi

echo "==> 3/4  Generando iconos de la app"
npx tauri icon src-tauri/app-icon.png >/dev/null

echo "==> 4/4  Tauri build (.app + .dmg)"
npx tauri build

echo ""
echo "Listo. Bundles en: src-tauri/target/release/bundle/"
echo "  - macos/Niuro CRM.app"
echo "  - dmg/Niuro CRM_0.1.0_*.dmg"
