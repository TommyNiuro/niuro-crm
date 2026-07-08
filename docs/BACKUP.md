# Backups de la base de datos

El CRM guarda todo en una sola base SQLite (`crm.db`). En la .app instalada esa
base está **cifrada** (SQLCipher vía `better-sqlite3-multiple-ciphers`), así que
el `sqlite3` pelado y `sqlite3 .backup` NO pueden abrirla.

El backup lo hace `scripts/backup-db.ts`: abre la DB con la llave (misma
`openDb()` que el resto del CRM), fuerza `PRAGMA wal_checkpoint(TRUNCATE)` para
volcar el `-wal` al `.db`, y hace una **copia cruda de bytes** del archivo. Como
el cifrado es a nivel de página del archivo en disco, esa copia cruda ya es un
backup cifrado válido. Después verifica el snapshot (`integrity_check` con la
llave), lo comprime con gzip y rota.

## Manual

```bash
npm run backup
```

Corre `scripts/run-db-backup.sh`, que exporta `CRM_DATA_DIR` apuntando a la DB de
la .app (`~/Library/Application Support/io.niuro.crm`) y ejecuta
`scripts/backup-db.ts`. Deja un `crm-YYYY-MM-DD-HH-MM-SS.db.gz` en
`~/niuro/backups/crm/`, verificado e íntegro, y conserva los últimos 14.

## Automático (macOS, launchd)

Backup diario 03:30 vía el LaunchAgent `com.niuro.db-backup`, que ejecuta el
mismo wrapper `scripts/run-db-backup.sh`. Verificá que esté cargado con:

```bash
launchctl list | grep com.niuro.db-backup
```

Si no aparece, cargá su plist desde `~/Library/LaunchAgents/` con
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.niuro.db-backup.plist`.

## Restaurar

Los backups son archivos SQLite **cifrados** (misma llave que la app, en el
Keychain `io.niuro.crm`). Para restaurar, cerrá la app, descomprimí y reemplazá
`crm.db` (borrá también `-wal` y `-shm` si existen):

```bash
DATA="$HOME/Library/Application Support/io.niuro.crm"
gunzip -k "$HOME/niuro/backups/crm/crm-YYYY-MM-DD-HH-MM-SS.db.gz"
cp "$HOME/niuro/backups/crm/crm-YYYY-MM-DD-HH-MM-SS.db" "$DATA/crm.db"
rm -f "$DATA/crm.db-wal" "$DATA/crm.db-shm"
```

La app vuelve a abrir la DB con la llave del Keychain al reiniciar. Verificación
rápida de que un backup abre con la llave:

```bash
CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm" \
  npx tsx -e 'import {openDb} from "./src/lib/db-open";
  const db=openDb(process.argv[1],{readonly:true});
  console.log("contacts:", db.prepare("SELECT count(*) c FROM contacts").get());
  db.close();' "/ruta/al/crm-....db"
```
