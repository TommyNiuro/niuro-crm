# Setup

Cómo descargar y correr Niuro CRM en tu propia máquina. Pensado para macOS, pero el core corre igual en Linux.

## 1. Instalar Node 24

Necesitás **Node >= 24** y npm. Lo más cómodo es usar [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 24
nvm use 24
node --version   # debe imprimir v24.x o superior
```

## 2. Clonar el repo

```bash
git clone <url-del-repo> niuro-crm
cd niuro-crm
```

## 3. Configurar variables de entorno

Todas las variables son opcionales y tienen defaults razonables. Copiá la plantilla:

```bash
cp .env.example .env.local
```

Editá `.env.local` y completá tus datos de operador/marca (lo único que conviene setear desde el día uno):

```bash
OPERATOR_NAME="Tu Nombre"
OPERATOR_ROLE="Tu rol"
OPERATOR_EMAIL="tu@email.com"
COMPANY_NAME="Tu Empresa"
COMPANY_PITCH="Una línea sobre qué hace tu empresa"

# Espejo client-side (los lee el browser):
NEXT_PUBLIC_OPERATOR_NAME="Tu Nombre"
NEXT_PUBLIC_OPERATOR_ROLE="Tu rol"
```

El resto (WhatsApp, IA, Resend, HubSpot) son integraciones opcionales: ver [INTEGRATIONS.md](INTEGRATIONS.md). Podés dejarlas todas vacías y la app arranca igual.

## 4. Instalar dependencias

```bash
npm install
```

## 5. Correr

```bash
npm run local
```

`npm run local` hace tres cosas: `build` + `init` (crea/inicializa la DB) + `start`. La base SQLite se crea sola en la primera corrida en `./data/crm.db` (con `CREATE TABLE IF NOT EXISTS` + seeds), no hay migración manual.

Abrí `http://localhost:3000`. El primer arranque tiene dos pasos:

1. **Crear tu cuenta local** en `/setup-account` (email y contraseña). Es una sola cuenta
   por instalación, guardada con hash scrypt en tu DB local; no hay servidor externo ni
   verificación por email.
2. Un **onboarding** que te pide tu nombre, tu empresa (qué hace) y, opcional, la conexión
   de WhatsApp. Eso se guarda en la DB en runtime: no hace falta editar `.env.local` ni
   rebuildear para cambiar nombre/empresa (lo podés reconfigurar después desde `/settings`).
   Las `OPERATOR_*` / `COMPANY_*` del `.env` son solo un pre-seed opcional.

Para desarrollo con hot-reload usá `npm run dev` en vez de `npm run local`.

## Correrlo always-on en una Mac (launchd, opcional)

Para que el CRM quede corriendo en segundo plano y arranque solo al prender la Mac, se usa un agente de launchd (`com.niuro.autocrm`, puerto 3001). Esto es solo macOS y solo hace falta si querés tenerlo siempre disponible; para uso normal alcanza con `npm run local`.

A grandes rasgos: se crea un `~/Library/LaunchAgents/com.niuro.autocrm.plist` que ejecuta el `npm start` del proyecto con `KeepAlive`, y se carga con `launchctl load`. Ajustá las rutas a tu instalación.

## Troubleshooting

**El puerto ya está en uso.** Si el 3000 está ocupado, liberalo o corré en otro puerto:

```bash
PORT=3100 npm start
```

(Para el deploy launchd el puerto es 3001.)

**¿Dónde están mis datos?** En `./data/crm.db` (SQLite). Podés moverlo con la variable `CRM_DB_PATH`. Hacé backup de ese archivo: es toda tu base.

**La IA no funciona.** El copiloto y las propuestas IA van por un subproceso del CLI `claude`. Necesitás:
1. Tener el CLI `claude` instalado y autenticado.
2. **No** tener seteada `ANTHROPIC_API_KEY` (interfiere con la auth del CLI).

Si el binario no está en el PATH, apuntalo con `CLAUDE_BIN=/ruta/al/claude` en `.env.local`.

**Olvidé mi contraseña.** La cuenta es local, no hay "recuperar por email". Ejecutá:

```bash
npx tsx scripts/reset-account.ts
```

Resetea email, contraseña y sesiones (los datos del CRM quedan intactos); el próximo
arranque vuelve a pedir crear la cuenta en `/setup-account`.

**¿Cifrado de la base?** Opcional. Si existe la variable `CRM_DB_KEY` o la entrada del
Keychain de macOS (`security add-generic-password -s io.niuro.crm -a db-key -w "tu-llave"`),
la DB se cifra sola en el próximo arranque (SQLCipher). La app de Mac (Tauri) genera y
guarda esa llave en el Keychain automáticamente. Si perdés la llave, esos datos no se
recuperan. Detalle técnico en [SQLCIPHER-2026-07-01.md](SQLCIPHER-2026-07-01.md).
