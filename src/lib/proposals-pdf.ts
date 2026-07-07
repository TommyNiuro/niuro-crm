/**
 * src/lib/proposals-pdf.ts
 *
 * Exporta una propuesta a PDF usando playwright-core con el Chrome/Chromium del
 * sistema (sin @sparticuz/chromium, sin Vercel, sin share links).
 *
 * Estrategia (loopback, mismo puerto que esta instancia):
 *   1. Resuelve el ejecutable de Chrome/Chromium del sistema (ver
 *      resolveChromeExecutable). En este entorno (macOS) la ruta confiable es
 *      Google Chrome instalado; el chromium bundleado de Playwright NO sirve
 *      porque playwright-core apunta a una revision (1228) que puede no estar
 *      descargada en cache (1223), asi que preferimos un ejecutable real.
 *   2. Lanza chromium headless con ese executablePath.
 *   3. Navega a /proposals/<id>/print, espera networkidle + document.fonts.ready
 *      (Fraunces, Host Grotesk, Inter cargan async).
 *   4. Genera PDF A4, printBackground, sin margenes. Devuelve Buffer.
 *
 * Si falla por "browser not found": correr `npx playwright install chromium`
 * (descarga el binario que matchea playwright-core) o instalar Google Chrome.
 */
import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { createInternalRenderSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Base local del CRM (loopback). Lee el mismo PORT con el que arrancó ESTA
 * instancia (server.js del bundle empaquetado lo lee igual: `process.env.PORT
 * || 3000`). Antes estaba hardcodeado a 3001, que en esta Mac es OTRA app
 * distinta (~/niuro/auto-crm, corriendo aparte): el PDF/HTML terminaba
 * pidiendole /proposals/[id]/print a la app equivocada (bug real, detectado
 * 2026-07-05 comparando contra el puerto real de la .app empaquetada, 4555).
 */
const APP_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;

/**
 * Autentica el contexto de Playwright con una sesion interna efimera. Sin
 * esto, el middleware de auth (src/middleware.ts) redirige /proposals/[id]/print
 * a /login (el browser headless no trae la cookie del operador), y el render
 * sale vacio ("No se pudo cargar la propuesta") en vez del contenido real.
 * Exportado para que otros generadores que navegan paginas internas (ver
 * proposals-html.ts) lo reusen.
 */
export async function authenticateContext(context: BrowserContext): Promise<void> {
  const token = createInternalRenderSession();
  await context.addCookies([
    { name: SESSION_COOKIE, value: token, url: APP_ORIGIN },
  ]);
}

/**
 * Rutas comunes del ejecutable de Chrome/Chromium en macOS (y un par de Linux,
 * por si el repo se corre fuera de la Mac). Se prueban en orden y se devuelve
 * la primera que exista en disco.
 */
const COMMON_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/**
 * Resuelve el ejecutable a usar. Prioridad:
 *   1. PLAYWRIGHT_CHROME_PATH (override explicito por env, si alguien lo setea).
 *   2. Primera ruta comun del sistema que exista (macOS / Linux).
 *   3. undefined: deja que playwright-core use su chromium bundleado. Solo
 *      funciona si la revision esta descargada (npx playwright install chromium).
 */
function resolveChromeExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  for (const candidate of COMMON_CHROME_PATHS) {
    if (existsSync(candidate)) return candidate;
  }

  // Ultimo recurso: chromium bundleado de playwright-core (puede no existir).
  return undefined;
}

/** Base local del CRM, exportada para otros generadores que tambien navegan
 * paginas internas con Playwright (ver proposals-html.ts). */
export { APP_ORIGIN };

