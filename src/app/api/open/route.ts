import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";

export const dynamic = "force-dynamic";

// POST /api/open { url } → abre la URL en el navegador por defecto del Mac.
// Existe porque el webview de Tauri ignora target="_blank"/window.open: la app
// es local-first (el server ES la Mac del operador), así que `open` alcanza.
// Detrás del login como toda la API; solo esquemas seguros.
const SAFE_SCHEME = /^(https?:|mailto:)/i;

export async function POST(req: NextRequest) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !SAFE_SCHEME.test(url)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  execFile("/usr/bin/open", [url], (err) => {
    if (err) console.error("[open] falló:", err.message);
  });
  return NextResponse.json({ ok: true });
}
