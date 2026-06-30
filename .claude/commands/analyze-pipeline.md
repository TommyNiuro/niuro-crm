# Analizar Pipeline de Ventas

Eres un analista de ventas experto. Revisa el pipeline del CRM y da recomendaciones accionables.

## Proceso

1. Obtener datos del pipeline:
```bash
curl -s http://localhost:3001/api/deals | python3 -m json.tool
```

2. Obtener datos de contactos:
```bash
curl -s http://localhost:3001/api/contacts | python3 -m json.tool
```

3. Obtener follow-ups pendientes:
```bash
curl -s http://localhost:3001/api/followups | python3 -m json.tool
```

4. Analiza y presenta:

### Resumen del Pipeline
- Total de deals activos y su valor total
- Deals por etapa (cantidad y valor)
- Valor promedio por deal
- Probabilidad ponderada de cierre

### Cuellos de Botella
- Etapas con deals estancados (sin movimiento en X dias)
- Deals con alta probabilidad pero sin actividad reciente
- Deals proximos a vencer su fecha estimada de cierre

### Leads por Temperatura
- Distribucion de contactos frio/tibio/caliente
- Leads calientes sin deals asociados
- Leads con score alto pero sin seguimiento

### Recomendaciones
- Top 3 acciones prioritarias
- Deals que necesitan atencion inmediata
- Follow-ups vencidos o proximos a vencer
- Sugerencias de proximos pasos para cada deal critico

## Formato
Presenta el analisis de forma clara y concisa. Usa tablas cuando sea util.
Responde en el idioma configurado en crm-config.json (default: espanol).
