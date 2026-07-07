/**
 * src/lib/proposals-html.ts · HTML standalone de una propuesta.
 *
 * Genera un documento HTML autocontenido (fuentes + CSS inline + markup) para
 * la pestaña "Codigo HTML" del detalle y para "Exportar HTML".
 *
 * NO usa renderToStaticMarkup(<ProposalRenderer/>) a proposito: Next.js
 * rechaza en build cualquier import de react-dom/server que llegue a un
 * componente tambien usado por paginas "use client" (ProposalRenderer lo es,
 * via /proposals/[id]/print). En su lugar, reusa el MISMO Playwright que ya
 * genera el PDF (proposals-pdf.ts): navega a /proposals/[id]/print (pagina ya
 * probada, misma fuente de verdad que el PDF) y extrae el markup YA
 * renderizado del DOM real. Cero riesgo de que preview/PDF/HTML se desincronicen.
 */
import { launchBrowser, authenticateContext, APP_ORIGIN } from "@/lib/proposals-pdf";
import { readFileSync } from "fs";
import { join } from "path";

const FONTS_IMPORT =
  '@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Host+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap");';

function extractBrandTokensCss(): string {
  const globalsPath = join(process.cwd(), "src", "app", "globals.css");
  const content = readFileSync(globalsPath, "utf-8");
  const start = content.indexOf("NIURO_PROPOSAL_CSS_START");
  const end = content.indexOf("NIURO_PROPOSAL_CSS_END");
  if (start === -1 || end === -1) return "";
  const afterMarker = content.slice(start, end);
  const ruleStart = afterMarker.indexOf(".niuro-proposal");
  return ruleStart === -1 ? "" : afterMarker.slice(ruleStart);
}

function readTemplateCss(): string {
  const cssPath = join(process.cwd(), "src", "components", "proposals", "proposal-template.css");
  try {
    return readFileSync(cssPath, "utf-8");
  } catch {
    return "";
  }
}

/** Genera el HTML standalone navegando la pagina de impresion real (mismo
 * pipeline que el PDF): garantiza paridad visual exacta con preview y PDF. */
export async function renderProposalStandaloneHtml(id: string, clientName?: string): Promise<string> {
  const url = `${APP_ORIGIN}/proposals/${encodeURIComponent(id)}/print`;
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
    await authenticateContext(context);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const body = await page.$eval(".niuro-proposal", (el) => el.outerHTML);

    const css = [extractBrandTokensCss(), readTemplateCss()].filter(Boolean).join("\n\n");
    const title = clientName ? `Propuesta Niuro · ${clientName}` : "Propuesta Niuro";

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
${FONTS_IMPORT}
body { margin: 0; background: #F5F0E8; }
${css}
</style>
</head>
<body>
${body}
</body>
</html>`;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
