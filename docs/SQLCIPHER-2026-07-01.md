# Cifrado en reposo con SQLCipher (Fase 2.1)

Fecha: 2026-07-01. Rama: `feat/sqlcipher` (desde `feat/saas-hardening-2026-07-01`).
Deriva de `docs/PLAN-ENDURECIMIENTO-2026-07-01.md` seccion 2.1.

Cifra en reposo la base de datos del CRM (`crm.db`). La llave vive en el Keychain
de macOS, no al lado de la DB: cifrar con la llave en `.env.local` seria teatro
sobre FileVault. El modelo de amenaza que esto cubre es "alguien copia el archivo
`crm.db` (backup, Time Machine, disco robado ya desbloqueado) pero no la entrada
del Keychain".

## Que se toco

- **`package.json`**: alias de npm. `better-sqlite3` ahora resuelve a
  `better-sqlite3-multiple-ciphers` (API y version compatibles). El paquete se
  instala dentro de `node_modules/better-sqlite3`, asi que NINGUN import cambia y
  `serverExternalPackages: ["better-sqlite3"]` sigue valido.
- **`src/lib/db-open.ts`** (nuevo): apertura central `openDb()` que aplica la
  llave, resuelve de donde sacarla y migra la DB plana a cifrada una sola vez.
- **~18 call sites**: todo lo que abre `crm.db` pasa de `new Database(...)` a
  `openDb(...)`. Ver lista abajo.
- **`src-tauri/src/main.rs`**: el launcher lee/crea la llave en el Keychain y la
  inyecta al server como `CRM_DB_KEY` al hacer spawn. Sin crates nuevos: usa el
  CLI `security` (mismo mecanismo que el fallback de Node).

## Como funciona

### El cifrado

Binario nativo: `better-sqlite3-multiple-ciphers`. Cifrado por defecto
ChaCha20-Poly1305 (mas fuerte y simple que el AES-256-CBC del SQLCipher clasico).
No fijamos `PRAGMA cipher`, asi que el mismo default aplica al exportar (la
migracion) y al abrir. La llave es hex de 32 bytes; se pasa como passphrase
(`PRAGMA key = '...'`) y SQLCipher deriva la clave real.

### Resolucion de la llave (`resolveKey`)

En orden, cacheado por proceso:

1. `process.env.CRM_DB_KEY`: lo inyecta el launcher Tauri al hacer spawn del server.
2. Keychain de macOS via `security find-generic-password -s io.niuro.crm -a db-key -w`:
   cubre los scripts `tsx`, que corren en la Mac del operador pero NO reciben la
   env del launcher.
3. `null`: sin llave, la DB queda en texto plano. Es el caso de dev, de CI en
   Linux y de los tests. Sin llave, `openDb` se comporta exactamente como antes.

Ademas, bajo Vitest (`process.env.VITEST` o `NODE_ENV=test`) `resolveKey` siempre
devuelve `null`: los tests crean sus DBs en texto plano, y si en la Mac del
operador existiera una llave en el Keychain, sin este gate `openDb` intentaria
keyar esas DBs de test y romperian.

### Provision de la llave (lado Rust)

`get_or_create_db_key()` en `main.rs`:

- Lee del Keychain; si existe, la usa.
- Si no, genera 32 bytes de `/dev/urandom`, los guarda con
  `security add-generic-password ... -U` y los usa.
- Si no se puede leer ni persistir (no-macOS, acceso denegado), devuelve `None`
  y el server arranca SIN cifrado, en vez de dejar la DB inaccesible con una
  llave efimera.

Se eligio el CLI `security` en vez de un crate de Keychain (`keyring`,
`security-framework`) para no agregar dependencias ni tocar `Cargo.lock`, y para
usar el mismo mecanismo que el fallback de Node.

### Migracion idempotente de una DB existente

SQLCipher no puede abrir una DB en texto plano con `PRAGMA key`, hay que
exportarla. `migrateToEncryptedIfNeeded(file, key)`:

1. Si el archivo no existe, no hace nada (una DB nueva nace cifrada al primer
   `PRAGMA key`).
2. Lee los primeros 16 bytes. Si son `SQLite format 3\0`, la DB esta en texto
   plano y hay que migrarla. Si no, ya esta cifrada (o header desconocido) y no
   se toca. Esta deteccion por header es lo que hace la operacion idempotente: el
   segundo arranque ve la DB opaca y no re-keya.
3. Dobla el WAL sobre el archivo principal, abre un tmp cifrado con
   `ATTACH ... KEY`, vuelca todo con `sqlcipher_export`, y reemplaza el original
   de forma atomica.
4. Seguridad ante fallo: el original se conserva como `crm.db.plain-bak` y el tmp
   solo reemplaza al original si el export termino OK. Un corte a mitad deja el
   original intacto y reintenta el proximo arranque.

