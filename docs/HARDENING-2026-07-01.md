# Endurecimiento SaaS de Niuro CRM (2026-07-01)

Registro de lo ejecutado a partir de la auditoría `docs/AUDIT-SAAS-COMPLETA-2026-07-01.md`
(gap analysis contra un SaaS de clase mundial), filtrado por la decisión de producto tomada:
**mantener el modelo desktop local-first** (SQLite + Tauri + un operador por instalación), NO
pivotar a un SaaS cloud multi-tenant. Este documento resume qué se hizo, qué se descartó y qué
queda, con los commits que lo respaldan.

## Estado en una línea

Todo lo autoverificable del plan de endurecimiento está hecho, en verde (tsc 0, lint 0/0, build
OK, **175 tests**), commiteado y mergeado a `main`. Lo único abierto: SQLCipher (en curso en la
rama `feat/sqlcipher`) y búsqueda semántica con Voyage (bloqueada en la API key).

## Lo hecho (rama `feat/saas-hardening-2026-07-01`, mergeada a `main`)

| Fase | Commit | Qué |
|------|--------|-----|
| 0 — Quick wins | `6966e45` | Observabilidad, seguridad y calidad base |
| 1 — Integridad | `6c02e4d` | Audit log inmutable + migraciones versionadas |
| 2.4 — Backup | `853005c` | Backup WAL-safe con rotación y hook off-site |
| 3.4 — Performance | `3049841` | Analítica memoizada |
| 3.3 — Durabilidad | `ebd0d83` | Cola durable de workflows en SQLite |

### Fase 0 — Quick wins (`6966e45`)
- **Logging estructurado** (`src/lib/logger.ts`): una línea JSON por evento, con sink de errores
  opcional por `ERROR_WEBHOOK_URL` (no-op sin configurar). Cableado en los catches sin contexto
  y en `workflows/dispatch.ts`.
- **Rate limiting** por IP en `src/middleware.ts` (ventana fija, 120 req/min) para las rutas `/api`.
- **`error.tsx` / `not-found.tsx` / `loading.tsx`** de App Router (antes ningún segmento los tenía;
  un error no controlado reventaba a pantalla blanca de Next).
- **Cache de IA persistido** en SQLite (tabla `ai_cache`): antes era un `Map` en memoria que se
  vaciaba en cada restart de launchd, perdiendo extracciones de 60-90s de latencia.
- **CI**: lint agregado al pipeline (`ci.yml`); `lint` acotado a `src` (antes `eslint .` recorría
  los builds de Tauri y devolvía miles de falsos positivos).
- **`@vitest/coverage-v8`** + `npm run test:coverage`.
- Resueltos los 15 errores + 11 warnings de lint reales del código fuente.
- Verificado que `jsx-a11y` ya venía activo vía `eslint-config-next` (hallazgo del reporte que
  resultó falso: el código ya pasaba esas reglas).

### Fase 1 — Integridad de datos (`6c02e4d`)
- **Audit log inmutable con hash-chain** (`src/lib/audit.ts`): cada fila encadena
  `sha256(prev_hash + payload)`. Editar o borrar una fila posterior rompe la cadena y
  `verifyAuditChain()` lo detecta (tamper-evidence). Cableado en `auth.ts`: login, logout, alta y
  borrado de cuenta, cambio de password. Tabla `audit_log` + índice.
- **Migraciones versionadas** (tabla `schema_migrations`): antes se re-corrían TODOS los `ALTER`
  en cada arranque y un error inesperado se tragaba en silencio. Ahora se corre solo lo nuevo
  (cero `ALTER` en el arranque común), y un error no esperado se logea fuerte (`logger.error`,
  puede salir por `ERROR_WEBHOOK_URL`) y corta para reintentar, en vez de dejar la DB a medio migrar.

### Fase 2.4 — Backup (`853005c`)
- `scripts/backup-db.sh`: snapshot WAL-safe (`sqlite3 .backup`), `integrity_check`, compresión y
  rotación (últimas N copias). Hook de subida off-site **env-gated** (sin credenciales en el script).
  `npm run backup` + `docs/BACKUP.md` con plist de launchd. Activar off-site: setear el bucket/creds.

### Fase 3.4 — Analítica memoizada (`3049841`)
- `src/lib/analytics-cache.ts`: cachea los 5 full-scans de `analytics/page.tsx` con TTL 60s
  (mismo patrón que `dashboard-cache.ts`, ya existente). Aditivo, sin cambiar resultados.

