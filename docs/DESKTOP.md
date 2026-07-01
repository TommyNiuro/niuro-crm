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
        1. busca node (PATH + Homebrew + tu shell de login, que carga nvm/fnm/volta/asdf)
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

## Dónde viven los datos

La app guarda todo (la base SQLite, uploads de imágenes, recovery de propuestas) en
`~/Library/Application Support/io.niuro.crm/`, una carpeta escribible del usuario. Esto
es necesario porque el server standalone de Next hace `process.chdir(__dirname)` y ese
directorio, dentro del `.app`, es de solo lectura: escribir ahí daba un 500. El launcher
setea `CRM_DATA_DIR` (y `CRM_DB_PATH`) a esa carpeta, y toda la app resuelve sus rutas
por `src/lib/paths.ts`. Para mover los datos, seteá `CRM_DATA_DIR` a otra carpeta.

## Primera apertura (Gatekeeper)

El `.app` no está firmado ni notarizado. La primera vez, macOS lo va a bloquear:
abrilo con clic derecho > Abrir, o desde Ajustes del Sistema > Privacidad y seguridad >
"Abrir de todas formas". Para distribuir a terceros sin fricción necesitás una cuenta
de Apple Developer (firma + notarización); queda fuera de v1.

## Troubleshooting

- **"No se encontró Node.js"** (clásico con nvm/fnm/volta/asdf): las apps lanzadas
  desde Finder reciben un PATH pelado, sin tu gestor de versiones cargado. El launcher
  ya cubre esto: busca en PATH, en rutas de Homebrew, y le pregunta a tu shell de login
  (que carga nvm y compañía), con fallback directo a `~/.nvm`. Si aun así falla, exportá
  `NIURO_NODE_BIN=$(which node)` antes de abrir, o instalá Node por Homebrew
  (`brew install node`), que vive en una ruta fija.
- **El `.dmg` no se genera / falla `bundle_dmg.sh`**: el bundler del `.dmg` usa
  AppleScript/Finder y necesita una **sesión gráfica**. Corré `npm run desktop:build`
  desde la Terminal de tu Mac (no por SSH ni en un shell headless). El `.app` sí se
  genera siempre; el `.dmg` solo con GUI.
- **Cambié algo y la app sigue con el bug viejo**: si arrastraste el `.app` a
  Aplicaciones, esa copia quedó congelada. Tras un rebuild, reemplazala: borrá la de
  `/Applications` y volvé a arrastrar la nueva desde `src-tauri/target/release/bundle/macos/`.
- **"No se encontró el server embebido"**: corré `npm run desktop:build` (faltó el
  staging de `resources/server`).
- **Ventana en blanco / no carga**: el server tardó más de 60s o el puerto 4555 está
  ocupado. Cerrá otras instancias del CRM y reabrí.
- **Falla `tauri icon`**: confirmá que existe `src-tauri/app-icon.png`.
- **Error de compilación en el crate `time` / `cookie`**: `time 0.3.52` rompió semver.
  El `Cargo.lock` ya pinea `time = 0.3.51`. Si actualizás dependencias y reaparece,
  volvé a pinearlo: `cargo update -p time --precise 0.3.51` dentro de `src-tauri/`.

## Roadmap (v2 del desktop)

- **Bundlear Node** como sidecar (`externalBin`) para que la app sea 100%
  autocontenida y no dependa del Node del sistema.
- **Firma + notarización** para distribución sin warnings de Gatekeeper.
- **Auto-update** con el updater de Tauri.
- Builds universales (arm64 + x86_64). El CI ya construye en macOS y adjunta el `.dmg`
  al release cuando pusheás un tag `vX.Y.Z` (ver `.github/workflows/desktop.yml`).
