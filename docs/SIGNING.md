# Firma de código y notarización

Los instaladores de los Releases se construyen en CI (`.github/workflows/desktop.yml`).
Hoy salen **sin firmar**: macOS (Gatekeeper) y Windows (SmartScreen) muestran un aviso
la primera vez. Para que abran **sin ningún aviso** hace falta firmarlos con
certificados pagos y verificados a nombre del publisher.

> Publisher configurado: **Tomás Ffrench-Davis** (`iam@tomasffrenchdavis.com`),
> en `src-tauri/tauri.conf.json` (`bundle.publisher` / `bundle.copyright`).

El workflow ya está preparado: **apenas cargues los secrets en GitHub y pushees un tag
`vX.Y.Z`, los binarios salen firmados automáticamente.** Nada de código para tocar.

Estos pasos requieren tu identidad y tu tarjeta: no se pueden automatizar por un tercero.

---

## macOS (Developer ID + notarización) — ~US$99/año

1. **Apple Developer Program.** Inscribite en https://developer.apple.com/programs/
   con tu Apple ID (`iam@tomasffrenchdavis.com`). US$99/año. (Como persona alcanza;
   como empresa Apple pide D-U-N-S.)
2. **Certificado "Developer ID Application".** En https://developer.apple.com/account
   → Certificates → `+` → *Developer ID Application* → seguí el asistente (te pide un
   CSR desde Acceso a Llaveros → Asistente de certificados). Descargalo e instalalo
   (doble click, va al Llavero).
3. **Exportá el .p12.** En Acceso a Llaveros, botón derecho sobre el certificado
   (con su clave privada) → Exportar → formato `.p12` → poné una contraseña.
4. **Team ID.** Está en https://developer.apple.com/account → Membership (10 chars).
5. **Contraseña de app para notarizar.** https://account.apple.com → Iniciar sesión y
   seguridad → Contraseñas específicas de apps → generá una (ej. "niuro-notarize").

**Cargá estos GitHub Secrets** (repo → Settings → Secrets and variables → Actions → New):

| Secret | Valor |
|---|---|
| `APPLE_CERTIFICATE` | el `.p12` en base64: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | la contraseña que le pusiste al `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Tomás Ffrench-Davis (TEAMID)` |
| `APPLE_ID` | `iam@tomasffrenchdavis.com` |
| `APPLE_PASSWORD` | la contraseña de app del paso 5 |
| `APPLE_TEAM_ID` | tu Team ID del paso 4 |

Tauri detecta estas env (las inyecta el workflow) y firma + notariza solo.

---

## Windows (code-signing) — ~US$200-600/año

1. **Comprá un certificado OV (o EV) de code-signing** en una CA (Sectigo, DigiCert,
   SSL.com…). Verifican tu identidad/empresa. Desde 2023 el certificado viene en un
   **token físico** o servicio de firma en la nube (ej. SSL.com eSigner, Azure Trusted
   Signing), no como `.pfx` suelto.
2. **Firma en CI.** Según el tipo de cert:
   - **Nube (recomendado para CI)**: Azure Trusted Signing o SSL.com eSigner exponen
     un comando de firma. Se configura en `src-tauri/tauri.conf.json` →
     `bundle.windows.signCommand`, con las credenciales como secrets.
   - **`.pfx` (si tu CA lo permite)**: base64 del `.pfx` como secret + thumbprint en
     `bundle.windows.certificateThumbprint`; el workflow lo importa antes de buildear.
3. Cargá los secrets que pida el método elegido y ajustá `bundle.windows` en tauri.conf.

> El signing de Windows varía por proveedor; cuando tengas el cert, decime cuál es y
> dejo el `signCommand` / import configurado y probado en CI.

---

## Después de cargar los secrets

```
# bump de versión si querés, luego:
git tag v0.2.2
git push origin v0.2.2
```

El push del tag dispara `desktop.yml`, que buildea Mac + Windows **firmados** y los
adjunta al Release del tag. Verificá: en Mac `spctl -a -vv "Niuro CRM.app"` debe decir
`accepted / Notarized Developer ID`; en Windows, el instalador ya no dispara SmartScreen.
