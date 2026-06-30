# CLAUDE.md

Guía para contribuir a Niuro CRM con Claude Code u otros agentes de IA. Resumen del proyecto y las convenciones que importan al editar.

## Qué es

CRM local-first para un solo operador, con UX y paridad de funciones de Twenty. Next.js 16 (App Router) + React 19 + SQLite (better-sqlite3 + Drizzle). La IA va por subproceso del CLI `claude`, sin API key.

## Comandos

```bash
npm run dev     # desarrollo con hot-reload (localhost:3000)
npm run local   # build + init DB + start (corrida "de producción" local)
npm test        # vitest
npm run init    # inicializa/crea la DB
```

La DB SQLite se crea sola en la primera corrida (`./data/crm.db`, `CREATE TABLE IF NOT EXISTS` + seeds en `src/db/index.ts`). No hay paso de migración manual.

## Arquitectura (mapa rápido)

- `src/app/` — App Router: páginas + route handlers en `src/app/api/*`.
- `src/components/record/` — motor genérico de vistas (tabla, kanban, calendario, detalle) con ~16 componentes. No hardcodea objetos.
- `src/components/record/configs/*.ts` — config por objeto (contacts, deals, companies, proposals, tickets, leads...). Maneja el motor de vistas.
- `src/lib/custom-fields.ts` — objetos/campos custom (EAV). Helpers `mergeCustomFields` y `applyCustomFieldsFromBody`. Tablas `object_metadata`, `field_metadata`, `custom_field_values`, `custom_records`. CRUD en `src/app/api/custom/[object]/`, página en `src/app/o/[object]/page.tsx`.
- `src/lib/workflows/` — motor in-process de triggers + acciones (`engine.ts`, `dispatch.ts`).
- `src/lib/claude-subprocess.ts` — IA (copiloto, propuestas). Override del binario con `CLAUDE_BIN`.
- `src/db/index.ts` — schema Drizzle + SQL crudo + seeds.

Detalle completo en `docs/ARCHITECTURE.md`.

## Convenciones (respetalas)

- **TypeScript** en todo.
- **Strings de UI en español.**
- **Nunca guión largo (—):** usá coma, paréntesis o dos puntos.
- **Timestamps en segundos**, no milisegundos.
- **Vistas de objetos:** configurá en `configs/`, no hardcodees en los componentes.
- **Persistencia de registros:** reusá los helpers de `custom-fields.ts`, no reimplementes el merge.
- **No setees `ANTHROPIC_API_KEY`:** rompe la auth del CLI `claude` que usa la IA.

## Puntos de extensión

- Objeto del core: nueva config en `configs/` + tabla/seed en `src/db/index.ts`.
- Objeto/campo sin código: motor EAV (Ajustes > Modelo de datos).
- Automatización: trigger/acción en `src/lib/workflows/`.
- Feature de IA: `src/lib/claude-subprocess.ts`.
- Endpoint: route handler en `src/app/api/`.
