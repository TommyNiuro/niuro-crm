# Plan de endurecimiento: Niuro CRM OSS (desktop local-first)

Fecha: 2026-07-01. Deriva de `docs/AUDIT-SAAS-COMPLETA-2026-07-01.md` (en el repo
`auto-crm`), filtrado por la decisión de producto tomada: **mantener SQLite +
Tauri + un operador por instalación**. No es un SaaS cloud multi-tenant.

## Fuera de alcance (decidido)

Estas apuestas del reporte original quedan descartadas porque contradicen el
producto local-first: Postgres/CockroachDB, multi-tenancy (tenant_id), billing y
subscripciones, RBAC/ABAC granular, SSO/SAML/OIDC, MFA, API pública versionada,
multi-región, auto-scaling, colas Kafka/SQS, deploys blue-green/canary, SOC2/GDPR
formal, apps móviles nativas, white-labeling, i18n/l10n. Si algún día se quiere el
SaaS, se construye como repo/capa aparte, no reescribiendo este.

## Ya hecho (2026-07-01, verificado en verde, sin commitear)

lint 0/0, tsc 0, 169 tests, build OK. 37 archivos en working tree:

- Logger estructurado (`src/lib/logger.ts`) + sink de errores por env
  (`ERROR_WEBHOOK_URL`), cableado en 4 catches clave + `workflows/dispatch.ts`.
- Rate limiting por IP en `src/middleware.ts` (120 req/min, ventana fija).
- `error.tsx` / `not-found.tsx` / `loading.tsx` (antes ningún segmento).
- Cache de IA persistido en SQLite (tabla `ai_cache`) en `claude-subprocess.ts`.
- Coverage de tests (`@vitest/coverage-v8` + `npm run test:coverage`).
- Lint en CI (`ci.yml`) + `lint` acotado a `src` (antes recorría builds de Tauri).
- 15 errores + 11 warnings de lint reales, resueltos.
- jsx-a11y confirmado ya activo via `eslint-config-next` (falso positivo del reporte).

**Acción inmediata recomendada:** commitear esto antes de seguir. Es sólido y
verificado; arrastrarlo sin commitear encarece cada sesión siguiente.

## Fase 1: endurecimiento seguro (sin decisiones externas)

Alto valor, bajo riesgo, aditivo, compatible con local-first. Se puede hacer ya.

### 1.1 Audit log inmutable con hash-chain
- **Qué:** tabla `audit_log` append-only (id, ts, actor, action, object_type,
  object_id, detail JSON, prev_hash, hash). Cada fila encadena
  `hash = sha256(prev_hash + fila)`, así una edición/borrado posterior rompe la
  cadena y es detectable. Helper `appendAudit()` + `verifyAuditChain()`.
- **Por qué:** el timeline actual es mutable y no cubre login/logout. Con auth ya
  existente (`src/lib/auth.ts`), tiene sentido registrar eventos sensibles.
- **Dónde cablearlo primero:** `auth.ts` (login OK/fallido, logout, cambio de
  password, borrado de cuenta), escrituras de settings, borrados de registros.
- **Riesgo:** bajo (aditivo). **Esfuerzo:** medio. **Test:** hash-chain detecta
  tampering (assert-based, 1 archivo).

### 1.2 Migraciones versionadas con tabla de control
- **Qué:** tabla `schema_migrations` (version, applied_at). El array `migrations`
  de `src/db/index.ts` (20+ ALTER TABLE en try/catch) pasa a correr solo las de
  índice mayor al último aplicado. Distinguir "columna ya existe" (ok, idempotente)
  de un error real (hoy se traga en silencio) y logearlo LOUD via `logger.error`.
- **Por qué:** hoy no hay forma de saber en qué versión de esquema está una
  instalación, ni se entera si un ALTER falla de verdad.
- **Compat:** backward-safe. Instalaciones existentes: setear last_applied al largo
  actual (ya están en ese estado por el IF NOT EXISTS idempotente).
- **Riesgo:** bajo-medio (tocar el runner de arranque). **Esfuerzo:** medio.
  **NO** convertir a drizzle-kit generate/migrate: eso necesita baseline + historial
  y puede brickear DBs de instalaciones desplegadas. La tabla de control da el 80%
  del valor con 20% del riesgo.

### 1.3 (opcional) Event stream append-only
- **Qué:** tabla `events` append-only de eventos de producto (contacto creado,
  etapa cambiada, propuesta firmada) que alimente features futuras (churn,
  recomendaciones) sin tocar el estado mutable.
- **Riesgo:** bajo. **Esfuerzo:** medio. **Prioridad:** baja (solo si se van a
  consumir; si no, es YAGNI).

## Fase 2: necesitan UNA decisión de infra tuya

Reales y valiosas, pero cada una bloqueada por una elección que es tuya.

### 2.1 Cifrado en reposo (SQLCipher) — EN PROGRESO (rama feat/sqlcipher, 2026-07-01)
- **Decisión tomada:** la llave vive en el **macOS Keychain**, provista por el
  launcher Rust (`security` CLI, sin crates nuevos) e inyectada al server como
  `CRM_DB_KEY`. Fallback de lectura en Node (tambien via `security`) para que los
  scripts `tsx` funcionen. Cifrado ChaCha20 por defecto. Diseño e implementacion
  documentados en `docs/SQLCIPHER-2026-07-01.md`.
