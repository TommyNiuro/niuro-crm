# Changelog

Historial de versiones de Niuro CRM. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versionado [SemVer](https://semver.org/lang/es/).

## [0.2.1] - 2026-07-08

Correcciones, endurecimiento para uso open source y migración de tareas programadas.

### Corregido

- **Aislamiento de tests**: ya no dependen de la DB local del repo (setup de Vitest con `CRM_DATA_DIR` temporal por archivo); `sharedDb()` reabre si cambia la ruta de la DB. 257 tests en verde, CI incluido.
- **Puerto del bridge de WhatsApp** documentado correctamente (`8790`) en README, `.env.example` e INTEGRATIONS (antes decía `8080` y la conexión fallaba siguiendo el doc).
- **Higiene del build de escritorio**: el bundle ya no arrastra `data/` (la DB local) ni `.env*`.

### Cambiado

- **CC de propuestas** configurable por `NEXT_PUBLIC_PROPOSAL_CC` (antes clavado a una casilla fija).
- **Digest y categorización** corren directo contra la DB (sin depender de un server en un puerto fijo).
- Rutas personales fuera de los scripts de ops (`$HOME` + ruta relativa al script).

### Notas

- Documentado el modelo **single-tenant** (una instancia por operador): ver sección "Tenancy" del README.

## [0.2.0] - 2026-07-02

Versión mayor de funcionalidad: migración de los datos reales a la .app, reformulación completa de Ajustes, Analítica y Conversaciones, multi-pipeline y unificación de identidades de WhatsApp.

### Conversaciones (WhatsApp)

- **Unificación de identidades lid/teléfono** (`572b1cd`, `ebab030`): WhatsApp migró a identificadores LID; el store del bridge y el archivo histórico identificaban a la misma persona con dos IDs distintos. Ahora `listChats`/`getMessages` fusionan ambas fuentes por jid canónico usando el mapa `whatsmeow_lid_map` del bridge (~51k mapeos): un chat por persona, con su historial completo deduplicado.
- **Inbox siempre fresco** (`572b1cd`): antes la lista se servía solo del archivo interno (congelado hasta correr el sync); ahora lo vivo viene siempre del store del bridge y la lista se auto-refresca cada 20s.
- **Ranking real** (`ebab030`): el history sync del pairing escribe `chats.last_message_time` en tandas con horas falsas; el orden del inbox ahora usa el timestamp real del último mensaje y excluye chats fantasma sin mensajes.
- **Nombres y teléfonos visibles** (`ebab030`): cadena de resolución de nombres por identidad canónica: agenda del teléfono (`whatsmeow_contacts`) > nombres históricos del archivo > contactos del CRM > `+teléfono`.
- **Marcas del operador re-enlazadas** (`ebab030`): las marcas hechas sobre el jid viejo (ingeniero, lead, descartado) se aplican también al chat nuevo `@lid`. Regla de producto: el inbox muestra SOLO posibles clientes; ingenieros y "no es de ventas" se ocultan.
- **Detector de reclutamiento en el scoring** (`23a28f1`): cuando el operador está reclutando a la persona (postulación, su CV, entrevista para un cargo), el panel clasifica "Candidato · Ingeniero" en vez de puntuar como venta. Antes un candidato podía salir "48/100 tibio de venta".
- **Overhaul de la sección** (`d7f92f1`): fix del 500 al archivar chats con candidate previo; eco optimista persistente (el mensaje enviado desde el CRM ya no desaparece del chat); insignias contextuales en la lista (casco = ingeniero, apretón de manos = cliente, llama = caliente, X = descartado); extracción IA más útil (rol por mejor hipótesis, descripción de cargo en borrador, siempre al menos una pregunta pendiente, etapa real restringida al playbook); sugerencias de respuesta con reglas de humanidad (espejo del registro del contacto, cero venta en conversaciones personales).
- **Contraste de UI** (`11ffe4d`, `d242818`): desglose de score con el color de la temperatura del lead; botones secundarios del panel legibles en modo claro.

### Ajustes

- **Reformulación completa en secciones** (`adec2e2`): sub-navegación propia (Negocio, Pipelines, Radar y scoring, Modelo de datos, Agentes IA, Integraciones, Notificaciones, Apariencia, Cuenta, Claude Code). Se van los carteles de "ejecutá /setup en Claude Code": todo editable en la app.
- **Multi-pipeline** (`adec2e2`): tres pipelines en la base de datos (Prospectos, Clientes, Ingenieros), cada uno con editor completo de etapas (renombrar con propagación a contactos y tareas, reordenar, color, crear, borrar con bloqueo si hay contactos). Nueva API `/api/pipeline/stages?pipeline=`. Kanban nuevo de Clientes en el nav.
- **Negocio y meta editables** (`ca6a4df`): identidad del operador (nombre, rol, email, empresa, pitch) y meta MRR mensual, enlazadas al Inicio y a Analítica.

### Analítica

- **Reformulación en secciones por dominio** (`8a47211`): Ventas (meta, distribución, embudo con conversión y velocidad), Pérdidas, Actividad (tareas, radar, WhatsApp 30d), Ingenieros y Clientes. Ventas filtra solo contactos del pipeline de ventas.
- **Respuesta mediana honesta** (`8a47211`, `3e8c8a0`): nueva métrica de primera respuesta en chats 1 a 1, excluyendo grupos (con grupos daba "0 min").

### Accionabilidad (`3e8c8a0`)

- Radar de leads: decay automático de candidatos sin actividad 30+ días (configurable) y temperatura por percentil del batch: "Caliente" vuelve a discriminar.
- Agenda: badge de tareas vencidas en el sidebar.
- Propuestas: tarea de follow-up automática a 72h al marcar una propuesta como enviada.
- Guardar lead: dedup por teléfono además del jid.
- Scripts nuevos: `backfill-engineers.ts` (sugiere ingenieros por keywords en el historial) y `clean-contacts.ts` (renombra contactos con nombre-número y reporta duplicados).

### Infraestructura

- **Bridge de WhatsApp en puerto propio 8790** (`f65c856`, `9a2ba5a`): el 8080 chocaba con otras instalaciones; default unificado en bridge-manager y health check.
- **`scripts/update-app.sh`** (`5933a50`): un comando para llevar el código del repo a la .app instalada (build standalone + swap + reinicio + healthcheck), sin rebuild completo de Tauri.
- Pipeline de Ingenieros con botón "Es un ingeniero" y kanban propio (`57a8635`).
- Auditoría funcional completa documentada en `docs/AUDITORIA-FUNCIONAL-2026-07-02.md`.

## [0.1.0] - 2026-07-02 (base, sin tag)

Estado inicial del fork open source, previo a esta versión:

- Fork sanitizado de auto-crm (AGPL-3.0), cero secretos/PII, historia limpia.
- Cuenta local por instalación (email + contraseña scrypt), cifrado de la DB en reposo (SQLCipher vía better-sqlite3-multiple-ciphers, llave en Keychain de macOS o `CRM_DB_KEY`).
- Empaquetado como .app de macOS con Tauri v2, bridge de WhatsApp (Go, fork de lharries/whatsapp-mcp) embebido en el bundle.
- Conexión de WhatsApp 100% desde la UI (Conectar > QR > sync inicial automático).
- CRM completo: inbox de WhatsApp con scoring de leads por reglas, radar de grupos, pipeline kanban, propuestas con generación IA, agenda, automatizaciones, analítica, modelo de datos extensible, agentes IA.
- Compatibilidad verificada en CI real: Windows, macOS Intel/ARM y Linux (177 tests).
