/**
 * Cola durable de workflows en SQLite (auditoria SaaS 2026-07-01, fase 3.3).
 *
 * Antes: dispatchRecordEvent disparaba runWorkflow fire-and-forget (sin await,
 * sin persistir el trabajo). Un crash del proceso a mitad de un workflow perdia
 * el evento sin rastro, y no habia reintentos ante fallos transitorios (ej. un
 * http_request a un endpoint momentaneamente caido).
 *
 * Ahora: el trabajo se PERSISTE como un job (pending) antes de correr. Un worker
 * (drainJobs, invocado en background al encolar y por el tick) lo toma de forma
 * atomica, lo corre, y segun el resultado lo marca done / lo reencola con backoff
 * / lo da por failed tras agotar reintentos. Los jobs 'running' que quedan
 * colgados (proceso murio a mitad) se reclaman por timeout. Todo en el mismo
 * SQLite: sin cola externa (BullMQ/SQS), compatible con el modelo local-first.
 *
 * Proceso unico (el server de Next): better-sqlite3 es sincrono, asi que el
 * unico interleaving es entre llamadas async a drainJobs (la de background al
 * encolar y la del tick). El claim atomico (UPDATE ... WHERE status='pending')
 * garantiza que cada job corre a lo sumo una vez por intento.
 */
import crypto from "crypto";
import type Database from "better-sqlite3";
import { rawDb } from "@/db";
import { runWorkflow, loadWorkflow, type Workflow } from "./engine";
import { logger } from "@/lib/logger";

type Ctx = Record<string, unknown>;
type DB = Database.Database;

/** Firma de runWorkflow, inyectable para tests (evita tocar la DB real / la IA). */
export type Runner = (wf: Workflow, ctx: Ctx) => Promise<{ status: "success" | "error"; logs: { ok: boolean; detail?: string }[] }>;

const MAX_ATTEMPTS = 3;
const STUCK_SEC = 5 * 60; // un job 'running' mas viejo que esto = proceso colgado
const BACKOFF_BASE_SEC = 30; // reintentos: 30s, 60s, 120s (2^(attempt-1))

