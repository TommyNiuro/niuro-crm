/**
 * src/lib/job-descriptions-pdf.ts
 *
 * Exporta una Descripción de Cargo a PDF con Playwright, renderizando
 * /job-descriptions/<id>/print. Reusa la maquinaria frágil ya resuelta en
 * proposals-pdf.ts (resolución del Chrome del sistema, sesión de auth interna,
 * APP_ORIGIN); acá solo va la parte específica de JD.
 *
 * Diferencia con el PDF de propuestas: la JD usa FLUJO NATURAL (diseño de la
 * skill: @page margins + body::before warm bg + contenido que fluye, sin cajas
 * .page de altura fija). Por eso solo aplicamos el Paso 1 del fix (sacar el
 * overlay fixed a flujo normal + desclampar + ocultar chrome), NO el zoom por
 * hoja. Los márgenes A4 los pone el @page de la página print (preferCSSPageSize).
 */
import { APP_ORIGIN, authenticateContext, launchBrowser } from "@/lib/proposals-pdf";

export async function generateJobDescriptionPdf(id: string): Promise<Buffer> {
  const url = `${APP_ORIGIN}/job-descriptions/${encodeURIComponent(id)}/print`;
  const browser = await launchBrowser();
  try {
    // Viewport ancho A4 (210mm @ 96px = 794px): page.pdf() maqueta al ancho del
    // papel, así que medir a 794 evita reflows entre preview y PDF.
    const context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
    });
    await authenticateContext(context);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    // La página print monta la JD en un overlay position:fixed para tapar el
    // chrome. Un elemento fixed NO pagina al imprimir (Chromium vuelca solo lo
    // que entra en una hoja y descarta el resto). La sacamos a flujo normal,
    // desclampamos los ancestros que topan la altura (h-screen / overflow-hidden
    // del root layout) y ocultamos el chrome, para que el contenido fluya y
    // pagine natural.
    await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".niuro-jd");
      if (!target) return;
      target.style.position = "static";
      target.style.overflow = "visible";
      target.style.height = "auto";
      target.style.inset = "auto";
      target.style.zIndex = "auto";
      target.style.padding = "0";
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

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true, // usa el @page { size:A4; margin } de la página print
    });
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
