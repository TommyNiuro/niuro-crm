/**
 * backfill-history.ts — Dispara on-demand history sync en el bridge por chat.
 *
 * Usa el endpoint que YA existe en el bridge:
 *   POST http://localhost:8080/api/request-history-sync?jid=<chatJID>
 * que le pide a WhatsApp 100 mensajes ANTES del más viejo que tenemos de ese
 * chat. Para extender más hacia atrás se vuelve a llamar (paginación), porque
 * cada corrida baja el "más viejo" y la siguiente pide otros 100 antes.
 *
 * IMPORTANTE / límites honestos:
 *  - Esto extiende historia HACIA ATRÁS (huecos al PRINCIPIO del chat). Los
 *    huecos INTERNOS (en el medio) NO se llenan así: para esos usá el re-link
 *    con full-sync (ver RECUPERAR-HISTORIA.md).
 *  - La respuesta de WhatsApp es asíncrona: el blob llega por el evento
 *    HistorySync y lo guarda el bridge. Este script dispara y espera; verificá
 *    el resultado con detect-gaps.ts después.
 *  - El teléfono debe estar online y tener esa historia. Si no la tiene, no
 *    llega nada (es el protocolo oficial, no scraping).
 *
 * Uso:
 *   # un chat puntual, 1 página
 *   npx tsx scripts/backfill-history.ts --jid 5215512345678@s.whatsapp.net
 *   # un chat, 5 páginas (≈500 msgs hacia atrás), 8s entre llamadas
 *   npx tsx scripts/backfill-history.ts --jid <JID> --pages 5
 *   # tomar la lista del detector (solo contactos/leads con hueco)
 *   npx tsx scripts/detect-gaps.ts --only-known --json | npx tsx scripts/backfill-history.ts --stdin
 *   # dry-run: muestra qué haría sin llamar
 *   npx tsx scripts/backfill-history.ts --jid <JID> --dry-run
 */
const BRIDGE = process.env.BRIDGE_URL || "http://localhost:8080";

const args = process.argv.slice(2);
function opt(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
function flag(name: string): boolean { return args.includes(`--${name}`); }

const PAGES = Number(opt("pages", "1"));
const DELAY_MS = Number(opt("delay", "8000"));
const DRY = flag("dry-run");
const FROM_STDIN = flag("stdin");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function requestSync(jid: string): Promise<{ ok: boolean; message: string }> {
  if (DRY) return { ok: true, message: "(dry-run) no se llamó" };
  try {
    const res = await fetch(`${BRIDGE}/api/request-history-sync?jid=${encodeURIComponent(jid)}`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    return { ok: !!data.success, message: data.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  // Resolver la lista de jids
  let jids: string[] = [];
  if (FROM_STDIN) {
    const raw = await readStdin();
    try {
      const parsed = JSON.parse(raw) as Array<{ jid: string }>;
      jids = parsed.map((r) => r.jid).filter(Boolean);
    } catch {
      // fallback: una jid por línea
      jids = raw.split("\n").map((l) => l.trim()).filter((l) => l.includes("@"));
    }
  } else {
    const jid = opt("jid", "");
    if (!jid) {
      console.error("Falta --jid <chatJID> o --stdin. Ver el header del script para uso.");
      process.exit(1);
    }
    jids = [jid];
  }

  if (jids.length === 0) {
    console.error("No hay jids para procesar.");
    process.exit(1);
  }

  // Chequeo de salud del bridge
  if (!DRY) {
    try {
      const h = await fetch(`${BRIDGE}/api/request-history-sync`, { method: "GET" }).catch(() => null);
      // GET devuelve 405 si el bridge está vivo (solo acepta POST). Si no responde, está caído.
      if (!h) { console.error(`Bridge no responde en ${BRIDGE}. ¿Está corriendo?`); process.exit(1); }
    } catch { /* sigue */ }
  }

  console.log(`Backfill de ${jids.length} chat(s) · ${PAGES} página(s) c/u · delay ${DELAY_MS}ms${DRY ? " · DRY-RUN" : ""}\n`);

  let okCount = 0, failCount = 0;
  for (const jid of jids) {
    for (let p = 1; p <= PAGES; p++) {
      const r = await requestSync(jid);
      const tag = r.ok ? "✓" : "✗";
      console.log(`${tag} ${jid}  [pág ${p}/${PAGES}]  ${r.message}`);
      if (r.ok) okCount++; else failCount++;
      // delay entre llamadas (excepto la última de todas)
      const isLast = jid === jids[jids.length - 1] && p === PAGES;
      if (!isLast && !DRY) await sleep(DELAY_MS);
    }
  }

  console.log(`\nListo: ${okCount} solicitudes ok, ${failCount} fallidas.`);
  console.log(`Las respuestas llegan asíncronas y las guarda el bridge. Esperá ~1-2 min y verificá:`);
  console.log(`  npx tsx scripts/sync-wa.ts --incr   # traer lo nuevo a crm.db`);
  console.log(`  npx tsx scripts/detect-gaps.ts --only-known`);
}

main();

export {};