interface JobRow {
  id: string;
  workflow_id: string;
  trigger_context: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: number;
  locked_at: number | null;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Encola un workflow para ejecucion durable. Persiste ANTES de correr. */
export function enqueueJob(workflowId: string, ctx: Ctx, opts?: { runAfter?: number; db?: DB }): string {
  const db = opts?.db ?? rawDb;
  const id = crypto.randomUUID();
  const now = nowSec();
  db.prepare(
    `INSERT INTO workflow_jobs (id, workflow_id, trigger_context, status, attempts, max_attempts, run_after, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`
  ).run(id, workflowId, JSON.stringify(ctx ?? {}), MAX_ATTEMPTS, opts?.runAfter ?? now, now, now);
  return id;
}

/** Reclama jobs 'running' colgados (el proceso murio a mitad) -> vuelven a pending. */
function reclaimStuck(db: DB, now: number): void {
  db.prepare(
    `UPDATE workflow_jobs SET status='pending', updated_at=? WHERE status='running' AND (locked_at IS NULL OR locked_at < ?)`
  ).run(now, now - STUCK_SEC);
}

/** Toma UN job de forma atomica. Devuelve true si lo reclamo (incrementa attempts). */
function claim(db: DB, jobId: string, now: number): boolean {
  const info = db
    .prepare(`UPDATE workflow_jobs SET status='running', locked_at=?, attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'`)
    .run(now, now, jobId);
  return info.changes === 1;
}

function markDone(db: DB, id: string): void {
  db.prepare(`UPDATE workflow_jobs SET status='done', last_error=NULL, locked_at=NULL, updated_at=? WHERE id=?`).run(nowSec(), id);
}

/** Reencola con backoff exponencial, o marca failed si agoto los reintentos. */
function onFailure(db: DB, id: string, attempts: number, maxAttempts: number, detail: string): "failed" | "retried" {
  const now = nowSec();
  if (attempts >= maxAttempts) {
    db.prepare(`UPDATE workflow_jobs SET status='failed', last_error=?, locked_at=NULL, updated_at=? WHERE id=?`).run(detail, now, id);
    logger.error("workflow.job", "job agoto reintentos", { jobId: id, attempts, detail });
    return "failed";
  }
  const backoff = BACKOFF_BASE_SEC * Math.pow(2, attempts - 1);
  db.prepare(`UPDATE workflow_jobs SET status='pending', last_error=?, run_after=?, locked_at=NULL, updated_at=? WHERE id=?`).run(detail, now + backoff, now, id);
  logger.warn("workflow.job", "job fallo, reintentara", { jobId: id, attempts, backoffSec: backoff, detail });
  return "retried";
}

export interface DrainStats { ran: number; done: number; failed: number; retried: number }

/**
 * Procesa jobs pendientes vencidos. Reclama colgados, toma cada job atomicamente,
 * lo corre y actualiza su estado. Inyectable (db/runner) para tests.
 */
export async function drainJobs(opts?: { max?: number; db?: DB; runner?: Runner }): Promise<DrainStats> {
  const db = opts?.db ?? rawDb;
  const runner = opts?.runner ?? runWorkflow;
  const max = opts?.max ?? 25;
  const stats: DrainStats = { ran: 0, done: 0, failed: 0, retried: 0 };

  reclaimStuck(db, nowSec());

  const candidates = db
    .prepare(`SELECT id FROM workflow_jobs WHERE status='pending' AND run_after <= ? ORDER BY run_after ASC, created_at ASC LIMIT ?`)
    .all(nowSec(), max) as { id: string }[];

  for (const { id } of candidates) {
    if (!claim(db, id, nowSec())) continue; // otro drain lo tomo primero
    stats.ran++;
    const job = db.prepare(`SELECT * FROM workflow_jobs WHERE id=?`).get(id) as JobRow;

    const wfRow = db.prepare(`SELECT * FROM workflows WHERE id=?`).get(job.workflow_id) as Record<string, unknown> | undefined;
    if (!wfRow) {
      // workflow borrado despues de encolar: no tiene sentido reintentar.
      db.prepare(`UPDATE workflow_jobs SET status='failed', last_error=?, locked_at=NULL, updated_at=? WHERE id=?`).run("workflow inexistente", nowSec(), id);
      stats.failed++;
      continue;
    }

    let ctx: Ctx = {};
    try { ctx = JSON.parse(job.trigger_context || "{}"); } catch { ctx = {}; }

    try {
      // ponytail: heartbeat mientras corre. Un workflow legítimamente largo (ai_step,
      // http lento) superaba STUCK_SEC y reclaimStuck lo devolvía a pending -> otro
      // drain lo corría EN PARALELO (side effects duplicados). Refrescar locked_at
      // durante los awaits evita que se lo reclamen estando vivo.
      const hb = setInterval(() => {
        try {
          db.prepare(`UPDATE workflow_jobs SET locked_at=? WHERE id=? AND status='running'`).run(nowSec(), id);
        } catch { /* noop */ }
      }, Math.floor((STUCK_SEC * 1000) / 3));
      (hb as { unref?: () => void }).unref?.();
      let result: Awaited<ReturnType<Runner>>;
      try {
        result = await runner(loadWorkflow(wfRow), ctx);
      } finally {
        clearInterval(hb);
      }
      if (result.status === "success") {
        markDone(db, id);
        stats.done++;
      } else {
        const detail = result.logs.find((l) => !l.ok)?.detail ?? "error de step";
        if (onFailure(db, id, job.attempts, job.max_attempts, detail) === "failed") stats.failed++;
        else stats.retried++;
      }
    } catch (e) {
      // Excepcion fuera del manejo por-step (ej. loadWorkflow, o un throw inesperado).
      const detail = e instanceof Error ? e.message : String(e);
      if (onFailure(db, id, job.attempts, job.max_attempts, detail) === "failed") stats.failed++;
      else stats.retried++;
    }
  }
  return stats;
}
