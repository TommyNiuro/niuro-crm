# Briefing Diario de Ventas

Genera un resumen ejecutivo del dia para el equipo de ventas.

## Proceso

1. Obtener datos actualizados:
```bash
curl -s http://localhost:3001/api/followups
curl -s http://localhost:3001/api/deals
curl -s http://localhost:3001/api/contacts
curl -s http://localhost:3001/api/activities
```

2. Presenta el briefing:

### Buenos dias! Tu briefing de hoy:

**Follow-ups de Hoy**
- Lista de seguimientos programados para hoy
- Seguimientos vencidos (pendientes de dias anteriores)

**Deals Calientes**
- Deals con alta probabilidad que necesitan atencion
- Deals con fecha de cierre estimada esta semana

**Leads Nuevos**
- Contactos agregados recientemente sin actividad
- Leads calientes sin deal asociado

**Metricas Rapidas**
- Deals ganados esta semana/mes
- Valor total en pipeline
- Tasa de conversion actual

**Top 3 Prioridades del Dia**
- Basado en urgencia, valor y probabilidad

## Formato
Mantener el briefing conciso y accionable. Maximo 1 pagina.
Responde en espanol por defecto.
