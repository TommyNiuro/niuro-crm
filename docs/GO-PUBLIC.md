# Checklist para publicar Niuro CRM

Pasos finales para pasar de "repo local sanitizado" a "repo público en GitHub".
El orden importa: primero el push privado, revisión, y recién después la visibilidad pública.

## 1. Rotar el secreto (hacelo igual, aunque el fork no lo lleve)

La `RESEND_API_KEY` estuvo en tu `.env.local` del repo original. El fork OSS no la
incluye (`.env.local` quedó fuera y el `.gitignore` lo excluye), pero pudo haber
entrado al commit baseline de tu repo privado original, así que rotala por las dudas.

- Entrá a https://resend.com/api-keys
- Revocá la key actual y generá una nueva
- Actualizá tu `.env.local` real del CRM en producción (`~/niuro/auto-crm`) con la nueva

## 2. Crear el repo privado y pushear

```bash
cd ~/niuro/niuro-crm-oss
gh repo create TommyNiuro/niuro-crm --private --source=. --remote=origin --push \
  --description "Local-first CRM con UX estilo Twenty: Next.js + SQLite + IA. Open source (AGPL-3.0)."
```

> Nota: la cuenta autenticada en `gh` es el handle **TommyNiuro** (tu cuenta personal,
> `iam@tomasffrenchdavis.com`). Si querés otro destino, cambialo en el comando.

## 3. Revisar en privado antes de abrirlo

- Abrí el repo en GitHub y confirmá que el README se ve bien (la imagen
  `docs/screenshot.png` ya está incluida, no queda imagen rota).
- Hojeá `docs/SETUP.md`, `docs/INTEGRATIONS.md`, `docs/ARCHITECTURE.md` y `CONTRIBUTING.md`.
- Opcional: cloná el repo en una carpeta limpia y corré `npm install && npm run local`
  para confirmar que arranca de cero en otra máquina.

## 4. Verificación de arranque limpio (recomendado antes de público)

En una copia fresca (sin tu `.env.local`):

```bash
git clone https://github.com/TommyNiuro/niuro-crm.git /tmp/niuro-crm-test
cd /tmp/niuro-crm-test
npm install
npm run local
```

Esperado: arranca en `http://localhost:3000`, crea `./data/crm.db` sola, y la
identidad del operador cae en los defaults genéricos ("Operador" / "Tu Empresa"),
no en tus datos. WhatsApp e IA degradan elegante si no están el bridge ni el CLI `claude`.

> Requiere **Node >= 24**. Si tu Node es menor, usá `nvm install 24 && nvm use 24`.

## 5. Hacerlo público

```bash
gh repo edit TommyNiuro/niuro-crm --visibility public --accept-visibility-change-consequences
```

## 6. Después de público (opcional, mejora el repo)

- Agregar topics: `crm`, `nextjs`, `sqlite`, `local-first`, `twenty`, `ai`.
- Activar Issues y Discussions si querés feedback.
- Subir un release inicial: `gh release create v0.1.0 --title "v0.1.0" --notes "Primer release open-source."`
- Fase 2 (cuando quieras): empaquetar como `.app` de Mac con Tauri (roadmap en el README).

---

## Estado verificado de este fork

- Sanitización: 0 hits de nombre/email/paths personales, key `re_`, ni nombres de clientes reales.
- Persona genérica por env (`OPERATOR_*` / `COMPANY_*`), default "Operador".
- `tsc --noEmit`: limpio. Suite de tests: verde en la última corrida sobre macOS.
- Arranca con DB vacía mostrando identidad genérica.
- `.gitignore` excluye `data/`, `*.db*`, `.env*` (red de seguridad extra).
- Licencia: AGPL-3.0.
