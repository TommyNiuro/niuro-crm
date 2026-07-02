# Auditoría de readiness para el primer usuario externo (2026-07-02)

Objetivo: confirmar que el repo `TommyNiuro/niuro-crm` (este fork open source) está
completo, funcional y documentado como para entregárselo a un primer usuario externo,
y dejar por escrito qué hay, por qué, y qué falta.

## 1. Veredicto

**Listo para compartir.** Un usuario externo con Node 24 puede clonar, instalar, correr
y usar el CRM completo (contactos, empresas, deals, pipeline, tickets, tareas, objetos
custom, workflows, import/export) sin configurar nada. IA y WhatsApp son opcionales y
degradan elegante si no están sus dependencias. La verificación de punta a punta se
ejecutó hoy contra lo que está en GitHub (no contra la copia local), ver sección 4.

Única decisión pendiente del operador: cómo darle acceso (invitarlo al repo privado o
hacerlo público, ver sección 6).

## 2. Qué es y por qué (decisiones de diseño)

| Decisión | Por qué |
|---|---|
| Local-first, single-tenant, un SQLite por instalación | El producto es un CRM de venta consultiva para UN operador. Sin servidor central no hay costos de infra, no hay datos de terceros que custodiar, y el usuario es dueño físico de su base (`./data/crm.db`). Es deliberado: NO es un SaaS cloud. |
| Next.js 16 + SQLite (better-sqlite3 + Drizzle) | Un solo proceso, un solo archivo de datos, cero servicios externos. |
| IA por subprocess del CLI `claude` (sin API key) | Reusa la sesión Claude ya autenticada de la máquina; el usuario no paga API ni configura keys. Contra: si no hay CLI logueado, la IA queda inactiva (documentado). |
| Auth local de una sola cuenta (scrypt + sesiones) | El fork OSS puede quedar expuesto en una LAN o compartirse; una cuenta local protege sin meter RBAC/SSO que nadie pidió. |
| Cifrado en reposo opcional (SQLCipher) | Con llave (Keychain o `CRM_DB_KEY`) la DB se cifra sola; sin llave el comportamiento es byte-idéntico al de siempre (dev, Linux, CI). La app de Mac genera la llave automáticamente. |
| Audit log con hash-chain + migraciones versionadas | Trazabilidad de eventos sensibles (login, cambios de cuenta) inmutable, y esquema evolucionable sin migraciones manuales del usuario. |
| Cola durable de workflows en SQLite | Los workflows sobreviven reinicios (estados pending/running/done/failed con backoff), sin meter Redis ni colas externas. |
| Empaquetado macOS con Tauri v2 | App nativa (.app/.dmg) para quien no quiere terminal; el mismo código sirve para `npm run local`. |

Descartado por decisión (no re-proponer): Postgres/multi-tenant, billing, RBAC/SSO/MFA,
API pública versionada, apps móviles, i18n, Sentry SDK completo, migrar la IA a API oficial.

## 3. Qué está hecho (inventario)

**Funcional**: CRM core (contactos, empresas, deals, pipeline, actividades, tickets,
tareas), objetos y campos custom (EAV), vistas genéricas (tabla/kanban/calendario/detalle),
workflows con motor + acciones IA gated, copiloto y propuestas IA, inbox WhatsApp opcional
(bridge externo), import/export CSV, import HubSpot one-shot, digest diario por email
(Resend), MCP server propio (`mcp/crm-server.ts`), onboarding de primer arranque.

**Endurecimiento (auditoría SaaS 2026-07-01, reporte en [HARDENING-2026-07-01.md](HARDENING-2026-07-01.md))**:
logger estructurado con sink por webhook, rate limiting, páginas error/not-found/loading,
cache de IA en SQLite, audit log inmutable, migraciones versionadas, SQLCipher
([SQLCIPHER-2026-07-01.md](SQLCIPHER-2026-07-01.md)), backup WAL-safe con hook off-site
([BACKUP.md](BACKUP.md)), cola durable de workflows, analítica memoizada.

