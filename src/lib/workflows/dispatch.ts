import { rawDb } from "@/db";
import { enqueueJob, drainJobs } from "./queue";
import { logger } from "@/lib/logger";

// Dispatcher de workflows (b4-engine). Encola los workflows activos que matchean
// un evento de registro o un schedule vencido en la cola durable (queue.ts), en
// vez de correrlos fire-and-forget: asi un crash no pierde el trabajo y hay
// reintentos. La ejecucion sigue siendo inmediata (drain en background al encolar)
// pero ya no bloquea al caller ni depende de que el proceso siga vivo.

type RecordEvent = "created" | "updated" | "deleted";

function activeByTrigger(triggerType: string): Record<string, unknown>[] {
  return rawDb
    .prepare(`SELECT * FROM workflows WHERE trigger_type = ? AND active = 1`)
    .all(triggerType) as Record<string, unknown>[];
}

function parseConfig(row: Record<string, unknown>): Record<string, unknown> {
  try { return JSON.parse((row.trigger_config as string) || "{}"); } catch { return {}; }
}

// Dispara los record_event que matcheen {objectName, event}. record entra al
// context como `record` (+ recordId atajo). No await: corre en background y
// loguea el fallo; el caller (un PUT/POST de objeto) no debe esperar ni romperse.
export function dispatchRecordEvent(objectName: string, event: RecordEvent, record: { id: string } & Record<string, unknown>): void {
  let rows: Record<string, unknown>[];
  try {
    rows = activeByTrigger("record_event");
  } catch (e) {
    logger.error("workflow.dispatch", "dispatchRecordEvent query fallo", { err: e instanceof Error ? e.message : String(e) });
    return;
  }
  let enqueued = 0;
  for (const row of rows) {
    try {
      const cfg = parseConfig(row);
      if (cfg.objectName !== objectName || cfg.event !== event) continue;
      enqueueJob(row.id as string, { record, recordId: record.id, objectName, event });
      enqueued++;
    } catch (e) {
      // parse/insert pueden tirar: que un workflow roto no tumbe al resto ni al caller.
      logger.error("workflow.dispatch", "encolar fallo", { workflowId: String(row.id), err: e instanceof Error ? e.message : String(e) });
    }
  }
  // Ejecucion inmediata sin bloquear al caller: drenar en background. Si el
  // proceso muere antes de terminar, el job quedo persistido (pending/running) y
  // el proximo tick lo reclama. Latencia baja como el fire-and-forget, con durabilidad.
  if (enqueued > 0) {
    drainJobs().catch((e) => logger.error("workflow.drain", "drain en background fallo", { err: e instanceof Error ? e.message : String(e) }));
  }
}

// Corre los workflows 'scheduled' vencidos. Vencimiento por intervalMinutes:
// se compara contra el started_at del último run. (cron crudo no se interpreta
// aquí; ponytail: intervalMinutes cubre el caso real single-user, cron-string
// queda como mejora si hace falta agenda compleja.) Devuelve cuántos corrió.
export async function runScheduled(): Promise<{ ran: number }> {
  const rows = activeByTrigger("scheduled");
  const nowSec = Math.floor(Date.now() / 1000);
  let ran = 0;
  for (const row of rows) {
    const cfg = parseConfig(row);
    const intervalMin = Number(cfg.intervalMinutes);
    if (!intervalMin || intervalMin <= 0) continue; // sin intervalMinutes no se agenda
    // No doble-encolar: si ya hay un job pendiente/corriendo para este workflow,
    // saltar (el tick corre cada minuto; sin esto encolaria de nuevo antes de que
    // el anterior cree su workflow_run y actualice el "due").
    const inflight = rawDb
      .prepare(`SELECT 1 FROM workflow_jobs WHERE workflow_id = ? AND status IN ('pending','running') LIMIT 1`)
      .get(row.id as string);
    if (inflight) continue;
    const last = rawDb
      .prepare(`SELECT started_at FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(row.id as string) as { started_at: number } | undefined;
    const due = !last || nowSec - last.started_at >= intervalMin * 60;
    if (!due) continue;
    try {
      enqueueJob(row.id as string, { scheduledAt: nowSec });
      ran++;
    } catch (e) {
      logger.error("workflow.scheduled", "encolar programado fallo", { workflowId: String(row.id), err: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ran };
}
