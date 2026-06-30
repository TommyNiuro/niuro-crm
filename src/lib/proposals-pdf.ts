/**
 * src/lib/proposals-pdf.ts
 *
 * Exporta una propuesta a PDF usando playwright-core con el Chrome/Chromium del
 * sistema (sin @sparticuz/chromium, sin Vercel, sin share links).
 *
 * Estrategia (corre en 127.0.0.1:3001, loopback, sin auth):
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
import { chromium, type Browser } from "playwright-core";

/** Base local del CRM (loopback, puerto 3001). */
const APP_ORIGIN = "http://127.0.0.1:3001";

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

async function launchBrowser(): Promise<Browser> {
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
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // Esperar a que las fuentes esten listas para no cortar texto a media carga.
    await page.evaluate(() => document.fonts.ready);
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
