# Auditoría UX/arquitectura: Radar, Pipeline, Clientes, Ingenieros, Agenda

Fecha: 2026-07-02. Base: código en `main` (ebab030) + capturas de la app en producción.

Veredicto general: las 5 secciones comparten un mismo patrón de falla. El motor de datos
de abajo (scanners, playbook, transiciones, kanban compartido) es sólido, pero la capa
de presentación se quedó a medio cablear tras la migración multi-pipeline: parámetros
que no se pasan, campos de ventas mostrados en contextos que no son de ventas, flujos
documentados que nunca se implementaron, y datos crudos (IDs, JIDs) sin resolver a
nombres humanos.

---

## 1. Pipeline de Ventas (la más rota)

### Qué sirve
- `PipelineBoard.tsx` (521 líneas): kanban compartido por las 3 secciones, drag & drop
  propio con eco optimista y rollback. Al soltar crea `stepTransitions`, tarea del
  playbook y actualiza `nextAction` (`api/contacts/[id]/route.ts:136-172`). Eso funciona.
- El playbook por etapa (`crm-ui.ts` STAGE_CFG) con tarea, SLA y probabilidad.

### Bugs
1. CRITICO, columnas de los 3 pipelines mezcladas: `pipeline/page.tsx:26` llama
   `/api/pipeline/stages` SIN `?pipeline=prospectos`, y la API sin parámetro devuelve
   las etapas de los 3 pipelines ordenadas alfabéticamente por pipeline
   (`api/pipeline/stages/route.ts:27-41`). Por eso se ven Onboarding/Activo/Expansion/
   En riesgo (clientes) y Contactado/Entrevista/Evaluacion (ingenieros) primero, y las
   columnas reales de ventas quedan fuera de pantalla. Fix de 1 línea + exigir el
   parámetro en la API.
2. Header incoherente: Pipeline total / Ponderado / Con monto / Estancados se calculan
   sobre TODOS los leads activos (`PipelineBoard.tsx:301-310`), no sobre lo que las
   columnas muestran. Resultado: $86,050 y 59 estancados con 0 tarjetas visibles.
3. Contactos huérfanos invisibles: `contacts.stage` referencia la etapa POR NOMBRE.
   Un lead cuyo stage no matchea ninguna columna desaparece del kanban sin aviso
   (`PipelineBoard.tsx:362-366`). No hay columna "Sin etapa" ni detección.
4. Configs keyed por nombre: `EMPTY_HINT` (page.tsx:9-18) y `STAGE_CFG` se rompen en
   silencio si renombrás una etapa en Ajustes.

### Qué sobra
- `KanbanBoard.tsx`, `KanbanColumn.tsx`, `DealCard.tsx`: muertos, nadie los importa
  (traen @dnd-kit; PipelineBoard implementa su propio drag & drop). Borrar.
- `/api/pipeline` (deals): sistema paralelo sobre la tabla `deals` que el kanban no usa.
  Decidir: integrarlo o sacarlo de la superficie.
- Fetch de 1000 contactos de todos los tipos filtrado en el navegador
  (`PipelineBoard.tsx:267-273`). Filtrar en la API (`?type=`).

### Rediseño propuesto
Scoping correcto de etapas, totales calculados sobre las columnas reales, fila de aviso
para huérfanos con acción de reasignar etapa, tarjeta de venta enfocada (nombre, empresa,
monto, próximo paso con vencimiento, días en etapa solo cuando aporta), y config de
etapas resuelta desde la DB (color incluido) en vez de mapas hardcodeados por nombre.

---

## 2. Clientes (sección inalcanzable)

### Qué sirve
- Etapas correctas en DB (Onboarding, Activo, Expansion, En riesgo) y el kanban
  compartido ya scopeado (`clients/page.tsx:22` sí pasa `?pipeline=clientes`).