**Documentación para el usuario externo**: [README](../README.md) (features, quick start,
integraciones, plataforma), [SETUP.md](SETUP.md) (paso a paso desde cero),
[INTEGRATIONS.md](INTEGRATIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[DESKTOP.md](DESKTOP.md) (app de Mac), [CONTRIBUTING.md](../CONTRIBUTING.md),
[GO-PUBLIC.md](GO-PUBLIC.md) (checklist de publicación). Licencia AGPL-3.0.

**CI**: `.github/workflows/ci.yml` (lint + tsc + test + build en cada push/PR) y
`desktop.yml` (build de la .app en tags `vX.Y.Z`).

## 4. Verificación ejecutada hoy (2026-07-02)

Sobre la copia local (main, dcea630):

| Check | Resultado |
|---|---|
| Módulo nativo cifrado (`sqlite3mc_version()`) | OK: SQLite3 Multiple Ciphers 2.3.5 |
| `npx tsc --noEmit` | Limpio |
| `npm test` | 177/177 tests en verde (24 archivos) |
| `npm run build` | OK, todas las rutas compilan |

Clon fresco desde GitHub (la experiencia real del primer usuario):

| Paso | Resultado |
|---|---|
| `gh repo clone TommyNiuro/niuro-crm` | OK (repo completo, 382 archivos tracked) |
| `npm install` en frío | OK, 716 paquetes, módulo cifrado correcto (el alias del lockfile aguanta) |
| `npm run build` + `npm run init` | OK, crea `./data/crm.db` sola |
| Server arriba y flujo de primer arranque | `/` responde 307 a `/setup-account`; `/setup-account` 200; rutas protegidas (ej. `/contacts`) redirigen sin sesión |

También verificado: `src-tauri/target/` (artefactos de build con copias recursivas del
server) está correctamente gitignorado, 0 archivos de build tracked en GitHub.

## 5. Fixes aplicados en esta auditoría

1. `scripts/detect-gaps.ts`: abría la DB con ruta personal hardcodeada
   (`~/niuro/auto-crm/data/crm.db`) y `new Database()` directo (se rompía con DB cifrada
   y en cualquier máquina ajena). Ahora usa `openDb(dbPath(), { readonly: true })`.
2. `package.json`: `name` pasó de `auto-crm` (nombre interno) a `niuro-crm` y se agregó
   `"license": "AGPL-3.0"` (coherente con LICENSE). Lockfile actualizado.
3. Restos del nombre interno "Auto-CRM" renombrados a "Niuro CRM" en: notificaciones del
   browser (2 componentes, visibles al usuario), mensajes de `scripts/init.ts`, nombre y
   docs del MCP server, comentarios en `whatsapp.ts` y `voice.ts`.
4. Nuevo `scripts/reset-account.ts`: recuperación documentada si el operador olvida su
   contraseña (resetea credenciales y sesiones reusando `deleteAccount()`, sin tocar datos).
5. Documentación: README y SETUP.md ahora explican el paso de **crear cuenta local** en el
   primer arranque (antes solo mencionaban el onboarding), el reset de contraseña y cómo
   activar el cifrado en reposo. GO-PUBLIC.md actualizado con la verificación de hoy.

## 6. Cómo compartirlo con el primer usuario externo

Pasos del operador (Tomás):

1. **Acceso**: opción A, invitarlo como collaborator al repo privado
   (`gh api -X PUT repos/TommyNiuro/niuro-crm/collaborators/<usuario> -f permission=pull`
   o desde Settings > Collaborators). Opción B, hacer el repo público
   (paso 5 de [GO-PUBLIC.md](GO-PUBLIC.md)). Decisión de producto, no técnica.
2. **Rotar la Resend key** si no se hizo (paso 1 de GO-PUBLIC.md; el fork no la incluye,
   es precaución por el repo original).
3. **Mandarle al usuario**: la URL del repo y decirle que siga [SETUP.md](SETUP.md).
   Requisitos: Node >= 24 (macOS o Linux). Con `npm install && npm run local` ya usa todo
   el CRM. Si además quiere IA: CLI `claude` instalado y autenticado. Si quiere WhatsApp:
   el bridge (ver [INTEGRATIONS.md](INTEGRATIONS.md)).

Qué esperar en su primera corrida: crear cuenta local, onboarding, CRM vacío listo para
cargar datos (o `npm run init:seed` para datos demo).

## 7. Pendientes conocidos (no bloquean el share)

- **Validación GUI del Keychain en la .app**: el código y el empaquetado del cifrado están
  verificados; falta el paso manual del operador de lanzar la .app y aceptar el permiso de
  Keychain la primera vez.
- **Búsqueda semántica (Voyage AI)**: decidida, sin empezar. Necesita API key de Voyage.
- **Windows**: sin probar (documentado en README).
- **Desktop v2** (roadmap): bundlear Node, firma + notarización, auto-update.
