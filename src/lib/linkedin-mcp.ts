/**
 * Cliente mínimo del linkedin-mcp-server (stickerdaniel) por stdio.
 *
 * Habla el protocolo MCP (JSON-RPC 2.0 sobre líneas) con `uvx
 * mcp-server-linkedin`: initialize → tools/call. Usa la sesión de LinkedIn
 * guardada en ~/.linkedin-mcp/ (se crea UNA vez con
 * `uvx mcp-server-linkedin@latest --import-from-browser` o `--login`).
 *
 * ⚠️ Scraping de LinkedIn: usar con moderación (viola TOS; corridas chicas y
 * espaciadas para no arriesgar la cuenta). El scanner limita a pocas búsquedas
 * y solo si la sesión existe.
 */
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { readSettings, writeSettings } from "@/lib/settings";

// Presupuesto compartido de requests a LinkedIn (búsquedas de empleo +
// perfiles de empresa comparten el mismo contador semanal): el scraping
// viola sus TOS, así que el límite es sobre EL TOTAL de golpes a LinkedIn,
// no uno por feature. Ventana deslizante de 7 días en crm_settings.
const RATE_LIMIT_KEY = "linkedin_search_log";
const RATE_LIMIT_MAX_PER_WEEK = 6;

/** ¿Podemos pegarle a LinkedIn una vez más esta semana? Si sí, registra el
 *  intento (cuenta aunque falle después, a propósito: es presupuesto). */
export function checkAndRecordLinkedinBudget(): boolean {
  const raw = readSettings([RATE_LIMIT_KEY])[RATE_LIMIT_KEY];
  let log: number[] = [];
  try { log = raw ? (JSON.parse(raw) as number[]) : []; } catch { log = []; }
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = log.filter((t) => t > weekAgo);
  if (recent.length >= RATE_LIMIT_MAX_PER_WEEK) return false;
  writeSettings({ [RATE_LIMIT_KEY]: JSON.stringify([...recent, Date.now()]) });
  return true;
}

export function linkedinSessionExists(): boolean {
  // El perfil guarda cookies/estado bajo ~/.linkedin-mcp (además de los
  // browsers de patchright, que existen aunque no haya sesión).
  const base = path.join(os.homedir(), ".linkedin-mcp");
  if (!fs.existsSync(base)) return false;
  return fs
    .readdirSync(base)
    .some((f) => !["patchright-browsers", "trace-runs"].includes(f));
}

interface McpResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Corre el server MCP, llama UNA tool y cierra. Timeout duro por llamada. */
export async function callLinkedinTool(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 180_000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("uvx", ["mcp-server-linkedin@latest"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.PATH}:${os.homedir()}/.local/bin` },
    });

    let buf = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`LinkedIn MCP timeout (${timeoutMs / 1000}s) en ${tool}`));
      }
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      fn();
    };

    const send = (msg: object) => child.stdin.write(JSON.stringify(msg) + "\n");

    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("{")) continue;
        let msg: McpResponse;
        try { msg = JSON.parse(line) as McpResponse; } catch { continue; }
        if (msg.id === 1) {
          // initialize listo → notificación initialized → llamar la tool
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
        } else if (msg.id === 2) {
          if (msg.error) finish(() => reject(new Error(`LinkedIn MCP: ${msg.error!.message}`)));
          else finish(() => resolve(msg.result));
        }
      }
    });

    child.on("error", (e) => finish(() => reject(e)));
    child.on("exit", (code) => finish(() => reject(new Error(`LinkedIn MCP terminó (código ${code}) sin responder`))));

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "niuro-crm", version: "1.0" },
      },
    });
  });
}

export interface LinkedinCompanyInfo {
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  founded: string | null;
  description: string | null;
  fetchedAt: number;
}

/** Trae el "about" de la empresa en LinkedIn y lo estructura con haiku (texto
 *  crudo → JSON), mismo patrón que fetchLinkedIn en scan-prospects.ts.
 *  company_name espera el slug de la URL (linkedin.com/company/<slug>): se
 *  intenta con una versión simplificada del nombre; si LinkedIn no la
 *  encuentra, se corta con error explícito en vez de inventar datos. */
export async function getCompanyProfile(companyName: string): Promise<LinkedinCompanyInfo> {
  const { runClaude, FAST_MODEL } = await import("@/lib/claude-subprocess");
  const slug = companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const result = (await callLinkedinTool("get_company_profile", { company_name: slug })) as {
    content?: { type: string; text?: string }[];
    structuredContent?: { sections?: Record<string, string> };
  };
  const sections = result?.structuredContent?.sections;
  const raw = sections
    ? Object.values(sections).join("\n")
    : (result?.content || []).map((c) => c.text || "").join("\n");
  if (!raw.trim()) throw new Error(`LinkedIn no encontró la empresa "${slug}"`);

  const prompt = `Texto crudo de la página "Acerca de" de una empresa en LinkedIn.
Extraé SOLO lo que esté explícito. Respondé SOLO JSON, sin markdown:
{"industry": "..." o null, "size": "..." o null (rango de empleados tal cual aparece), "headquarters": "..." o null, "founded": "..." o null, "description": "..." o null (2-3 líneas resumen)}

TEXTO:
${raw.slice(0, 15000)}`;

  const answer = await runClaude(prompt, { model: FAST_MODEL, timeoutMs: 60_000 });
  const match = answer.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("haiku no devolvió JSON para el perfil de empresa");
  const parsed = JSON.parse(match[0]) as Omit<LinkedinCompanyInfo, "fetchedAt">;
  return { ...parsed, fetchedAt: Date.now() };
}
