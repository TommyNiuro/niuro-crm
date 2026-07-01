#!/usr/bin/env bash
#
# Backup WAL-safe de la base SQLite del CRM.
#
# - Usa `sqlite3 .backup` (copia online consistente, segura con WAL activo).
# - Rota: conserva las últimas $BACKUP_KEEP (default 14).
# - Verifica integridad del backup antes de considerarlo válido.
# - Subida off-site OPCIONAL y sin lock-in: si seteás BACKUP_UPLOAD_CMD, se ejecuta
#   con la ruta del backup como último argumento (ej. rclone/aws/scp). Sin esa env
#   es no-op, no necesita credenciales ni decisiones de infra para el backup local.
#
# Rutas (misma convención que src/lib/paths.ts):
#   CRM_DB_PATH    ruta del .db (prioridad)
#   CRM_DATA_DIR   carpeta de datos (si no hay CRM_DB_PATH -> $CRM_DATA_DIR/crm.db)
#   por defecto    ./data/crm.db
#   BACKUP_DIR     destino de los backups (default <dir del .db>/backups)
#
# Uso:  bash scripts/backup-db.sh   (o npm run backup)
# Cron/launchd: ver docs/BACKUP.md
#
set -euo pipefail

# ── Resolver la ruta de la DB ────────────────────────────────────────────────
if [ -n "${CRM_DB_PATH:-}" ]; then
  DB="$CRM_DB_PATH"
elif [ -n "${CRM_DATA_DIR:-}" ]; then
  DB="$CRM_DATA_DIR/crm.db"
else
  DB="$(cd "$(dirname "$0")/.." && pwd)/data/crm.db"
fi

if [ ! -f "$DB" ]; then
  echo "backup-db: no existe la DB en $DB" >&2
  exit 1
fi

command -v sqlite3 >/dev/null 2>&1 || {
  echo "backup-db: falta el binario 'sqlite3' (viene con macOS en /usr/bin/sqlite3)" >&2
  exit 1
}

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$DB")/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/crm-$TS.db"

# ── Backup online (consistente aun con la app escribiendo) ───────────────────
echo "backup-db: $DB -> $DEST"
sqlite3 "$DB" ".backup '$DEST'"

# ── Verificar integridad; si falla, no dejamos un backup corrupto ────────────
CHECK="$(sqlite3 "$DEST" 'PRAGMA integrity_check;' 2>/dev/null || echo 'error')"
if [ "$CHECK" != "ok" ]; then
  echo "backup-db: integrity_check FALLÓ ($CHECK), descarto $DEST" >&2
  rm -f "$DEST"
  exit 1
fi
echo "backup-db: integrity_check ok ($(du -h "$DEST" | cut -f1))"

# ── Rotación: conservar solo las últimas $BACKUP_KEEP ────────────────────────
COUNT="$(ls -1 "$BACKUP_DIR"/crm-*.db 2>/dev/null | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  ls -1t "$BACKUP_DIR"/crm-*.db | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
    echo "backup-db: rotación, borro $old"
    rm -f "$old"
  done
fi

# ── Subida off-site opcional (env-gated, sin credenciales en el script) ───────
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "backup-db: subiendo off-site via BACKUP_UPLOAD_CMD"
  # shellcheck disable=SC2086
  eval $BACKUP_UPLOAD_CMD "'$DEST'"
else
  echo "backup-db: off-site desactivado (seteá BACKUP_UPLOAD_CMD para habilitarlo)"
fi

echo "backup-db: listo"
