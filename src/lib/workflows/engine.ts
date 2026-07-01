import crypto from "crypto";
import { rawDb } from "@/db";
import { runClaudeCached } from "@/lib/claude-subprocess";
import { assertPublicHttpUrl } from "@/lib/url-safety";
import { OBJECTS } from "@/lib/ai/tools";

// Motor de workflows in-process (b4-engine). Sin colas externas: runWorkflow corre
// los steps en serie, crea un workflow_run, loguea cada paso y marca success/error.
// Single-user/local: no hay aislamiento entre tenants ni reintentos.

export type StepType =
  | "update_record"
  | "create_record"
  | "delete_record"
  | "http_request"
  | "send_email"
  | "ai_step"
  | "delay"
  | "branch";

export interface Step {
  type: StepType;
  [k: string]: unknown;
}

export interface Workflow {
  id: string;
  name: string;
  triggerType: "record_event" | "scheduled" | "manual";
  steps: Step[];
}

type Ctx = Record<string, unknown>;

interface LogEntry {
  step: number;
  type: string;
  ok: boolean;
  detail?: string;
  at: number;
}

// Objetos del CRM con tabla real y columnas escribibles: reusa el whitelist de
// src/lib/ai/tools.ts (el copiloto) en vez de mantener una copia separada —
// ambos necesitaban la misma info (tabla real, columnas escribibles,
// hasUpdatedAt) y hasta hoy vivía duplicada con el riesgo de divergir.
function assertObject(objectName: unknown): { table: string; cols: string[]; hasUpdatedAt: boolean } {
  if (typeof objectName !== "string" || !(objectName in OBJECTS)) {
    throw new Error(`objectName invalido o no soportado: ${String(objectName)}`);
  }
  const def = OBJECTS[objectName];
  return { table: def.table, cols: def.writableCols, hasUpdatedAt: def.hasUpdatedAt };
}

// Provenance de IA: qué claves del contexto vienen de un ai_step (texto
// generado, no dato estructurado del trigger). Un write step que las use en
// fields/recordId necesita opt-in explícito (allowAiOutput: true) — sin esto,
// un ai_step armado desde contenido no confiable (ej. un mensaje de WhatsApp)
// podía escribir directo a la DB sin la revisión humana que sí tiene el
// copiloto de chat (propose_* -> confirmar -> ejecutar). Auditoría de
// arquitectura de agentes 2026-06-30, hallazgo High.
function taintedKeys(ctx: Ctx): string[] {
  return Array.isArray(ctx.__aiTainted) ? (ctx.__aiTainted as string[]) : [];
}

// saveAs viene de la config del workflow (no confiable) y se interpola en un
// RegExp: sin escapar, un saveAs con parentesis/corchetes desbalanceados tira
// un SyntaxError confuso en vez del error de gate esperado (auditoria adversarial).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function referencesTainted(value: unknown, tainted: string[]): boolean {
  if (tainted.length === 0) return false;
  if (typeof value === "string") {
    return tainted.some((k) => new RegExp(`\\{\\{\\s*${escapeRegExp(k)}(\\.[\\w.]+)?\\s*\\}\\}`).test(value));
  }
  if (Array.isArray(value)) return value.some((v) => referencesTainted(v, tainted));
  if (value && typeof value === "object") {
    return Object.values(value).some((v) => referencesTainted(v, tainted));
  }
  return false;
}

function assertNoUnreviewedAiInput(step: Step, ctx: Ctx, ...values: unknown[]): void {
  const tainted = taintedKeys(ctx);
  if (values.some((v) => referencesTainted(v, tainted))) {
    if (step.allowAiOutput === true) return;
    throw new Error(
      `${step.type}: usa salida de un ai_step (${tainted.map((k) => `{{${k}}}`).join(", ")}) sin ` +
        `allowAiOutput: true en el step. Un write automático a partir de texto generado por IA (que ` +
        `puede venir de contenido externo no confiable) necesita revisión explícita antes de ejecutarse.`
    );
  }
}

// Carga un registro por id desde un objeto whitelisteado. Lo usa el disparo
// manual (run con recordId) para inyectar `record` al context sin que el caller
// duplique el whitelist. Devuelve undefined si no existe.
export function loadRecord(objectName: string, recordId: string): (Record<string, unknown> & { id: string }) | undefined {
  const { table } = assertObject(objectName);
  return rawDb.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordId) as
    | (Record<string, unknown> & { id: string })
    | undefined;
}

