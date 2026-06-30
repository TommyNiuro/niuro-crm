# Arquitectura

Handoff técnico para quien quiera entender y extender el código. Niuro CRM es una app Next.js 16 local-first sobre SQLite. Todo corre en un proceso, sin servicios externos obligatorios.

## Stack

- **Next.js 16** (App Router) + **React 19**.
- **SQLite** vía **better-sqlite3** + **Drizzle ORM**.
- UI con Tailwind 4, shadcn, base-ui, dnd-kit (drag & drop de kanban), react-hook-form + zod.
- IA por subproceso del CLI `claude` (sin API key).
- Tests con **vitest**.

## Capas

### 1. App Router + API routes (`src/app/`)

Rutas de Next.js: páginas (UI) y route handlers en `src/app/api/*`. Las páginas consumen los endpoints `/api/*`, que a su vez hablan con la DB y los motores de abajo.

### 2. Motor genérico de vistas de registro (`src/components/record/`)

El corazón de la UX. Un set de ~16 componentes que renderizan **cualquier** objeto como tabla, kanban, calendario o panel de detalle, con filtros, orden, edición inline, favoritos, merge y acciones en lote. Piezas clave:

- `RecordIndex.tsx`, `RecordTable.tsx`, `RecordBoard.tsx` (kanban), `RecordCalendar.tsx`, `RecordDetailPanel.tsx`.
- `RecordViewBar.tsx`, `RecordViews.tsx`, `RecordFilters.tsx`, `RecordBulkActions.tsx`, `RecordMergeDialog.tsx`, `RecordImport.tsx`.
- Lógica de campos y filtros: `field-logic.ts`, `filters.ts`, `csv.ts`, `types.ts`.

El comportamiento por objeto **no** está hardcodeado en los componentes: viene de configs.

### 3. Configs por objeto (`src/components/record/configs/*.ts`)

Cada objeto tiene un archivo de config (`contacts.ts`, `deals.ts`, `companies.ts`, `proposals.ts`, `tickets.ts`, `leads.ts`, `opportunities.ts`, etc.) que declara sus campos, columnas, vistas y comportamiento. El motor de la capa 2 lee esa config y se arma solo. **Para agregar o ajustar un objeto del core, esta es la primera parada.**

### 4. Objetos y campos custom: metadatos / EAV

Sistema de objetos y campos definidos por el usuario en runtime (Ajustes > Modelo de datos), sin tocar código. Es un motor de metadatos tipo EAV con cuatro tablas:

- `object_metadata`, `field_metadata`: definición de objetos y campos custom.
- `custom_field_values`, `custom_records`: los datos.

Helpers en `src/lib/custom-fields.ts`:
- `mergeCustomFields(...)`: combina los valores custom dentro de un registro.
- `applyCustomFieldsFromBody(...)`: aplica los campos custom que vienen en el body de un request.

CRUD genérico en `src/app/api/custom/[object]/` y página dinámica en `src/app/o/[object]/page.tsx`. Los objetos custom reusan el mismo motor de vistas de la capa 2/3. **Si tocás persistencia de registros, reusá estos helpers en vez de reimplementar el merge.**

### 5. Motor de workflows (`src/lib/workflows/`)

Automatizaciones in-process: triggers + acciones. Archivos clave: `engine.ts` (ejecución) y `dispatch.ts` (ruteo de eventos a workflows). Las acciones pueden invocar IA.

### 6. IA por subproceso (`src/lib/claude-subprocess.ts`)

Copiloto y propuestas IA. Lanza el CLI `claude` como subproceso (override del binario con `CLAUDE_BIN`). No usa `ANTHROPIC_API_KEY`; depende de la sesión autenticada del CLI.

### 7. DB y seeds (`src/db/index.ts`)

Schema en Drizzle + SQL crudo, más los seeds iniciales. La DB se crea sola en la primera corrida con `CREATE TABLE IF NOT EXISTS`, no hay paso de migración manual. Archivo en `./data/crm.db` (override con `CRM_DB_PATH`).

> Convención importante: **los timestamps se guardan en segundos** (no milisegundos). Tenelo en cuenta al leer o escribir fechas.

## Puntos de extensión más comunes

- **Nuevo objeto del core:** agregá una config en `src/components/record/configs/` y su tabla/seed en `src/db/index.ts`.
- **Objeto/campo sin código:** Ajustes > Modelo de datos (motor EAV, capa 4).
- **Nueva automatización:** un trigger/acción en `src/lib/workflows/`.
- **Nueva feature de IA:** apoyate en `src/lib/claude-subprocess.ts`.
- **Nuevo endpoint:** route handler en `src/app/api/`.
