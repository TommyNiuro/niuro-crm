# Personalizar CRM

Re-configura aspectos especificos del CRM sin reiniciar todo el setup.

## Opciones

Pregunta al usuario que quiere personalizar:

1. **Pipeline** — Agregar, eliminar o reordenar etapas del pipeline
2. **Fuentes de leads** — Modificar las fuentes disponibles
3. **Tema** — Cambiar entre modo claro/oscuro/automatico
4. **Idioma** — Cambiar el idioma de la interfaz
5. **KPIs** — Cambiar que metricas se muestran en el dashboard

## Proceso

1. Lee la configuracion actual:
```bash
cat crm-config.json
```

2. Segun lo que el usuario quiera cambiar, haz las modificaciones necesarias en `crm-config.json`.

3. Si se modificaron etapas del pipeline, actualiza la base de datos:
```bash
curl -s -X PUT http://localhost:3001/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{"stages": [...]}'
```

4. Confirma los cambios y sugiere recargar la pagina del CRM.

## Notas
- NO modifiques CLAUDE.md
- Solo modifica crm-config.json
- Si el usuario quiere cambios en el codigo (nuevos campos, nuevas funcionalidades), guialo sobre como hacerlo
