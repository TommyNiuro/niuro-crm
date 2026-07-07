# Plan de ejecución — fixes de la auditoría 2026-07-07

> Basado en [AUDIT-COMPLETA-2026-07-07.md](AUDIT-COMPLETA-2026-07-07.md) (57 hallazgos verificados).
> 8 lotes por riesgo de negocio + 1 track largo estructural. Cada lote es una unidad desplegable con su verificación.

## Precondición (bloqueante)

El working tree está **muy sucio**: hay decenas de archivos modificados sin commitear (bridge/main.go, casi todas las rutas API, scripts, tauri.conf.json). Antes de aplicar cualquier fix hay que decidir qué se hace con eso, porque si no los diffs de la auditoría se mezclan con el trabajo en vuelo y se vuelve imposible revisar.

Opciones: (a) commitear el WIP actual como está, (b) stashearlo, (c) confirmar que es trabajo terminado sobre el que se puede construir. **Decisión de Tomás antes de empezar.**

## Convenciones de trabajo

- **Rama por lote:** `audit-fix/<letra>-<tema>` (ej. `audit-fix/A-dinero`), merge a main al verificar.
- **Deploy TS/Next:** `bash scripts/update-app.sh` (~3 min) al cerrar cada lote.
- **Deploy bridge Go (solo lote D1):** `npm run bridge:build` + reinicio del bridge/watchdog. NO alcanza con update-app.sh.
- **Migraciones (lote G):** correr con backup previo (`npm run backup`); la migración se aplica al arrancar la app.
- **Verificación:** contra prod (4555) con sesión efímera acuñada en `auth_sessions` para curl, y Playwright del repo para UI. El dev headless (3011) no hidrata bien.
- Todos los fixes son solo de código. Ninguno cambia el modelo de datos salvo lote G (migraciones) y los índices de lote E.

---

## Lote A — Dinero e integridad de datos  ·  prioridad 1  ·  esfuerzo M

El pipeline es la fuente de verdad del dinero: esto va primero.

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟠 Alta | Copiloto guarda dinero con error 100x (cree dólares, son centavos) | `src/lib/ai/copilot.ts:51` |
| 🟡 Media | Escrituras de deals del copiloto no re-espejan el contacto | `src/lib/ai/tools.ts:185` |
| 🟡 Media | Mover etapa del contacto pisa la etapa de TODOS sus deals | `src/lib/deal-sync.ts:104` |
| 🟡 Media | Write-through de dinero con varios deals pierde el monto por clamp a 0 | `src/lib/deal-sync.ts:94` |
| 🟡 Media | rate-cards con valores corruptos generan rangos absurdos | `src/lib/rate-cards.ts:92` |
| 🟡 Media | Hard-delete de deal con activities revienta por FK | `src/app/api/deals/[id]/route.ts:140` |
| 🔵 Baja | contacts.whatsapp_jid sin UNIQUE (idempotencia de promote sin garantía) | `src/lib/promote-lead.ts:34` |
| 🔵 Baja | Comentario de tipo contradice el unit real de deals.value | `src/components/record/types.ts:12` |
| 🔵 Baja | Falta test de probabilidad ponderada con total=0 | `src/lib/deal-sync.ts:61` |

**Verificar:** crear/editar un deal por copiloto y por UI y confirmar el monto; mover de etapa un contacto con 2 deals en etapas distintas; borrar un deal con activities; correr `npm test` (deal-sync).

## Lote B — Seguridad de superficie (auth, middleware, validación)  ·  prioridad 2  ·  esfuerzo M

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟠 Alta | Rate limit de login evadible con X-Forwarded-For (fuerza bruta) | `src/middleware.ts:42` |
| 🟡 Media | changePassword no invalida sesiones existentes | `src/lib/auth.ts:60` |
| 🟡 Media | /api/webhook inalcanzable (middleware lo redirige a /login) | `src/middleware.ts:13` |
| 🟡 Media | Endpoints /tick mutan estado sin auth ni rate-limit | `src/middleware.ts:16` |
| 🟡 Media | Upload de imágenes sin límite de tamaño ni cantidad | `src/app/api/image-leads/upload/route.ts:43` |
| 🟡 Media | Import masivo saltea validación zod (temperature/score sin restringir) | `src/app/api/import/route.ts:46` |
| 🟡 Media | Copia .plain-bak sin cifrar queda en disco si falla la migración | `src/lib/db-open.ts:142` |
| 🔵 Baja | Cookie de sesión sin flag Secure | `src/app/api/auth/login/route.ts:16` |
| 🔵 Baja | ~40 rutas devuelven error.message crudo en 500 (helper central) | `src/app/api/contacts/route.ts:136` |
| 🔵 Baja | Campos custom se guardan sin validar contra su tipo declarado | `src/lib/custom-fields.ts:102` |
| 🔵 Baja | POST /api/notes sin tope de largo de body | `src/app/api/notes/route.ts:41` |

