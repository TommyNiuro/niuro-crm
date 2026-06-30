# Enviar Resumen por Email

Genera y envia un resumen diario del CRM por correo electronico.

## Requisitos

- `RESEND_API_KEY` en `.env.local` (obten una gratis en resend.com)
- `DIGEST_EMAIL` en `.env.local` (email donde recibir el resumen)

## Proceso

### Paso 1: Verificar configuracion

Revisa si las variables de entorno estan configuradas:
```bash
cat .env.local | grep -E "RESEND|DIGEST" 2>/dev/null || echo "No configurado"
```

Si no estan configuradas:
1. Indica al usuario que se registre en https://resend.com (gratis, 3,000 emails/mes)
2. Cree un API key en el dashboard de Resend
3. Agregue a `.env.local`:
```
RESEND_API_KEY=re_...
DIGEST_EMAIL=tu@email.com
```
4. Reinicie el servidor dev

### Paso 2: Enviar resumen

Si esta configurado, envia el digest:
```bash
curl -s -X POST http://localhost:3001/api/digest | python3 -m json.tool
```

### Paso 3: Envio automatico

El digest ya esta programado via launchd (`io.niuro.crm.digest`). No agregar crontab — generaria duplicados.

Para disparar manualmente:
```bash
curl -s -X POST http://localhost:3001/api/digest/send | python3 -m json.tool
```

## Formato del resumen

El email incluye:
- Seguimientos vencidos y de hoy
- Leads calientes sin actividad reciente
- Deals proximos a cerrar
- Metricas rapidas (contactos, deals, valor en pipeline)