### Bug estructural
- NO EXISTE el flujo lead -> client. Ganar un deal no cambia `contact_type`
  (`api/deals/route.ts:43-109`), no hay botón en la ficha ni campo en formularios
  (`ContactForm.tsx`, `configs/contacts.ts` no exponen contactType). El comentario en
  `validation.ts:35-37` documenta la conversión "al ganar" pero nunca se implementó.
  Resultado: 0 contactos con `contact_type='client'`, sección vacía para siempre.

### Qué sobra / está mal
- Métricas heredadas de ventas: "Ponderado" (monto x probabilidad) no significa nada
  post-venta. Corresponde: revenue mensual actual, clientes activos, en riesgo.
- `stageCfg` genérico ignora el color de la DB para el fondo y pone task/sla/probability
  iguales para todas las etapas (`clients/page.tsx:31-44`).

### Rediseño propuesto
1. Flujo de conversión: al mover un lead a la etapa ganadora (Cierre/Expansion), ofrecer
   convertirlo en cliente (setea contact_type='client' + stage='Onboarding'); botón
   "Convertir en cliente" en la ficha del contacto como camino manual.
2. Header post-venta: revenue mensual, nº activos, nº en riesgo (sin "Ponderado").
3. Tarjeta de cliente: ingenieros colocados, revenue, última interacción, señal de salud.

---

## 3. Ingenieros (61 tarjetas clonadas)

### Qué sirve
- El pipeline correcto en DB, el kanban scopeado, y `save-engineer` que crea el
  contacto en "Contactado". El detector de reclutamiento del scorer alimenta bien.

### Bugs
1. Tarjeta de VENTAS mostrando ingenieros: temperatura "Frío" (default cold), barra y
   número rojo que son AMBOS `c.score` duplicado (`PipelineBoard.tsx:162-164` y 232-236),
   "Sin próximo paso" porque `nextAction` solo se setea al mover de etapa, "hace <1h"
   porque `lastInteractionAt` es la fecha de creación en lote. Ningún campo discrimina.
2. Nombres JID crudos ("192659381592291"): la tarjeta renderiza `contacts.name` directo
   (`PipelineBoard.tsx:152`). `phonebookNames()` ya existe en `lid.ts:111-128` y
   resolvería la mayoría; no se usa aquí.
3. `backfill-engineers.ts:60` solo hace UPDATE de contact_type: hereda stage, score,
   temperatura y next action del contexto de ventas sin resetear nada.
4. Mismo fetch de 1000 contactos filtrado client-side.

### Rediseño propuesto
Tarjeta específica de recruiting: nombre real (phonebook > agenda > JID), rol y stack,
última interacción real del chat, acceso directo al chat de WhatsApp (hoy el ícono es
decorativo), y etapa. Quitar temperatura/score/ponderado de ventas. Al marcar como
ingeniero: resetear stage a "Contactado" y limpiar los campos de venta.

---

## 4. Radar de grupos (buena data, mala superficie)

### Qué sirve
- La cadena de datos es lo mejor de la sección: scanner de grupos WhatsApp cada 5 min
  con evaluación IA + dedup (`scan-groups.ts`), scanner GetOnBoard diario con score
  heurístico (`scan-external-jobs.ts`), respuesta sugerida pre-armada, y la acción
  "Responder" con deep-link al inbox con draft (`configs/opportunities.ts:42-51`).
- Estado editable inline con PATCH, export CSV, kanban por estado funcional.

### Bugs
1. Stack con números ("1658, 18, 82..."): `scan-external-jobs.ts:59-62` guarda los IDs
   de tags de la API de GetOnBoard sin resolver a nombres. Fix en el scanner + backfill
   de las filas ya guardadas.
2. Descartadas mezcladas arriba: la tabla trae TODO sin filtro y la API ordena por
   score DESC (`api/opportunities/route.ts:21-27`). Las descartadas con score alto
   flotan al tope. Falta vista por defecto sin descartadas.
3. Badge 218 vs tabla 262: el badge cuenta solo `status=new` (`Sidebar.tsx:146-150`),
   la tabla muestra todas. Números distintos sin explicación en pantalla.
4. Sobrecarga de columnas: Fuente y Grupo/Fuente duplican información; 10 columnas
   hacen ilegible la fila.