**Verificar:** martillar /api/auth/login con XFF rotando y confirmar que ahora limita; POST a /api/webhook con secret llega al handler; cambiar password invalida sesiones; upload rechaza archivo grande.

## Lote C — Workflows y EAV (seguridad de automatizaciones)  ·  prioridad 2  ·  esfuerzo M

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟠 Alta | Steps http_request/send_email saltan el gate anti-IA (SSRF + exfiltración) | `src/lib/workflows/engine.ts:194` |
| 🟠 Alta | Job colgado >5min se re-ejecuta en paralelo (side effects duplicados) | `src/lib/workflows/queue.ts:64` |
| 🟠 Alta | Campo custom con name de columna real oculta esa columna en toda lectura | `src/lib/custom-fields.ts:76` |
| 🟡 Media | Guard SSRF es blocklist por string (evade IP entera/hex/IPv6 privada) | `src/lib/url-safety.ts:7` |
| 🟡 Media | MCP server abre la DB directo, salta auth y audit-log inmutable | `mcp/crm-server.ts:36` |
| 🔵 Baja | evalCondition re-parsea datos no confiables como expresión (inyección de condición) | `src/lib/workflows/engine.ts:277` |

**Verificar:** workflow con ai_step + http_request a {{aiOutput}} queda bloqueado sin allowAiOutput; simular job >5min y confirmar que no se duplica; crear field custom con name colisionante es rechazado.

## Lote D1 — Bridge Go  ·  prioridad 2  ·  esfuerzo M  ·  **deploy: `npm run bridge:build`**

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟠 Alta | /api/send sin auth por defecto + lectura de archivo arbitrario vía media_path | `bridge/main.go:804` |
| 🟠 Alta | events.LoggedOut no actualiza qrState (queda "connected", no re-vincula) | `bridge/main.go:1091` |
| 🟡 Media | messages.db sin WAL/busy_timeout: escrituras chocan y se pierden mensajes | `bridge/main.go:92` |
| 🟡 Media | Fallo al bindear el puerto REST se traga (bridge vivo pero sin API) | `bridge/main.go:1012` |

**Verificar:** deslogueá WhatsApp y confirmá que el CRM muestra el QR y re-vincula sin matar el proceso; /api/send exige token; probar concurrencia de sync.

## Lote D2 — WhatsApp (TS) y ops launchd  ·  prioridad 2  ·  esfuerzo S-M

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟠 Alta | Composer de WhatsApp no se limpia al cambiar de chat (mandar al contacto equivocado) | `src/components/whatsapp/Conversation.tsx:121` |
| 🟠 Alta | Sync inicial in-app: spawn("npx") sin resolver + cwd read-only + sin handler de error | `src/app/api/whatsapp/qr/route.ts:25` |
| 🟡 Media | bridge-manager spawn detached sin listener de 'error' | `src/lib/bridge-manager.ts:93` |
| 🟡 Media | Wrappers launchd con ruta nvm hardcodeada (muere al actualizar Node) | `scripts/run-whatsapp-sync.sh:7` |
| 🟡 Media | Eco optimista de mensaje enviado desaparece si el texto coincide con otro propio | `src/components/whatsapp/WhatsAppInbox.tsx:146` |

**Verificar:** escribir en un chat, cambiar a otro y confirmar composer vacío; disparar sync in-app; matar Node y ver que los wrappers no mueren silenciosos.

