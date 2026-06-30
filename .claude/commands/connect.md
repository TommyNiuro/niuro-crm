# Conectar CRM con Servicios Externos

Eres un experto en integraciones. Ayuda al usuario a conectar su Auto-CRM con servicios externos usando Claude como capa de integracion.

## Proceso

### Paso 1: Identificar servicios disponibles

Pregunta al usuario que servicios quiere conectar:

1. **Gmail** — Leer emails y extraer leads automaticamente
2. **Google Calendar** — Crear eventos para follow-ups
3. **Google Sheets** — Exportar datos del pipeline a una hoja de calculo
4. **WhatsApp** — Importar contactos desde un export de chat
5. **Formularios web** — Recibir leads via webhook
6. **Otro** — Describir el servicio

### Paso 2: Verificar acceso

Para cada servicio, verifica si el usuario tiene el MCP server correspondiente configurado:
- Gmail: MCP server de Gmail
- Google Calendar: MCP server de Google Calendar
- Google Sheets: via export CSV o MCP
- WhatsApp: via archivo de export
- Formularios: via webhook (ya integrado en el CRM)

Si no tiene el MCP server, explica como configurarlo.

### Paso 3: Ejecutar la integracion

#### Gmail → CRM
1. Usa el MCP de Gmail para buscar emails recientes con palabras clave del negocio
2. Para cada email relevante, extrae: nombre del remitente, email, empresa (del dominio), contenido relevante
3. Crea el contacto via API:
```bash
curl -s -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"name":"NOMBRE","email":"EMAIL","company":"EMPRESA","notes":"Contenido del email..."}'
```
4. Confirma cada contacto creado con el usuario

#### CRM → Google Calendar
1. Lee los follow-ups pendientes:
```bash
curl -s http://localhost:3001/api/followups
```
2. Para cada follow-up con fecha, crea un evento en Google Calendar usando el MCP de Calendar
3. Incluye en el evento: nombre del contacto, descripcion del seguimiento, enlace al CRM

#### CRM → Google Sheets
1. Exporta los datos usando el endpoint de export:
```bash
curl -s "http://localhost:3001/api/export?type=contacts" -o contactos.csv
curl -s "http://localhost:3001/api/export?type=deals" -o deals.csv
```
2. Si tiene MCP de Sheets, sube el CSV. Si no, indica al usuario que abra el CSV en Google Sheets manualmente

#### WhatsApp Export → CRM
1. Pide al usuario la ruta del archivo de export de WhatsApp (archivo .txt)
2. Lee el archivo y extrae los numeros de telefono y nombres
3. Para cada contacto encontrado, crea via webhook:
```bash
curl -s -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"name":"NOMBRE","phone":"TELEFONO","notes":"Importado de WhatsApp"}'
```

#### Formularios Web (Webhook)
1. El webhook ya esta integrado: `POST /api/webhook`
2. Muestra la URL del webhook al usuario
3. Explica como configurarlo en:
   - **Typeform**: Settings → Webhooks → agregar URL
   - **Tally**: Integrations → Webhooks → agregar URL
   - **Google Forms**: Usar Apps Script para enviar POST al webhook
   - **Sitio web propio**: agregar fetch() al formulario de contacto

### Paso 4: Verificar

Confirma que la integracion funciono correctamente mostrando los datos creados:
```bash
curl -s http://localhost:3001/api/contacts | python3 -m json.tool
```

## Notas
- Si el servidor dev no esta corriendo, sugiere `npm run dev` primero
- Responde en el idioma del usuario
- Para integraciones que no estan listadas, usa el webhook como punto de entrada universal