### Fase 3.3 — Cola durable de workflows (`ebd0d83`)
- **Problema**: `dispatchRecordEvent` disparaba `runWorkflow` fire-and-forget (sin await, sin
  persistir). Un crash a mitad perdía el evento sin rastro y no había reintentos ante fallos
  transitorios.
- **Solución** (`src/lib/workflows/queue.ts` + tabla `workflow_jobs`): el trabajo se persiste como
  job (`pending`) antes de correr; `drainJobs` lo toma de forma atómica (`UPDATE ... WHERE
  status='pending'`), lo corre, y lo marca `done` / lo reencola con backoff exponencial (30/60/120s)
  / `failed` tras `max_attempts`. Los jobs `running` colgados (proceso muerto a mitad) se reclaman
  por timeout (5 min). `dispatchRecordEvent` encola + drena en background (ejecución inmediata
  preservada). El tick encola los `scheduled` vencidos + drena (reintentos y reclamos). Solo SQLite,
  sin cola externa (BullMQ/SQS): compatible con local-first.
- `db`/`runner` inyectables para tests. 4 tests: éxito→done, fallo→retry con backoff→failed tras
  max_attempts, reclamo de colgado, `run_after` futuro no se procesa.

## Incidente de producción resuelto (repo `auto-crm`, cross-repo)

Durante el endurecimiento saltó una alerta de health-check: el sync de WhatsApp de `auto-crm`
(producción) llevaba **24h caído** (desde 30/06 20:07).

- **Causa raíz**: una despersonalización previa de `sync-wa.ts` pasó los paths del bridge a variables
  de entorno (`WHATSAPP_DB_PATH` / `WHATSAPP_STORE_DB_PATH`), pero los jobs de launchd **no cargan
  `.env.local`** (solo el server de Next la auto-carga). Sin esas envs el sync caía en paths
  relativos inexistentes (la carpeta `data/whatsapp/` se había borrado). Además `com.niuro.group-radar`
  corría el mismo `sync-wa.ts` y estaba roto en silencio (tapado por un `|| echo WARN`).
- **Fix** (commits `aa7a9f6` + `9f3d96f` en `auto-crm`): `scripts/load-env.ts`, un mini-loader sin
  dependencia (precedencia dotenv-style: una env ya seteada gana) que `sync-wa.ts` importa primero,
  cubriendo cualquier invocación (job directo o vía wrapper). Además se agregaron las envs a los
  plists de `whatsapp-sync` y `group-radar`. Sync al día (+2302 mensajes recuperados), jobs en status 0.

## Decisiones tomadas

- **Dirección de producto**: endurecer el desktop local-first. Descartado el pivote a SaaS cloud
  multi-tenant (Postgres, tenant_id, billing, RBAC/SSO, multi-región, apps móviles, i18n): contradice
  lo que este fork ES. Si algún día se quiere el SaaS, se construye como repo/capa aparte.
- **Motor de IA**: mantener el subprocess del CLI de Claude (no migrar a la API oficial).
- **Lead scoring ML**: descartado en el OSS (fork sanitizado, sin datos reales para entrenar/recalibrar).
- **Sentry**: el seam (`ERROR_WEBHOOK_URL`) es la versión mínima correcta; el SDK completo a oscuras,
  sin DSN, sería código muerto (over-engineering). Se activa cuando haya cuenta.
- **Backport de auth a `auto-crm`: NO.** `auto-crm` bindea `-H 127.0.0.1` (loopback, por diseño
  explícito), single-operator, sin exposición de red. Meter auth rompería los jobs que le pegan a su
  API por ~cero ganancia de seguridad. El fork OSS sí la necesita (se instala en máquinas de terceros).

## Abierto

- **SQLCipher (cifrado en reposo)** — decidido con la llave en macOS Keychain. **En curso** en la rama
  `feat/sqlcipher` (`src/lib/db-open.ts` centraliza la apertura con llave + migración de texto plano a
  cifrado). Verificación requiere buildear la `.app` de Tauri.
- **Búsqueda semántica (Voyage AI)** — decidida. Bloqueada: necesita la API key de Voyage y el backfill
  de embeddings sobre el historial de WhatsApp.
- **Merge de `feat/sqlcipher` a `main`** cuando esté verificada.