## Lote E — Performance  ·  prioridad 3  ·  esfuerzo S

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟡 Media | ChatList re-ejecuta sort O(n log n) con scans lineales en cada render (jank inbox) | `src/components/whatsapp/ChatList.tsx:126` |
| 🔵 Baja | crm-sync recompila SELECTs dentro del loop (N+1 de prepare) | `src/lib/crm-sync.ts:159` y `:244` |
| 🔵 Baja | Detalle de empresa escanea contacts entera por apertura (columna sin índice) | `src/app/api/companies/[id]/route.ts:29` |

**Verificar:** medir render del inbox con muchos chats; tiempo de runFullSync; índice creado.

## Lote F — Hardening de prompt-injection IA  ·  prioridad 3  ·  esfuerzo S-M

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟡 Media | task-intel: transcript sin delimitar y su salida se auto-persiste como tareas | `src/lib/task-intel.ts:65` |
| 🟡 Media | extract-lead/web-lead: contenido del lead sin delimitar ni defensa anti-injection | `src/lib/extract-lead.ts:104` |
| 🔵 Baja | Copilot reinyecta valores de campos del lead en el scratchpad sin delimitar | `src/lib/ai/copilot.ts:226` |

**Verificar:** meter una instrucción maliciosa en un transcript/lead y confirmar que no se ejecuta (reusar el patrón de fences + bloque SEGURIDAD que ya existe en propuestas/JD).

## Lote G — Schema y migraciones  ·  prioridad 3  ·  esfuerzo M  ·  correr con backup

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟡 Media | Versión de migraciones por índice de array desincroniza el fleet | `src/db/index.ts:701` |
| 🟡 Media | Default divergente de contacts.stage (Drizzle 'Prospecto' vs DDL 'Inbox') | `src/db/index.ts:400` |
| 🔵 Baja | FKs declaradas en Drizzle pero ausentes en el DDL real (proposals, job_descriptions) | `src/db/index.ts:308` |
| ⚪ Info | schema_migrations.applied_at en ms rompe la convención de segundos | `src/db/index.ts:723` |

**Verificar:** migración corre limpia sobre copia de prod; defaults e integridad referencial consistentes entre Drizzle y DDL.

## Lote H — UX/a11y y limpieza  ·  prioridad 4  ·  esfuerzo S

| Sev | Hallazgo | Dónde |
|---|---|---|
| 🟡 Media | Filas/tarjetas de Prospección son div onClick sin acceso por teclado | `src/app/prospecting/page.tsx:674` |
| 🟡 Media | Acciones rápidas invisibles con foco de teclado (solo hover) | `src/app/prospecting/page.tsx:746` |
| 🟡 Media | Formularios de JD usan span como etiqueta sin asociación al control | `src/app/job-descriptions/new/page.tsx:133` |
| 🔵 Baja | Botón de enviar del chat de JD icon-only sin nombre accesible | `src/components/job-descriptions/JobDescriptionChatPanel.tsx:139` |
| 🔵 Baja | date-fns declarada sin usar en todo el repo | `package.json:36` |
| 🔵 Baja | Sanitizado de filename copy-pasteado entre proposal y JD | `src/lib/job-description-filename.ts:24` |

**Verificar:** navegación por teclado en Prospección y JD; `npm run build` verde tras quitar date-fns.

---

## Track largo (separado) — SaaS / multi-tenant

No es un fix puntual: es el pendiente estructural que ya marcó la auditoría SaaS 2026-07-01.

| Sev | Hallazgo | Dónde |
|---|---|---|
| ⚪ Info | Cero aislamiento multi-tenant: sin tenant_id/org_id ni RLS posible en SQLite | `src/db/schema.ts:3` |
| 🔵 Baja | Caches y rate-limiter por proceso: incorrectos bajo multi-instancia | `src/middleware.ts:25` |

**Decisión de producto primero:** o se asume "una instancia por cliente" y se documenta como límite explícito, o se planifica la migración SQLite→Postgres multi-tenant con RLS. Recién ahí tiene sentido tocar código.

---

## Orden sugerido y ritmo

1. Resolver la **precondición** (WIP sin commitear).
2. Lotes en orden **A → B → C → D1 → D2** (todo lo de alta severidad cae acá).
3. Luego **E → F → G → H** (media/baja, más seguro).
4. El track SaaS se decide aparte, cuando quieras.

Cada lote: rama, fixes, `update-app.sh` (o `bridge:build` en D1), verificación, merge. Se puede parar entre lotes sin dejar el sistema a medias.