// Resolución de variables {{path}} contra el context. {{a.b.c}} hace lookup
// anidado. Si el valor de la plantilla es exactamente "{{x}}" devuelve el valor
// crudo (preserva números/objetos); si está embebido en texto, lo interpola como
// string. Una ruta inexistente queda como "".
function getPath(ctx: Ctx, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, ctx);
}

function resolve(value: unknown, ctx: Ctx): unknown {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (whole) return getPath(ctx, whole[1]);
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => {
      const v = getPath(ctx, p);
      return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx);
    return out;
  }
  return value;
}

function resolveFields(raw: unknown, ctx: Ctx, allowed: string[]): Record<string, unknown> {
  const resolved = resolve(raw, ctx);
  if (!resolved || typeof resolved !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resolved)) {
    // ponytail: solo columnas whitelisted; el resto se ignora en silencio para no
    // explotar el INSERT/UPDATE con columnas inexistentes desde una definición libre.
    if (allowed.includes(k)) out[k] = v;
  }
  return out;
}

// Coerciona valores no escalares (objeto/array/bool) a algo que SQLite acepta.
function bind(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

async function runStep(step: Step, ctx: Ctx): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  switch (step.type) {
    case "create_record": {
      const { table, cols, hasUpdatedAt } = assertObject(step.objectName);
      assertNoUnreviewedAiInput(step, ctx, step.fields);
      const fields = resolveFields(step.fields, ctx, cols);
      const id = crypto.randomUUID();
      const colNames = ["id", ...Object.keys(fields), "created_at", ...(hasUpdatedAt ? ["updated_at"] : [])];
      const values = [id, ...Object.values(fields).map(bind), nowSec, ...(hasUpdatedAt ? [nowSec] : [])];
      const placeholders = colNames.map(() => "?").join(", ");
      rawDb.prepare(`INSERT INTO ${table} (${colNames.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`).run(...values);
      ctx.lastCreatedId = id;
      ctx[`${table}Id`] = id;
      break;
    }
    case "update_record": {
      const { table, cols, hasUpdatedAt } = assertObject(step.objectName);
      assertNoUnreviewedAiInput(step, ctx, step.fields, step.recordId);
      const recordId = resolve(step.recordId, ctx);
      if (typeof recordId !== "string" || !recordId) throw new Error("update_record: recordId vacio");
      const fields = resolveFields(step.fields, ctx, cols);
      const keys = Object.keys(fields);
      if (keys.length === 0) throw new Error("update_record: sin campos validos");
      const setSql = [...keys.map((k) => `"${k}" = ?`), ...(hasUpdatedAt ? [`"updated_at" = ?`] : [])].join(", ");
      const params = [...keys.map((k) => bind(fields[k])), ...(hasUpdatedAt ? [nowSec] : []), recordId];
      const info = rawDb.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new Error(`update_record: ${table}/${recordId} no existe`);
      break;
    }
    case "delete_record": {
      const { table } = assertObject(step.objectName);
      assertNoUnreviewedAiInput(step, ctx, step.recordId);
      const recordId = resolve(step.recordId, ctx);
      if (typeof recordId !== "string" || !recordId) throw new Error("delete_record: recordId vacio");
      rawDb.prepare(`DELETE FROM ${table} WHERE id = ?`).run(recordId);
      break;
    }
    case "http_request": {
      const method = (resolve(step.method, ctx) as string) || "GET";
      const url = resolve(step.url, ctx) as string;
      if (!url) throw new Error("http_request: url vacia");
      assertPublicHttpUrl(url); // SSRF: sin esto, un workflow podía pegarle a red interna/metadata
      const headers = (resolve(step.headers, ctx) as Record<string, string>) || {};
      const body = step.body != null ? resolve(step.body, ctx) : undefined;
      const res = await fetch(url, {
        method,
        headers,
        body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* respuesta no-JSON */ }
      ctx.lastResponse = { status: res.status, body: parsed };
      if (!res.ok) throw new Error(`http_request: ${res.status} ${text.slice(0, 120)}`);
      break;
    }
    case "send_email": {
      const to = resolve(step.to, ctx) as string;
      const subject = resolve(step.subject, ctx) as string;
      const html = resolve(step.body, ctx) as string;
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        console.log(`[workflow] email simulado -> ${to}: ${subject}`);
        ctx.lastEmail = { simulated: true, to, subject };
        break;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM || "crm@niuro.io", to, subject, html }),
      });
      if (!res.ok) throw new Error(`send_email: resend ${res.status} ${(await res.text()).slice(0, 120)}`);
      ctx.lastEmail = { simulated: false, to, subject };
      break;
    }
    case "ai_step": {
      const prompt = resolve(step.prompt, ctx) as string;
      if (!prompt) throw new Error("ai_step: prompt vacio");
      const output = await runClaudeCached(prompt);
      ctx.aiOutput = output;
      const tainted = new Set(taintedKeys(ctx));
      tainted.add("aiOutput");
      if (typeof step.saveAs === "string") {
        ctx[step.saveAs] = output;
        tainted.add(step.saveAs);
      }
      ctx.__aiTainted = Array.from(tainted);
      break;
    }
    case "delay": {
      // ponytail: delays largos NO soportados in-process (el server no persiste un
      // timer entre reinicios). Tope 60s; para delays de horas/dias hace falta un
      // step 'scheduled' que reencole, no un await. Se deja la nota, no el cron.
      const seconds = Math.max(0, Math.min(60, Number(resolve(step.seconds, ctx)) || 0));
      if (Number(step.seconds) > 60) {
        console.warn(`[workflow] delay ${step.seconds}s recortado a 60s (in-process)`);
      }
      await new Promise((r) => setTimeout(r, seconds * 1000));
      break;
    }
    case "branch": {
      const truthy = evalCondition(resolve(step.condition, ctx));
      const branch = (truthy ? step.then : step.else) as Step[] | undefined;
      if (Array.isArray(branch)) {
        for (const s of branch) await runStep(s, ctx);
      }
      break;
    }
    default:
      throw new Error(`tipo de step desconocido: ${(step as Step).type}`);
  }
}