Se dispara de forma perezosa una vez por proceso desde `openDb` (cubre el caso de
que el primer opener sea readonly, que por si solo no podria migrar).

**Nota:** una vez verificado que la app abre bien la DB cifrada, se puede borrar
`crm.db.plain-bak` a mano. Es una copia en texto plano de tus datos.

## Call sites convertidos

App (los carga el server Next, criticos para que la app funcione):
`src/db/index.ts`, `src/lib/auth.ts`, `src/lib/settings.ts`, `src/lib/audit.ts`,
`src/lib/claude-subprocess.ts`, `src/lib/whatsapp.ts` (solo `openCrm`),
`src/app/api/whatsapp/tick/route.ts`, `src/app/api/operator/route.ts`.

Scripts y herramientas (corren por `tsx`, usan el fallback de Keychain):
`src/db/seed.ts`, `scripts/init.ts`, `scripts/sync-crm.ts`, `scripts/sync-wa.ts`,
`scripts/enrich-names.ts`, `scripts/precalif-import.ts`, `scripts/precalif-export.ts`,
`scripts/calibrate-scoring.ts`, `scripts/scan-external-jobs.ts`,
`scripts/followup-cadence.ts`, `scripts/categorize-chats.ts`,
`scripts/scan-groups.ts`, `mcp/crm-server.ts`.

### Lo que NO se cifra (a proposito)

- **Store de WhatsApp del bridge Go** (`whatsapp.ts` `open()`, `lid.ts`): es una
  DB externa, en texto plano, ajena a la app. Sigue con `new Database` sin llave.
- **`scripts/sync-wa.ts`**: abre `crm.db` con `openDb`, pero ATTACHea el store del
  bridge. Con `crm.db` cifrada, un `ATTACH` de una DB plana necesita `KEY ''`
  explicito (si no, SQLCipher le aplica la llave de la conexion principal y falla).
  Los dos `ATTACH` (bridge y wastore) llevan `KEY ''`.
- **`scripts/detect-gaps.ts`**: apunta a la `crm.db` de `auto-crm` (otro repo, no
  cifrado). Se deja intacto.
- **Tests** (`:memory:` y DBs tmp): sin llave por el gate de Vitest.

## Pasos requeridos en tu Mac

El alias de `better-sqlite3` cambio en `package.json` pero **el `package-lock.json`
no se regenero** (hacerlo en Linux/CI daba una resolucion divergente que ademas
ensuciaba el diff). Antes de nada, en tu Mac:

```bash
npm install          # regenera el lock y compila el prebuild nativo de multiple-ciphers
```

Commiteá el `package-lock.json` resultante: CI corre `npm ci` y necesita el lock
en sync con `package.json`, si no falla.

## Verificacion

```bash
npm install                 # imprescindible primero (ver arriba)
npx tsc --noEmit            # typecheck
npm test                    # 169 tests, deben seguir en verde (sin cifrado, gate de Vitest)
npm run build               # build de Next
npm run desktop:build       # build nativo de la .app: SIN esto no esta probado de verdad
```

Con la `.app` construida, la prueba real:

- Abrir la app: debe crear/abrir `crm.db` sin errores.
- Migracion: si ya tenias una `crm.db` en texto plano, tras el primer arranque
  debe quedar `crm.db.plain-bak` al lado y la `crm.db` ya cifrada.
- `hexdump -C "$HOME/Library/Application Support/io.niuro.crm/crm.db" | head`:
  no debe verse texto legible (nombres, telefonos) ni el header `SQLite format 3`.
- La entrada en Keychain: Keychain Access, buscar `io.niuro.crm`, o
  `security find-generic-password -s io.niuro.crm -a db-key -w`.

## CI (Linux)

No hace falta cambio en `ci.yml`. En Linux no hay `CRM_DB_KEY` ni Keychain, asi
que `resolveKey()` devuelve `null` y `tsc` / `test` / `build` corren sin cifrado,
igual que hoy. El build nativo de la `.app` (`desktop.yml`, runner macOS) es el
unico lugar donde el cifrado se ejercita end to end.

## Riesgos y limitaciones honestas

- En un Mac con FileVault, el cifrado a nivel app agrega poca seguridad marginal
  salvo el escenario "copian el .db pero no la llave". Vale la pena porque la
  llave esta en Keychain, no al lado de la DB.
- Si perdes la entrada del Keychain (borrar el llavero, cambiar de maquina sin
  migrar), la `crm.db` cifrada es irrecuperable. El `.plain-bak` (si existe) es la
  unica copia en claro, y hay que borrarlo una vez verificado el cifrado. Un
  backup cifrado aparte (Fase 2.4) mitiga esto.
- Los scripts de analisis readonly (ej. `precalif-export`) disparan la migracion
  perezosa si encuentran una DB plana y hay llave. Es esperado, pero significa que
  el primer script que corras contra una DB plana la migra.
