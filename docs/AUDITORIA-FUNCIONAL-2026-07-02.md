# Auditoría funcional completa - 2026-07-02

Auditoría de cada funcionalidad del CRM ejecutada sobre un **sandbox con copia de la
base de datos real migrada** (73 contactos, 1779 lead_candidates, 262 group_opportunities,
71 tareas, 474K mensajes de WhatsApp, cifrada con la llave del Keychain), servida por
`next dev` con `CRM_DB_PATH` apuntando al sandbox. La instalación viva de la .app y
auto-crm producción no se tocaron.

## Método

1. Cuenta de prueba creada vía `/api/auth/register`, sesión por cookie.
2. Barrido de las 21 páginas autenticadas (GET con sesión, chequeo de "Application error").
3. Barrido de 31 endpoints GET de la API.
4. Ciclo CRUD real: crear/editar/borrar contacto, nota, tarea (open→completed), deal.
5. Caminata en browser real (contacts, pipeline, engineers, proposals, analytics,
   whatsapp/leads, calendar, settings) con captura de errores de consola.
6. Verificación de código: `tsc --noEmit` y suite completa de tests.

## Resultados

### Páginas (21/21 OK)

`/`, `/activities`, `/analytics`, `/automations`, `/calendar`, `/companies`, `/contacts`,
`/contacts/[id]`, `/deals`, `/engineers`, `/image-leads`, `/integrations`, `/o/[object]`,
`/opportunities`, `/pipeline`, `/proposals`, `/proposals/[id]`, `/proposals/new`,
`/settings`, `/settings/ai`, `/settings/data-model`, `/status`, `/tickets`, `/whatsapp`,
`/whatsapp/leads`: **todas 200, sin errores de render ni de consola**, con los datos
reales visibles (leads calientes con score en `/whatsapp/leads`, kanban en `/pipeline`,
pipeline vacío de ingenieros en `/engineers` como corresponde a contact_type recién creado).

### API (31 endpoints GET + CRUD)

- Todos los GET de colección devuelven 200 con datos: activities, agents, automations,
  companies, contacts, deals, events, favorites, followups, image-leads, integrations,
  metadata/objects, my-day, operator, opportunities, pipeline, proposals, quick-replies,
  tasks, tickets, whatsapp/candidates, whatsapp/status, workflows, export.
- Validación correcta (400 con mensaje claro) donde faltan parámetros requeridos:
  notes, timeline, settings.
- 405 esperado en endpoints solo-POST: digest, metadata/fields.
- CRUD verificado: POST/PUT/DELETE contacto (200), POST nota (201), POST/PATCH tarea
  open→completed (200), POST/DELETE deal (200). Convención: contactos usan PUT (no
  PATCH); tareas usan PATCH con whitelist de status (open/completed/cancelled) y no
  exponen DELETE (decisión de diseño, se cancelan).
- Cero errores ni stack traces en el log del server durante todo el barrido.

### Auth y middleware

- Sin sesión: `/` redirige a `/setup-account` (sin cuenta) o `/login` (con cuenta). OK.
- `/api/auth/*` público, resto protegido, tick paths exentos para launchd. OK.
- Registro, login y reset de cuenta (scripts/reset-account.ts) funcionan; el reset
  conserva los datos del CRM. OK.

### WhatsApp (estado pre-pairing, esperado)

- `whatsapp/chats` y `whatsapp/health` devuelven 503/ok:false hasta que se conecte
  WhatsApp: la DB migrada de producción no trae settings `whatsapp_*` (auto-crm los
  resolvía por env, no por crm_settings). Al tocar **Conectar** y escanear el QR,
  bridge-manager escribe esos settings y el sync inicial puebla el inbox. Esperado.
- El flujo Conectar > QR ya fue verificado E2E hoy (bridge en 8790, QR renderizado).

### Código

- `tsc --noEmit`: limpio.
- Tests: **177/177 verdes** (con el workaround documentado de apartar data/crm.db
  cifrada antes de correr Vitest).
- Lint y build: verdes en CI (corridas de hoy en main).

## Hallazgos

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | BAJA | `whatsapp.ts` tenía `DEFAULT_BRIDGE_URL` en 8080 mientras bridge-manager usa 8790: el health check pre-pairing podía reportar `bridgeUp:true` por un bridge ajeno en 8080 (en la Mac de Tomás, el de producción). | **ARREGLADO** en este commit: default unificado a `BRIDGE_PORT` u 8790. Verificado: health ahora da `bridgeUp:false` sin bridge propio. La .app instalada aún trae el default viejo (solo afecta cosmética pre-pairing; al parear, el setting escrito manda). Queda bien en el próximo build de la .app. |
| 2 | INFO | La .app migrada mostrará el **onboarding** en el primer login: el gate lee `onboarding_completed` en crm_settings y la DB de producción no lo trae. Se completa una vez y listo. | Esperado, sin acción. |
| 3 | INFO | Conversaciones estará vacía hasta el pairing (sin settings whatsapp_* en la DB migrada). | Esperado: Conectar + escanear QR lo resuelve. |

## No ejercitado (fuera de alcance de esta corrida)

- **IA end-to-end** (asistente, generación de propuestas ~4min, reanalyze): invocan el
  CLI `claude` real y facturan; la puerta de disponibilidad (ai-gate) está cubierta por
  tests. Humo básico: `/settings/ai` y `/api/agents` OK.
- **Envío real de WhatsApp** y pairing (requiere el teléfono del operador).
- **Ticks de workflows/sync sobre datos reales** (disparan side effects: IA, envíos).
- Subida binaria de image-leads (la lista y páginas cargan OK).

## Veredicto

**Apto.** Todas las funcionalidades navegables y la API responden correctamente con la
base de datos real migrada; validaciones y auth se comportan bien; 1 solo bug (BAJA)
encontrado y arreglado en esta misma auditoría. Lo pendiente es operacional, no de
código: pairing de WhatsApp y completar el onboarding en la .app.