- **Hecho:** alias npm a better-sqlite3-multiple-ciphers, helper central
  `src/lib/db-open.ts` (openDb + resolveKey + migracion idempotente plana->cifrada),
  ~18 call sites convertidos, launcher Rust cableado.
- **Pendiente en la Mac:** `npm install` (regenerar lock + prebuild nativo), luego
  `tsc` + `npm test` + `npm run desktop:build` para validar end to end.
- **Nota honesta:** en un Mac con FileVault, el cifrado a nivel-app agrega
  fragilidad por seguridad marginal salvo que el modelo de amenaza sea "copian el
  archivo .db pero no la llave". Vale la pena solo con la llave en Keychain.
- **Riesgo:** alto (better-sqlite3 -> better-sqlite3-multiple-ciphers, re-key de
  DBs existentes, bundle Tauri). **Esfuerzo:** alto.

### 2.2 Búsqueda semántica sobre el historial de WhatsApp
- **Decisión que falta:** proveedor de embeddings (Anthropic no ofrece embeddings;
  se usaría Voyage/OpenAI) + su API key. Almacenamiento vectorial: `sqlite-vec` o
  coseno por fuerza bruta (alcanza para el volumen de una instalación).
- **Por qué:** hoy toda búsqueda es LIKE/texto exacto; el contra-argumento de venta
  está hardcodeado en el prompt en vez de derivarse de qué funcionó históricamente.
- **Riesgo:** medio. **Esfuerzo:** medio-alto (depende del proveedor).

### 2.3 Sentry SDK completo
- **Decisión que falta:** cuenta + DSN. Ya está el seam (`ERROR_WEBHOOK_URL` en
  `logger.ts`): con pegar una URL, los errores salen de la máquina hoy. `@sentry/nextjs`
  es el upgrade para breadcrumbs, source maps y releases.
- **Riesgo:** bajo. **Esfuerzo:** bajo una vez que haya DSN.

### 2.4 Backup off-site
- **Decisión que falta:** bucket S3/R2 + credenciales. Ademas, `niuro-crm-oss` NO
  tiene aún el `backup-db.sh` diario (ese vive en `auto-crm`): hay que portearlo
  primero, después agregar el upload off-site (env-gated, no-op sin creds).
- **Riesgo:** bajo. **Esfuerzo:** bajo-medio.

## Fase 3: producto e IA (más grandes, opcionales)

### 3.1 Motor de IA sobre la API oficial vs subprocess del CLI
- `claude-subprocess.ts` hace `spawn` de `claude -p`. Si no hay sesión Claude Max
  logueada en la máquina host, toda la IA cae en silencio. Migrar a la API da
  structured outputs, streaming y elimina esa dependencia oculta. **Esfuerzo:** alto
  (toca extract-lead, extract-web-lead, copilot, score). **Decisión:** requiere
  ANTHROPIC_API_KEY y aceptar el costo por token vs la sesión Max.

### 3.2 Lead scoring con ML real vs keywords
- `score-lead.ts` suma puntos por `.includes()` sobre listas fijas; los pesos nunca
  se recalibran con won/lost histórico (que ya existe en `contacts.stage`,
  `stepTransitions`). **Esfuerzo:** alto (pipeline de datos + modelo). Empezar por
  recalibrar pesos con datos reales antes de un modelo entrenado.

### 3.3 Motor de workflows sobre cola durable (SQLite-backed)
- `workflows/engine.ts` corre in-process; un crash a mitad pierde el trabajo sin
  reintento, y el delay está capado a 60s (no expresa follow-ups de días). Una cola
  durable en la misma SQLite (tabla `jobs` con estado + reintentos) es compatible
  con local-first, no hace falta BullMQ/SQS. **Esfuerzo:** medio-alto.

### 3.4 Analítica sin recalculo completo
- `analytics/page.tsx` trae la tabla entera a memoria y recalcula todo en cada
  render (`force-dynamic`). Snapshots diarios o memoización con revalidación por
  tiempo dan salto de percepción sin migrar de SQLite. **Esfuerzo:** medio.

## Aparte, pero el hallazgo más URGENTE (afecta a auto-crm, no a este repo)

`auto-crm` (producción, datos reales de clientes) NO tiene autenticación: ninguna
ruta HTTP verifica identidad. La solución ya existe y está probada acá en
`niuro-crm-oss` (`src/lib/auth.ts` + `middleware.ts`, commits `3b9f35a`).
**Backportear esos commits de oss a auto-crm es más urgente que cualquier ítem de
este plan.** Confirmar con vos si aplica (auto-crm es tu instancia interna
single-operator, pero sus rutas están abiertas).

## Orden sugerido de ejecución

1. Commitear lo ya hecho (Fase 0, listo).
2. Backport de auth a auto-crm (urgente, fuera de este repo).
3. Fase 1.1 (audit log) + 1.2 (migraciones versionadas): una sesión fresca.
4. Decidir infra de Fase 2 (llave de cifrado, proveedor de embeddings) y ejecutar.
5. Fase 3 según prioridad de producto.
