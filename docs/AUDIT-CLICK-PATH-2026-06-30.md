# Click-path audit — Niuro CRM OSS (2026-06-30)

Sin Zustand/Redux/Context global (confirmado por grep) — el patrón "acción de store resetea otro campo" del framework no aplica en su forma clásica. El estado es `useState` local por componente + `fetch()`. La misma clase de bug reaparece vía polling silencioso que pisa updates optimistas, y vía flags de resuelto compartidos entre múltiples acciones de un mismo turno. Pasada directa, acotada a los componentes de mayor riesgo (drag-and-drop, detalle de registro, copiloto), no exhaustiva de toda la app.

## Paso 1 — Mapa de estado (equivalente a stores, aquí son hooks)

```
RecordIndex.tsx (motor genérico: tabla/kanban/calendario + panel de detalle)
  setRows(rows) → sets: {rows}                          [múltiples call sites]
  fetchRows(withSpinner) → GET listUrl → setRows(d)      REEMPLAZA rows completo (no merge)
  save(id, key, value) → sets: rows[id][key] optimista → PATCH → merge respuesta del PATCH en rows[id]
  shouldPoll = pollWhile && rows.some(pollWhile)  → setInterval cada 3s → fetchRows(false)

DANGEROUS RESET:
  fetchRows(false) [poll] → resetea CUALQUIER cambio optimista in-flight de save() que no
  haya llegado a su propio merge todavía, porque pisa el array entero con la respuesta GET,
  no lo fusiona por id.

CopilotPanel.tsx
  applyAction(turnIdx, action) → POST execute-action → sets: turns[turnIdx].resolved = true
  discard(turnIdx) → sets: turns[turnIdx].resolved = true
  Render: bloque "Cambios propuestos" (lista + botones) condicionado a !t.resolved

DANGEROUS RESET:
  "Aplicar" con turno de N≥2 actions → dispara N applyAction() en paralelo (forEach, sin
  await) → CUALQUIERA de los N que resuelva primero pone resolved=true para el turno
  ENTERO → el bloque de acciones (incluida la lista) desaparece → si otra de las N falla
  después, solo queda un toast fugaz, sin UI para reintentar esa acción puntual.
```

## Paso 2 — Hallazgos por touchpoint

### CLICK-PATH-001 [severity: MEDIUM]

**Touchpoint:** arrastrar una card en el kanban (o cualquier edición inline) en `src/components/record/RecordIndex.tsx:181` (`save`), disparado por `RecordBoard.tsx` (`onMove`) u otros inline-edit callers.

**Pattern:** Async Race (poll vs. optimistic update)

**Handler (`save`, líneas 181-211):**
```
1. setRows(optimista)              → sets rows[id][key] = nuevo valor (inmediato)
2. await fetch(PATCH updateEndpoint)
3. setRows(merge respuesta PATCH)  → confirma el valor definitivo en rows[id]
```

En paralelo, si `shouldPoll` es true (línea 120-125), cada 3s corre:
```
fetchRows(false) → GET listUrl → setRows(d)   // reemplaza TODO el array, no hace merge por id
```

**Conflicto:** si el GET del poll fue disparado antes de que el PATCH del paso 2 comitee en el servidor, su respuesta trae el valor VIEJO. Si esa respuesta de poll llega al cliente DESPUÉS del merge del paso 3 (orden de red no garantizado), `setRows(d)` sobreescribe el array completo con el valor viejo — el cambio ya confirmado por el servidor desaparece de la UI sin que el usuario haga nada.

**Combinación real que lo dispara:** `src/components/record/configs/proposals.ts` tiene `boardGroupKey: "status"` (kanban) **y** `pollWhile: row.genStatus === "generating"` (polling activo mientras OTRA propuesta se genera con IA). Arrastrar una propuesta de columna mientras cualquier otra propuesta de la lista está generándose activa el poll de 3s en simultáneo con el drag.

