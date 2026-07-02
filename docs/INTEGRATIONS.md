# Integraciones

Todas las integraciones son opcionales y van por variables de entorno en `.env.local`. La app arranca y funciona sin ninguna configurada (estado por defecto: todas OFF).

## IA (CLI `claude`)

**Qué hace.** Da vida al copiloto, a la generación de propuestas con IA y a las acciones con IA dentro de workflows.

**Cómo funciona.** No hay API key. La IA corre como un subproceso del CLI oficial `claude` (`src/lib/claude-subprocess.ts`), reutilizando tu sesión ya autenticada del CLI.

**Activar.**
1. Instalá el CLI `claude` y autenticate.
2. Si el binario no está en el PATH, seteá `CLAUDE_BIN=/ruta/al/claude`.

**Importante:** **no** configures `ANTHROPIC_API_KEY`, interfiere con la auth del CLI.

**Dejar OFF (default).** No instales el CLI / dejá `CLAUDE_BIN` sin setear. Las features de IA quedan inactivas, el resto del CRM funciona normal.

## WhatsApp inbox

**Qué hace.** Trae tus conversaciones de WhatsApp a un inbox dentro del CRM.

**Dependencia externa.** Necesita un servicio bridge de WhatsApp corriendo como HTTP en `localhost:8080`. Sin ese bridge, el inbox simplemente queda vacío.

El bridge es el de [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) (carpeta
`whatsapp-bridge`: Go + whatsmeow). Cloná ese repo, levantá el bridge y vinculá tu
teléfono escaneando el QR; el bridge guarda el historial en su propia `messages.db`,
que es a la que apunta `WHATSAPP_DB_PATH`.

**Activar.**
- `WHATSAPP_BRIDGE_URL` (default `http://localhost:8080`)
- `WHATSAPP_DB_PATH` (ruta a la `messages.db` del bridge)
- `WHATSAPP_STORE_DB_PATH` (ruta a la `whatsapp.db` del bridge, el store de sesión/contactos)
- `WHATSAPP_SINCE` (fecha desde la cual sincronizar, ej. `2024-12-01`)

**Flujo completo de conexión (importante, el QR NO lo muestra el CRM):**

1. Levantá el bridge (repo whatsapp-mcp, carpeta `whatsapp-bridge`): la **terminal del
   bridge** muestra el QR y lo escaneás desde WhatsApp en el teléfono (Dispositivos
   vinculados). El bridge descarga el historial que WhatsApp entrega a un dispositivo
   nuevo y lo va guardando en su `messages.db`.
2. En el CRM, configurá las rutas de arriba (el onboarding las pide en el paso de
   WhatsApp, o después en `/settings`).
3. Sincronizá el historial al CRM: `npm run sync:wa` (primera vez, full). Para
   actualizaciones incrementales: `npm run sync:wa -- --incr`, a mano o agendado
   (launchd/cron). El inbox muestra los chats con los nombres que da WhatsApp
   (contactos y push names del store del bridge; un chat sin nombre muestra el número).
4. La **detección y categorización de leads con IA** sobre esas conversaciones es parte
   de la integración de IA (CLI `claude`, sección de arriba): sin el CLI, el inbox
   funciona igual pero sin sugerencias ni extracción automática.

**Dejar OFF (default).** No levantes el bridge. El inbox aparece vacío; nada más se rompe.

## Sync con otra instancia de Niuro CRM

**Qué hace.** Trae contactos, empresas, deals, propuestas, tickets, actividades, tareas y radar
desde otra instancia tuya de Niuro CRM (ej. tu instalación "principal", corriendo en otra carpeta
o máquina) — útil para tener una `.app` de escritorio con los mismos datos que tu CRM del navegador.
**Fase A: solo lectura.** Esta instancia lee de la otra vía su API REST (las mismas rutas que usa
su propio frontend); nunca escribe en la instancia remota ni toca su base de datos directamente.

**Activar.**
- `CRM_SYNC_URL` (o el campo equivalente en el onboarding/ajustes), ej. `http://localhost:3001`.
- Corré `npx tsx scripts/sync-crm.ts` a mano, o disparalo periódicamente pegándole a
  `POST /api/sync/tick` (mismo patrón que `/api/workflows/tick`).

**Cómo evita duplicados.** Los ids se generan por app (UUID), así que un mismo registro lógico no
comparte id entre instancias. La tabla `sync_mappings` guarda `remote_id -> local_id` para
reconocer, en corridas siguientes, qué registro local corresponde a cuál remoto. Para tablas con
`updatedAt` (contacts, companies, deals, proposals, radar de grupos) el sync aplica último-en-
escribir-gana comparando timestamps; para las que no lo tienen (activities, tasks, tickets) solo
inserta una vez y no vuelve a actualizar.

**Dejar OFF (default).** No configures `CRM_SYNC_URL`. El sync queda desactivado, nada se rompe.

## Email digest diario (Resend)

**Qué hace.** Envía un resumen diario por email.

**Dependencia externa.** Una cuenta de [Resend](https://resend.com) (registro gratis).

**Activar.**
- `RESEND_API_KEY=re_...`
- `DIGEST_EMAIL=tu@email.com` (destinatario)
- `DIGEST_FROM=Niuro CRM <onboarding@resend.dev>` (remitente)

**Dejar OFF (default).** Dejá esas tres variables sin setear. No se envía ningún email.

## Import HubSpot (one-shot)

**Qué hace.** Importa tus datos desde HubSpot una sola vez (no es sync continuo).

**Dependencia externa.** Una cuenta de HubSpot con un token de acceso.

**Activar.**
- `HUBSPOT_API_KEY=pat-...`

**Dejar OFF (default).** Sin la variable, no se importa nada.
