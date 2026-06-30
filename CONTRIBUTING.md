# Contribuir

Gracias por querer aportar a Niuro CRM. Esta guía cubre lo mínimo para arrancar.

## Entorno de desarrollo

Requisitos: **Node >= 24** y npm.

```bash
git clone <url-del-repo> niuro-crm
cd niuro-crm
cp .env.example .env.local   # editá tus OPERATOR_* si querés
npm install
npm run dev                  # hot-reload en http://localhost:3000
```

Setup detallado en [docs/SETUP.md](docs/SETUP.md). Arquitectura en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests

```bash
npm test   # vitest
```

Si tocás lógica no trivial (filtros, merge de campos, workflows), agregá o actualizá su test.

## Convenciones de código

- **TypeScript** en todo el repo.
- **Strings de UI en español.**
- **No uses guión largo (—).** Usá coma, paréntesis o dos puntos.
- **Timestamps en segundos** (no milisegundos), igual que la DB.
- Para vistas de objetos, configurá vía `src/components/record/configs/`, no hardcodees en los componentes.
- Para persistencia de registros, reusá los helpers de `src/lib/custom-fields.ts` (`mergeCustomFields`, `applyCustomFieldsFromBody`).

## Proponer cambios

1. Hacé un branch desde `main` (`git checkout -b mi-cambio`).
2. Commits chicos y con mensaje claro.
3. Corré `npm test` antes de abrir el PR.
4. Abrí un Pull Request describiendo qué cambia y por qué.

## Sobre la IA

Las features de IA (copiloto, propuestas, acciones con IA en workflows) necesitan el **CLI `claude`** instalado y autenticado. No uses `ANTHROPIC_API_KEY` (interfiere con la auth del CLI). Podés contribuir al resto del CRM sin el CLI; solo las features de IA quedarán inactivas mientras desarrollás.
