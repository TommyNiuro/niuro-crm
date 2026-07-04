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
