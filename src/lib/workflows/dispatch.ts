import { rawDb } from "@/db";
import { runWorkflow, loadWorkflow } from "./engine";
import { logger } from "@/lib/logger";

// Dispatcher de workflows (b4-engine). Corre los workflows activos que matchean
// un evento de registro o un schedule vencido. In-process, fire-and-forget desde
// los callers (no bloquea la respuesta del endpoint que disparó el evento).

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
  for (const row of rows) {
    try {
      const cfg = parseConfig(row);
      if (cfg.objectName !== objectName || cfg.event !== event) continue;
      const wf = loadWorkflow(row);
      runWorkflow(wf, { record, recordId: record.id, objectName, event }).catch((e) => {
        logger.error("workflow.run", "workflow fallo", { workflow: wf.name, err: e instanceof Error ? e.message : String(e) });
      });
    } catch (e) {
      // loadWorkflow/parse pueden tirar sincrónicamente: que un workflow roto no
      // tumbe al resto ni al caller. ponytail: swallow + log, igual que el .catch.
      logger.error("workflow.dispatch", "dispatch row fallo", { workflowId: String(row.id), err: e instanceof Error ? e.message : String(e) });
    }
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
    const last = rawDb
      .prepare(`SELECT started_at FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(row.id as string) as { started_at: number } | undefined;
    const due = !last || nowSec - last.started_at >= intervalMin * 60;
    if (!due) continue;
    const wf = loadWorkflow(row);
    try {
      await runWorkflow(wf, { scheduledAt: nowSec });
      ran++;
    } catch (e) {
      logger.error("workflow.scheduled", "workflow programado fallo", { workflow: wf.name, err: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ran };
}
