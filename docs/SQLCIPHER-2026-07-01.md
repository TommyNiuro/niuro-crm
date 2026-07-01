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

`better-sqlite3-multiple-ciphers` cifra una DB plana existente IN-PLACE con
`PRAGMA rekey` (este binario NO tiene `sqlcipher_export`, que es especifico de
SQLCipher clasico; ver "Correcciones 2026-07-01" abajo). `migrateToEncryptedIfNeeded(file, key)`:

1. Si el archivo no existe, no hace nada (una DB nueva nace cifrada al primer
   `PRAGMA key`).
2. Lee los primeros 16 bytes. Si son `SQLite format 3\0`, la DB esta en texto
   plano y hay que migrarla. Si no, ya esta cifrada (o header desconocido) y no
   se toca. Esta deteccion por header hace la operacion idempotente: el segundo
   arranque ve la DB opaca y no re-keya.
3. Copia el plano a `crm.db.plain-bak` (red de seguridad), dobla el WAL sobre el
   archivo principal, y corre `PRAGMA rekey = '<llave>'`, que cifra la DB in-place.
4. Verifica que la DB cifrada abre y lee con la llave. Si el rekey falla o la DB
   resultante es ilegible, restaura desde `crm.db.plain-bak`. Si todo sale bien,
   BORRA el `.plain-bak` automaticamente (no deja una copia sin cifrar de los
   datos al lado de la cifrada).

Se dispara de forma perezosa una vez por proceso desde `openDb` (cubre el caso de
que el primer opener sea readonly, que por si solo no podria migrar).

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

## Correcciones 2026-07-01 (post-implementacion, verificado en la Mac)

Un smoke-test del cifrado real (crear DB plana, migrar, chequear header + lectura
con/sin llave) revelo que **la DB quedaba en TEXTO PLANO** pese a "activar" el
cifrado. Dos bugs, ambos arreglados:

1. **El alias no estaba instalado.** `node_modules/better-sqlite3` era el modulo
   REGULAR (name `better-sqlite3`, `sqlite3mc_version()` inexistente, `PRAGMA cipher`
   vacio): `npm install` habia respetado un `package-lock.json` que aun apuntaba al
   paquete regular. Se forzo el alias real y ahora es
   `better-sqlite3-multiple-ciphers` 12.11.1 (SQLite3 Multiple Ciphers 2.3.5). El
   `package-lock.json` quedo regenerado y commiteado.

2. **`sqlcipher_export` no existe en multiple-ciphers.** La migracion original lo
   usaba via `ATTACH ... KEY` + `SELECT sqlcipher_export('encrypted')`, que fallaba
   con "no such function: sqlcipher_export" (se tragaba en silencio → DB plana). Se
   reemplazo por `PRAGMA rekey` (mecanismo nativo, cifra in-place), con backup previo,
   verificacion de lectura con llave, y borrado del backup plano al terminar.

Por que no lo atraparon los tests: usaban `:memory:` sin llave (gate de Vitest), asi
que nunca ejercian el path cifrado. Se agrego `src/lib/__tests__/db-open.test.ts` que
migra una DB plana real, verifica que queda cifrada, lee con llave y bloquea sin llave.

## Verificacion (hecha, en verde)

```bash
npm install                 # alias multiple-ciphers instalado (lock commiteado)
npx tsc --noEmit            # OK
npm test                    # 177 tests, incluye db-open.test.ts (cifrado REAL)
npm run build               # OK
```

Smoke-tests manuales (con CRM_DB_KEY): DB nueva nace cifrada; DB plana migra a
cifrada in-place; lectura con llave OK; lectura sin llave falla; `.plain-bak`
borrado. **Todo verde.**

### Pendiente (solo requiere tu Mac + interaccion)

```bash
npm run desktop:build       # build nativo de la .app
```

Esto valida el flujo end-to-end del `.app` empaquetado: el launcher Rust
(`main.rs`) crea/lee la llave en el Keychain y la inyecta como `CRM_DB_KEY`. No se
puede validar sin GUI (el Keychain pide permiso al usuario). Con la `.app` construida,
la prueba real:

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
  migrar), la `crm.db` cifrada es irrecuperable. La migracion borra el `.plain-bak`
  al terminar OK, asi que no queda una copia en claro colgada; un backup cifrado
  aparte (Fase 2.4) es la red de recuperacion.
- Los scripts de analisis readonly (ej. `precalif-export`) disparan la migracion
  perezosa si encuentran una DB plana y hay llave. Es esperado, pero significa que
  el primer script que corras contra una DB plana la migra.