### Rediseño propuesto
Convertirla en cola de triage, no tabla-sábana: tabs Nueva/Contactada/Descartada con
conteos (default Nueva, ordenada por score), fila esencial (rol + empresa, score, fuente,
antigüedad, stack legible), acciones rápidas Responder/Contactada/Descartar por fila,
y panel de detalle con summary y respuesta sugerida. El framework RecordIndex ya soporta
casi todo esto vía config.

---

## 5. Agenda (motor bueno, presentación plana)

### Qué sirve
- Modelo tasks + events razonable (`schema.ts:66-80, 107-120`), playbook que crea tareas
  al mover etapa, "Listo" que completa y recalcula `nextAction` del contacto
  (`api/tasks/[id]/route.ts:29-89`), snooze ya implementado (en MyDay), y una vista de
  calendario mensual REAL que ya existe (`RecordCalendar.tsx`) pero no se usa acá.

### Problemas
1. Lista plana sin agrupar: sin secciones Vencidas / Hoy / Semana, tareas y eventos
   indistinguibles, hora "--" hardcodeada cuando no hay hora (`calendar/page.tsx:122`).
2. "69 pasados" es deuda de tareas vencidas escondida tras un toggle, y mide distinto
   que el badge 17 del sidebar (vencidas de hoy vs fecha pasada): dos números
   inconsistentes para lo mismo.
3. Sin acciones: no se puede posponer ni cancelar desde la Agenda (la API ya lo
   permite, falta la UI). "Listo" es lo único.
4. Campos almacenados y nunca usados: `tasks.stepName`, `tasks.completedAt`,
   `events.agentId`, `STAGE_CFG.sla`.

### Rediseño propuesto
Agrupar por Vencidas (rojas, arriba) / Hoy / Esta semana / Más adelante, distinción
visual tarea vs evento, acciones Listo / Posponer / Cancelar por fila, vencidas viejas
con acción masiva ("marcar todo lo pasado"), vista mes opcional reusando RecordCalendar,
y una sola semántica de conteo compartida con el badge del sidebar.

---

## Hallazgos transversales

1. Etapas referenciadas por NOMBRE en `contacts.stage` + configs hardcodeadas por nombre
   (STAGE_CFG, EMPTY_HINT, ENGINEER_STAGE_CFG): renombrar etapas desincroniza UI y deja
   contactos huérfanos invisibles. Mínimo: detección de huérfanos en el kanban.
2. Una sola tarjeta (ContactCard) para 3 dominios distintos: venta, post-venta y
   recruiting necesitan tarjetas distintas sobre el mismo board.
3. Código muerto a borrar: `KanbanBoard.tsx`, `KanbanColumn.tsx`, `DealCard.tsx`.
4. Fetch de 1000 contactos filtrado en el navegador en las 3 páginas kanban: mover el
   filtro a la API.
5. Sistema `deals` paralelo al kanban de contactos: decidir integrarlo o retirarlo.

## Plan de ejecución propuesto

- Fase 0, fixes quirúrgicos (lo roto): scoping del pipeline + API estricta, totales
  sobre columnas reales, nombres de ingenieros vía phonebook, stack GetOnBoard (scanner
  + backfill), radar sin descartadas por defecto + badge coherente, borrar código muerto.
- Fase 1: Pipeline de ventas (tarjeta, huérfanos, header).
- Fase 2: Ingenieros (tarjeta de recruiting, reset al marcar, link al chat).
- Fase 3: Clientes (conversión lead -> client, métricas post-venta, tarjeta de cliente).
- Fase 4: Agenda (agrupación, acciones, vista mes).
- Fase 5: Radar (cola de triage).

## Dudas / por verificar

- Cuántos leads tienen stage huérfano exacto (requiere query sobre la DB viva).
- Si la API de GetOnBoard expone el nombre de los tags en otro endpoint (para el fix
  del stack) o conviene derivar el stack del título/descripción.
- Qué quiere Tomás con `deals`: hoy es una tabla paralela sin superficie real.