**Expected:** la card queda en la columna nueva de forma estable tras soltarla.
**Actual:** puede snappear de vuelta a la columna vieja si un poll llega en la ventana de la carrera, hasta el siguiente ciclo de poll (~3-6s después) que sí trae el estado correcto — autocorrige, pero el usuario ve un estado incorrecto en el medio y puede creer que el move falló.

**Fix sugerido:** en `fetchRows`, hacer merge por id en vez de reemplazo total (`setRows(prev => mergeById(prev, d))`), o descartar la respuesta del poll si su `Date.now()` de inicio es anterior al último `save()` exitoso para esa fila (guardar un timestamp de "última escritura local" por id).

---

### CLICK-PATH-002 [severity: MEDIUM]

**Touchpoint:** botón "Aplicar" en un turno del copiloto con múltiples acciones propuestas — `src/components/ai/CopilotPanel.tsx:185`.

**Pattern:** Sequential Undo (via flag de resuelto compartido) / Missing State Transition

**Handler:**
```
onClick={() => t.actions!.forEach((a) => applyAction(idx, a))}
```
Dispara N llamadas a `applyAction(idx, a)` en paralelo (sin `await`, sin `Promise.all`). Cada una, en su propio `.then` (línea 114):
```
setTurns((ts) => ts.map((t, i) => (i === turnIdx ? { ...t, resolved: true } : t)))
```
marca `resolved: true` para el turno COMPLETO, no para la acción individual que la disparó.

**Conflicto:** el bloque que muestra la lista de acciones y los botones está condicionado a `!t.resolved` (línea 175). En cuanto la PRIMERA de las N acciones resuelve (éxito o error, el código no distingue), el bloque entero desaparece. Si una acción posterior del mismo lote falla, el único rastro es un `toast.error` fugaz — no queda ninguna UI para ver cuál acción falló ni para reintentarla.

**Origen real:** el copiloto SÍ propone turnos con múltiples acciones (`copilot.ts`: `declared.length > 0` itera un array de acciones), así que esto es alcanzable en uso normal, no solo teórico.

**Expected:** "Aplicar" aplica todas las acciones propuestas del turno; si alguna falla, el usuario puede verlo y reintentar esa acción puntual.
**Actual:** si 2+ acciones se proponen juntas, solo la primera en resolver decide si el usuario sigue viendo el bloque; una falla posterior es indistinguible de un éxito silencioso salvo por un toast que pasa y no vuelve.

**Fix sugerido:** trackear `resolved` por acción (ej. `t.actionsResolved: boolean[]`) en vez de por turno, o secuenciar con `for...of` + `await` en vez de `forEach`, y solo ocultar el bloque cuando TODAS resolvieron con éxito (dejar visibles con estado de error las que fallaron, para reintentar).

## Qué no se cubrió

Esta pasada priorizó los touchpoints de mayor riesgo real (kanban con polling activo, copiloto con acciones múltiples) en vez de recorrer cada componente. No se auditó con el mismo detalle: `RecordBulkActions.tsx` (acciones masivas via `runSerial`), `InlineField.tsx` (575 líneas, edición inline campo por campo), el wizard de onboarding (`src/app/onboarding/page.tsx`, agregado hoy mismo), ni el flujo de promover/descartar leads de WhatsApp. Se verificó puntualmente que `RecordDetailPanel.tsx` SÍ resetea `notes`/`tasks`/`files` a `null` antes de refetchear al cambiar de registro seleccionado — no se encontró el bug de "estado stale del registro anterior" ahí.

## Plan de fix ordenado

1. **CLICK-PATH-001** (poll pisa optimistic update): cambiar `fetchRows` a merge-por-id en vez de reemplazo total del array. Es un fix de una función, cubre todos los objetos con `boardGroupKey` + `pollWhile` a la vez (hoy solo proposals combina ambos, pero el fix es genérico en `RecordIndex`).
2. **CLICK-PATH-002** (resolved compartido entre acciones): mover el flag de resuelto de nivel-turno a nivel-acción en `CopilotPanel.tsx`. Afecta a cualquier turno con 2+ acciones propuestas.
