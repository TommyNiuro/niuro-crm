# Configurar CRM para tu Negocio

Eres el asistente de configuracion del Auto-CRM. Vas a personalizar este CRM para el negocio del usuario.

## Proceso

### Paso 1: Informacion del negocio

Pregunta al usuario (usa AskUserQuestion si esta disponible, si no, pregunta directamente):

1. **Tipo de negocio**: Retail, Servicios, SaaS, Agencia, Bienes Raices, Consultoria, u Otro
2. **Industria**: Tecnologia, Salud, Finanzas, Educacion, Alimentos, Construccion, u Otra
3. **Tamano del equipo**: Solo, 2-5 personas, 6-20, 20+

### Paso 2: Pipeline de ventas

El pipeline de Niuro ya esta configurado con 7 etapas:
Prospecto → Discovery → Propuesta → Perfil → Entrevistas → Cierre → Expansion

Estas etapas estan hardcodeadas en `src/lib/crm-ui.ts` (STAGE_CFG) y reflejan el proceso de venta consultiva de staff augmentation. No las cambies sin actualizar STAGE_CFG.

### Paso 3: Fuentes de leads

Pregunta de donde vienen sus leads (pueden elegir multiples):
- Sitio web, WhatsApp, Referidos, Redes sociales, Llamada fria, Email, Formularios, Eventos, Otro

### Paso 4: Preferencias

1. **Idioma**: Espanol / Ingles / Bilingue
2. **Tema**: Claro / Oscuro / Automatico

### Paso 5: Generar configuracion

Con las respuestas, genera el archivo `crm-config.json` en la raiz del proyecto:

```json
{
  "business": {
    "type": "...",
    "industry": "...",
    "teamSize": "..."
  },
  "pipeline": {
    "stages": [
      { "name": "Prospecto", "order": 1, "color": "#64748b", "isWon": false, "isLost": false },
      { "name": "Contactado", "order": 2, "color": "#2563eb", "isWon": false, "isLost": false },
      { "name": "Propuesta", "order": 3, "color": "#8b5cf6", "isWon": false, "isLost": false },
      { "name": "Negociacion", "order": 4, "color": "#ea580c", "isWon": false, "isLost": false },
      { "name": "Cerrado Ganado", "order": 5, "color": "#16a34a", "isWon": true, "isLost": false },
      { "name": "Cerrado Perdido", "order": 6, "color": "#dc2626", "isWon": false, "isLost": true }
    ]
  },
  "leadSources": ["..."],
  "preferences": {
    "language": "es",
    "theme": "light"
  }
}
```

### Paso 6: Inicializar datos

1. El esquema se sincroniza automaticamente via ALTER TABLE en `src/db/index.ts` al arrancar — NO usar `npm run db:push` ni drizzle-kit.
2. Para inicializar las tablas y etapas del pipeline: `npx tsx scripts/init.ts`
3. No existe `npm run seed` — no hay datos demo en produccion.

### Paso 7: Verificar

1. Confirma que `crm-config.json` se creo correctamente
2. Ejecuta el build y reinicia: `npm run build && launchctl kickstart -k gui/$(id -u)/com.niuro.autocrm`
3. Indica al usuario que abra http://localhost:3001 para ver su CRM

## Notas importantes

- NO modifiques CLAUDE.md — toda la configuracion va en crm-config.json
- Si el servidor dev ya esta corriendo, no lo reinicies
- Responde siempre en el idioma que el usuario eligio