export async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveChromeExecutable();

  // Si encontramos un Chrome del sistema, lo usamos por executablePath. Si no,
  // intentamos el canal "chrome" (resolucion interna de Playwright) y, en su
  // defecto, el chromium bundleado. El throw guia al fix (playwright install).
  try {
    return await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (err) {
    if (executablePath) throw err;
    // Sin executablePath y bundle ausente: probar el canal "chrome".
    try {
      return await chromium.launch({
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        "No se pudo lanzar Chromium para generar el PDF. Instala Google Chrome " +
          "o corre `npx playwright install chromium`. Detalle: " +
          msg,
      );
    }
  }
}

/**
 * Genera el PDF A4 de la propuesta `id` renderizando /proposals/<id>/print.
 * Devuelve el Buffer del PDF. Lanza si la pagina no carga o el browser falla.
 */
export async function generateProposalPdf(id: string): Promise<Buffer> {
  const url = `${APP_ORIGIN}/proposals/${encodeURIComponent(id)}/print`;
  const browser = await launchBrowser();
  try {
    // Viewport al ancho de una A4 (210mm @ 96 CSS px = 794px). CLAVE: page.pdf()
    // maqueta a lo ANCHO del papel, no del viewport, asi que medir a 794 hace que
    // getBoundingClientRect() de cada .page coincida con el alto real que tendra
    // en el PDF. Con el viewport ancho de antes (1200px) el texto envolvia menos,
    // las medidas salian mas bajas que la realidad y el fit por hoja no se disparaba.
    const context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
    });
    await authenticateContext(context);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // Esperar a que las fuentes esten listas para no cortar texto a media carga.
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    // Paso 1 (bug raiz de "salia pesimo"): la pagina /print monta la propuesta en
    // un overlay `position: fixed` para tapar el chrome de la app (sidebar/header).
    // En pantalla se ve bien, pero al imprimir un elemento fixed NO pagina: Chromium
    // vuelca solo lo que entra en una hoja y descarta el resto (el PDF salia con 1
    // sola pagina y el contenido cortado). Lo sacamos a flujo normal, desclampamos
    // los contenedores del layout (h-screen / overflow-hidden) que recortan la
    // altura, y ocultamos el chrome, para que los 5 .page fluyan y paginen.
    await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".niuro-proposal");
      if (!target) return;
      document.querySelectorAll<HTMLElement>(".niuro-proposal").forEach((w) => {
        w.style.position = "static";
        w.style.overflow = "visible";
        w.style.height = "auto";
        w.style.inset = "auto";
        w.style.zIndex = "auto";
      });
      // Desclampar cada ancestro (main.overflow-hidden dentro de div.h-screen del
      // root layout, mas body/html): sin esto la altura sigue topada a una pantalla.
      let node: HTMLElement | null = target;
      while (node && node !== document.documentElement) {
        node = node.parentElement;
        if (!node) break;
        node.style.height = "auto";
        node.style.minHeight = "0";
        node.style.maxHeight = "none";
        node.style.overflow = "visible";
        node.style.display = "block";
      }
      // Ocultar el chrome: subiendo desde la propuesta, en cada nivel se ocultan los
      // hermanos que no la contienen (sidebar, header, toaster, FAB, scripts).
      let cur: HTMLElement | null = target;
      while (cur && cur !== document.body) {
        const par: HTMLElement | null = cur.parentElement;
        if (!par) break;
        for (const sib of Array.from(par.children)) {
          if (sib !== cur && !sib.contains(target)) {
            (sib as HTMLElement).style.display = "none";
          }
        }
        cur = par;
      }
    });

    // Paso 2, fit por hoja (equivalente al script del Cotizador Niuro): ya en flujo
    // normal, si una .page sigue mas alta que una A4 el PDF la parte en dos hojas y
    // deja media en blanco. Medimos con getBoundingClientRect (el alto real ya con
    // el ancho A4) y encogemos con `zoom` (afecta layout, no solo escala) SOLO las
    // que se pasan, para que cada .page calce en una hoja sin partirse.
    await page.evaluate(() => {
      // A4 a 96 CSS px = 1122.5px de alto. Margen de seguridad para redondeos.
      const A4_USABLE_PX = 1114;
      document.querySelectorAll<HTMLElement>(".page").forEach((el) => {
        const h = el.getBoundingClientRect().height;
        if (h > A4_USABLE_PX) {
          // toFixed(4): evita micro-overflow por redondeo que empujaria 1px a la hoja siguiente.
          (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = (A4_USABLE_PX / h).toFixed(4);
        }
      });
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    // page.pdf() devuelve un Buffer en Node; normalizamos por las dudas.
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