// Condición ya resuelta (las {{vars}} fueron sustituidas). Acepta un boolean
// directo o un string "a == b" / "a != b" / "a" (truthy). Comparación simple por
// igualdad de strings; suficiente para el motor reducido.
function evalCondition(cond: unknown): boolean {
  if (typeof cond === "boolean") return cond;
  if (cond == null) return false;
  const s = String(cond).trim();
  const m = s.match(/^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.*)$/);
  if (m) {
    const [, a, op, b] = m;
    const na = Number(a), nb = Number(b);
    const numeric = !Number.isNaN(na) && !Number.isNaN(nb);
    switch (op) {
      case "==": return a.trim() === b.trim();
      case "!=": return a.trim() !== b.trim();
      case ">": return numeric && na > nb;
      case "<": return numeric && na < nb;
      case ">=": return numeric && na >= nb;
      case "<=": return numeric && na <= nb;
    }
  }
  return s !== "" && s !== "false" && s !== "0";
}

export interface RunResult {
  runId: string;
  status: "success" | "error";
  logs: LogEntry[];
  context: Ctx;
}

export async function runWorkflow(workflow: Workflow, triggerContext: Ctx = {}): Promise<RunResult> {
  const runId = crypto.randomUUID();
  const startedAt = Math.floor(Date.now() / 1000);
  const ctx: Ctx = { ...triggerContext };
  const logs: LogEntry[] = [];

  rawDb
    .prepare(`INSERT INTO workflow_runs (id, workflow_id, status, trigger, context, logs, started_at) VALUES (?, ?, 'running', ?, ?, '[]', ?)`)
    .run(runId, workflow.id, JSON.stringify(triggerContext), JSON.stringify(ctx), startedAt);

  let status: "success" | "error" = "success";
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    try {
      await runStep(step, ctx);
      logs.push({ step: i, type: step.type, ok: true, at: Math.floor(Date.now() / 1000) });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logs.push({ step: i, type: step.type, ok: false, detail, at: Math.floor(Date.now() / 1000) });
      status = "error";
      break; // serie: un paso roto aborta el resto
    }
  }

  rawDb
    .prepare(`UPDATE workflow_runs SET status = ?, context = ?, logs = ?, finished_at = ? WHERE id = ?`)
    .run(status, JSON.stringify(ctx), JSON.stringify(logs), Math.floor(Date.now() / 1000), runId);

  return { runId, status, logs, context: ctx };
}

// Lee y normaliza un workflow desde la fila cruda (steps/triggerType).
export function loadWorkflow(row: Record<string, unknown>): Workflow {
  let steps: Step[] = [];
  try { steps = JSON.parse((row.steps as string) || "[]"); } catch { steps = []; }
  return {
    id: row.id as string,
    name: row.name as string,
    triggerType: row.trigger_type as Workflow["triggerType"],
    steps,
  };
}
