# Niuro CRM como app de Mac (Tauri)

Esta guía empaqueta el CRM como una app nativa de macOS (`.app` + `.dmg`) usando
[Tauri v2](https://tauri.app). La app abre una ventana nativa, levanta el servidor
Next.js embebido en `127.0.0.1:4555` y muestra el CRM. La base de datos vive en una
carpeta escribible del usuario, no dentro del bundle.

> Estado: **scaffolding listo, falta el primer build en un Mac.** El build de Rust a
> macOS solo se puede hacer en una Mac, así que estos pasos los corrés vos. Si algo
> del build necesita un ajuste fino, está acotado a esta carpeta `src-tauri/`.

## Cómo funciona

```
[ .app ]
  └── launcher Rust (src-tauri/src/main.rs)
        1. busca node (PATH + /opt/homebrew/bin + /usr/local/bin)
        2. spawnea el server Next standalone embebido (resources/server/server.js)
           con PORT=4555, HOSTNAME=127.0.0.1, CRM_DB_PATH=~/Library/Application Support/io.niuro.crm/crm.db
        3. muestra un splash y espera a que el puerto responda
        4. navega la ventana a http://127.0.0.1:4555
        5. al cerrar la app, mata el proceso del server
```

El server Next se empaqueta con `output: "standalone"` (se activa solo con
`BUILD_STANDALONE=1`, así tu `npm run local` normal no cambia).

## Requisitos (una sola vez)

1. **Node 24+** (`brew install node`). La app lo necesita en runtime (v1 no bundlea Node).
2. **Rust** via rustup: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **Xcode Command Line Tools**: `xcode-select --install`
4. Dependencias del proyecto: `npm install` (instala también `@tauri-apps/cli`).

## Build

```bash
npm install            # si no lo corriste aún
npm run desktop:build  # build standalone + staging + iconos + tauri build
```

Salida en `src-tauri/target/release/bundle/`:
- `macos/Niuro CRM.app`  (arrastrá a Aplicaciones)
- `dmg/Niuro CRM_0.1.0_aarch64.dmg`  (instalador)

El script `scripts/build-desktop.sh` hace, en orden: `next build` standalone,
copia `server` + `.next/static` + `public` a `src-tauri/resources/server/`,
genera los iconos desde `src-tauri/app-icon.png`, y corre `tauri build`.

## Desarrollo / iterar

```bash
# 1) generá una vez el server standalone embebido y los iconos
BUILD_STANDALONE=1 npx next build && \
  rm -rf src-tauri/resources/server && mkdir -p src-tauri/resources/server && \
  cp -R .next/standalone/. src-tauri/resources/server/ && \
  mkdir -p src-tauri/resources/server/.next && \
  cp -R .next/static src-tauri/resources/server/.next/static && \
  cp -R public src-tauri/resources/server/public
npm run desktop:icon

# 2) corré la app sin empaquetar
npx tauri dev
```

(El launcher también acepta `NIURO_SERVER_DIR` y `NIURO_NODE_BIN` por env para apuntar
a un server o node específico durante el desarrollo.)

## Primera apertura (Gatekeeper)

El `.app` no está firmado ni notarizado. La primera vez, macOS lo va a bloquear:
abrilo con clic derecho > Abrir, o desde Ajustes del Sistema > Privacidad y seguridad >
"Abrir de todas formas". Para distribuir a terceros sin fricción necesitás una cuenta
de Apple Developer (firma + notarización); queda fuera de v1.

## Troubleshooting

- **"No se encontró Node.js"**: instalá Node 24+ (`brew install node`). Si usás nvm,
  exportá `NIURO_NODE_BIN=$(which node)` antes de abrir, o pasá a Homebrew node.
- **"No se encontró el server embebido"**: corré `npm run desktop:build` (faltó el
  staging de `resources/server`).
- **Ventana en blanco / no carga**: el server tardó más de 60s o el puerto 4555 está
  ocupado. Cerrá otras instancias del CRM y reabrí.
- **Falla `tauri icon`**: confirmá que existe `src-tauri/app-icon.png`.

## Roadmap (v2 del desktop)

- **Bundlear Node** como sidecar (`externalBin`) para que la app sea 100%
  autocontenida y no dependa del Node del sistema.
- **Firma + notarización** para distribución sin warnings de Gatekeeper.
- **Auto-update** con el updater de Tauri.
- Builds universales (arm64 + x86_64) y CI para releases.
