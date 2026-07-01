# Backups de la base de datos

El CRM guarda todo en una sola base SQLite (`crm.db`). `scripts/backup-db.sh` hace
copias consistentes (WAL-safe), con rotación e integrity check.

## Manual

```bash
npm run backup
```

Crea un backup timestamped en `<data>/backups/crm-YYYYMMDD-HHMMSS.db`, verifica su
integridad y conserva las últimas 14 (configurable con `BACKUP_KEEP`).

## Variables de entorno

| Env | Default | Qué hace |
|---|---|---|
| `CRM_DB_PATH` / `CRM_DATA_DIR` | `./data/crm.db` | Ubicación de la DB (igual que la app). |
| `BACKUP_DIR` | `<dir de la DB>/backups` | Destino de los backups. |
| `BACKUP_KEEP` | `14` | Cuántos backups conservar (rota el resto). |
| `BACKUP_UPLOAD_CMD` | (vacío) | Comando de subida off-site. Se ejecuta con la ruta del backup como último argumento. Sin esto, la subida es no-op. |

### Off-site (opcional, sin lock-in)

No hay credenciales en el script. Para subir a donde quieras, seteá `BACKUP_UPLOAD_CMD`:

```bash
# rclone (S3, R2, GDrive, etc.)
export BACKUP_UPLOAD_CMD="rclone copy --quiet"   # -> rclone copy --quiet <backup>  (ajustá el remoto)

# aws s3
export BACKUP_UPLOAD_CMD="aws s3 cp"             # -> aws s3 cp <backup> s3://tu-bucket/  (agregá el destino)
```

## Automatizar (macOS, launchd)

Backup diario a las 3am. Guardá esto en
`~/Library/LaunchAgents/io.niuro.crm.backup.plist` y cargalo con
`launchctl load ~/Library/LaunchAgents/io.niuro.crm.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.niuro.crm.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/TU_USUARIO/niuro/niuro-crm-oss/scripts/backup-db.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CRM_DATA_DIR</key>
    <string>/Users/TU_USUARIO/Library/Application Support/io.niuro.crm</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
```

(Para la app de escritorio, `CRM_DATA_DIR` es `~/Library/Application Support/io.niuro.crm`.)

## Restaurar

Los backups son archivos SQLite normales. Para restaurar, cerrá la app y reemplazá
`crm.db` por el backup (borrá también `crm.db-wal` y `crm.db-shm` si existen):

```bash
cp "<data>/backups/crm-YYYYMMDD-HHMMSS.db" "<data>/crm.db"
rm -f "<data>/crm.db-wal" "<data>/crm.db-shm"
```
