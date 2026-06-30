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

**Activar.**
- `WHATSAPP_BRIDGE_URL` (default `http://localhost:8080`)
- `WHATSAPP_DB_PATH` (ruta a la DB de mensajes del bridge)
- `WHATSAPP_SINCE` (fecha desde la cual sincronizar, ej. `2024-12-01`)

**Dejar OFF (default).** No levantes el bridge. El inbox aparece vacío; nada más se rompe.

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
