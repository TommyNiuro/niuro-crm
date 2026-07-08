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

# Higiene: el standalone puede arrastrar data/ (la crm.db local del que buildea)
# y .env*; NUNCA deben ir al bundle distribuible (fuga de datos). La DB real vive
# en Application Support en runtime, no en el bundle.
rm -rf "$SERVER_DIR/data" "$SERVER_DIR"/.env "$SERVER_DIR"/.env.* 2>/dev/null || true

echo "==> 3/5  Compilando el bridge de WhatsApp (Go) y empaquetandolo"
# El bridge va DENTRO del .app para que el usuario conecte WhatsApp sin instalar
# Go ni correr nada a mano (el launcher le pasa la ruta por BRIDGE_BIN).
# El dir siempre tiene al menos .keep: el glob "resources/bridge/*" de Tauri FALLA
# el build si no matchea ningun archivo (aun cuando el bridge sea opcional).
rm -rf src-tauri/resources/bridge
mkdir -p src-tauri/resources/bridge
touch src-tauri/resources/bridge/.keep
if command -v go >/dev/null 2>&1; then
  # bridge:build NO debe tumbar el build de escritorio: en Windows necesita CGO
  # (compilador C); si falla, se arma el instalador SIN bridge (WhatsApp in-app
  # queda pendiente de compilar a mano, ya caveateado para Windows).
  if npm run bridge:build; then
    # Go en Windows produce whatsapp-bridge.exe; en Mac/Linux whatsapp-bridge.
    BRIDGE_SRC="bridge/whatsapp-bridge"
    [ -f "bridge/whatsapp-bridge.exe" ] && BRIDGE_SRC="bridge/whatsapp-bridge.exe"
    cp "$BRIDGE_SRC" "src-tauri/resources/bridge/$(basename "$BRIDGE_SRC")"
    chmod +x "src-tauri/resources/bridge/$(basename "$BRIDGE_SRC")" 2>/dev/null || true
    echo "    Bridge embebido: $(basename "$BRIDGE_SRC")"
  else
    echo "    AVISO: fallo el build del bridge (¿CGO / compilador C?); instalador SIN bridge."
  fi
else
  echo "    AVISO: Go no esta instalado; el instalador se arma SIN el bridge embebido."
  echo "    La conexion de WhatsApp in-app no funcionara hasta compilarlo (ver docs/INTEGRATIONS.md)."
fi

echo "==> 4/5  Generando iconos de la app"
npx tauri icon src-tauri/app-icon.png >/dev/null

echo "==> 5/5  Tauri build"
# Bundle por plataforma: en Mac solo .app (se distribuye zippeado; el bundler de
# .dmg de Tauri es fragil), en Windows el instalador NSIS (.exe).
case "$(uname -s)" in
  Darwin*) TAURI_BUNDLES="app" ;;
  MINGW*|MSYS*|CYGWIN*|Windows*) TAURI_BUNDLES="nsis" ;;
  *) TAURI_BUNDLES="" ;;
esac
if [ -n "$TAURI_BUNDLES" ]; then
  npx tauri build --bundles "$TAURI_BUNDLES"
else
  npx tauri build
fi

echo ""
echo "Listo. Bundles en: src-tauri/target/release/bundle/"
echo "  - macos/Niuro CRM.app"
echo "  - dmg/Niuro CRM_0.1.0_*.dmg"
