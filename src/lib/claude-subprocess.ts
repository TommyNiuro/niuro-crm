import { spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, isAbsolute, resolve, sep } from "path";
import crypto from "crypto";
import { uploadsDir } from "@/lib/paths";

// Resolución del binario (auditoría 2026-06-09): la ruta clavada a una versión
// de nvm mataba la IA en silencio al actualizar Node. Orden: env CLAUDE_BIN →
// "claude" resuelto del PATH del entorno.
function resolveClaudeBin(): string {
  return process.env.CLAUDE_BIN || "claude";
}
export const CLAUDE_BIN = resolveClaudeBin();

// Exportado: fuente única del modelo (estaba hardcodeado en 4 sitios — auditoría)
export const DEFAULT_MODEL = "claude-sonnet-4-6";
// Modelo rápido para flujos INTERACTIVOS (extract-lead, reply-suggestion):
// Haiku responde en 5-15s vs 30-60s de Sonnet y alcanza de sobra para
// extracción estructurada. Los batch (radar, categorize) siguen en Sonnet.
export const FAST_MODEL = "claude-haiku-4-5-20251001";
// 60s: los logs mostraban timeouts recurrentes con 35s que degradaban a fallback
const DEFAULT_TIMEOUT_MS = 60_000;

// In-memory cache: cacheKey -> { result, expiresAt }
const _cache = new Map<string, { result: string; expiresAt: number }>();

function cacheKey(prompt: string): string {
  // Hash del prompt COMPLETO (auditoría 2026-06-09): truncar a 600 chars hacía
  // que dos conversaciones con el mismo inicio compartieran cache y se
  // sirvieran clasificaciones obsoletas de otro chat.
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

// Semáforo global (auditoría 2026-06-09): sin esto, 5 "Re-analizar" simultáneos
// lanzaban hasta 10 procesos claude compitiendo por la sesión Max y los timeouts
// se disparaban en cascada. Máximo 2 a la vez; el resto espera su turno en cola.
const MAX_CONCURRENT = 2;
let _running = 0;
const _waiters: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (_running < MAX_CONCURRENT) {
    _running++;
    return;
  }
  await new Promise<void>((resolve) => _waiters.push(resolve));
}

function releaseSlot(): void {
  const next = _waiters.shift();
  if (next) next(); // el slot se transfiere al siguiente en cola
  else _running--;
}

export async function runClaude(
  prompt: string,
  opts?: { model?: string; timeoutMs?: number; imagePath?: string }
): Promise<string> {
  await acquireSlot();
  try {
    return await runClaudeOnce(prompt, opts);
  } finally {
    releaseSlot();
  }
}

/**
 * Visión: corre claude sobre una imagen (ej. captura de una web) embebida vía la
 * @mención del CLI (Claude Code 2.1.x NO tiene flag --image). El path debe ser
 * ABSOLUTO y SIN espacios (la @mención corta en el primer whitespace). Mismo
 * patrón que runClaude: semáforo global, strip de ANTHROPIC_API_KEY (auth Max),
 * FD-closing y cleanup. Default FAST_MODEL (haiku) que soporta visión.
 */
export async function runClaudeVision(
  prompt: string,
  imagePath: string,
  opts?: { model?: string; timeoutMs?: number }
): Promise<string> {
  return runClaude(prompt, { ...opts, imagePath, model: opts?.model ?? FAST_MODEL });
}

// Validación de imagePath antes de interpolarlo en el shellCmd (auditoría de
// seguridad 2026-06-23). El path se construye internamente como UUID en uploads/
// o en tmpdir(), así que hoy no es explotable, pero la cadena nunca se validaba.
// Migrar el spawn a array de args rompería el patrón `perl ... exec @ARGV < tmp`
// (redirección de stdin) y el FD-closing, así que se valida en su lugar: el path
// debe ser absoluto, estar dentro de un dir esperado (uploads o tmpdir) y no
// contener metacaracteres de shell ni whitespace (la @mención del CLI corta en
// el primer whitespace de todos modos). Si no cumple, se lanza Error.
function assertSafeImagePath(imagePath: string): void {
  if (!isAbsolute(imagePath)) {
    throw new Error(`imagePath inseguro: no es absoluto (${imagePath})`);
  }
  // Metacaracteres de shell y whitespace que romperían la interpolación en sh -c.
  if (/["'`$;&|<>()\\\s]/.test(imagePath)) {
    throw new Error(`imagePath inseguro: contiene caracteres no permitidos (${imagePath})`);
  }
  // Defensa contra traversal: ningún segmento "..".
  if (imagePath.split("/").some((seg) => seg === "..")) {
    throw new Error(`imagePath inseguro: contiene traversal '..' (${imagePath})`);
  }
  // Debe vivir bajo un directorio esperado: uploads del CRM o el tmpdir del SO.
  const allowedRoots = [uploadsDir(), tmpdir()];
  const resolved = resolve(imagePath);
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + sep),
  );
  if (!ok) {
    throw new Error(`imagePath inseguro: fuera de los directorios permitidos (${imagePath})`);
  }
}

async function runClaudeOnce(
  prompt: string,
  opts?: { model?: string; timeoutMs?: number; imagePath?: string }
): Promise<string> {
  const model = opts?.model ?? DEFAULT_MODEL;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const imagePath = opts?.imagePath;
  if (imagePath) assertSafeImagePath(imagePath);

  // Escribir el prompt a un archivo temporal para evitar el problema de pipe
  // cuando el subprocess (claude CLI = Node.js) hereda los FDs del servidor Next.js.
  const tmpFile = join(tmpdir(), `claude-prompt-${process.pid}-${Date.now()}.txt`);
  // Visión: la imagen se adjunta con `@<path absoluto>` al final del prompt. El
  // CLI la lee y la embebe como contenido (no es un tool-call, así que convive
  // con --tools ""). Como el cwd del subprocess es tmpdir(), se pasa --add-dir.
  const finalPrompt = imagePath ? `${prompt}\n\n@${imagePath}` : prompt;
  // mode 0600: el prompt contiene conversaciones de clientes — no debe ser
  // legible por otros usuarios del sistema (auditoría 2026-06-09)
  writeFileSync(tmpFile, finalPrompt, { encoding: "utf8", mode: 0o600 });

  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const { ANTHROPIC_API_KEY: _drop, ...cleanEnv } = process.env;

    // Usar Perl para cerrar TODOS los FDs heredados de Next.js (3..1023)
    // antes de exec-ar claude. Esto evita que el claude CLI (también Node.js)
    // vea los sockets/pipes del servidor y quede colgado sin poder salir.
    // --tools "" desactiva web search y cualquier herramienta externa que cuelga el proceso
    const addDirFlag = imagePath ? ` --add-dir "${dirname(imagePath)}"` : "";
    const shellCmd = `perl -MPOSIX -e 'for my $i (3..1023){ POSIX::close($i) }; exec @ARGV' -- "${CLAUDE_BIN}" -p --output-format json --input-format text --model "${model}" --dangerously-skip-permissions --tools ""${addDirFlag} < "${tmpFile}"`;

    const child = spawn("/bin/sh", ["-c", shellCmd], {
      env: cleanEnv,
      stdio: ["ignore", "pipe", "pipe"],
      // cwd neutro: con cwd=$HOME cada llamada cargaba el CLAUDE.md del usuario
      // como contexto y acumulaba sesiones en ~/.claude/projects (auditoría)
      cwd: tmpdir(),
    });

    let stdout = "";
    let stderr = "";

    const cleanup = () => {
      try { unlinkSync(tmpFile); } catch { /* ya fue eliminado */ }
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      cleanup();
      console.error(`[claude] TIMEOUT a los ${timeoutMs}ms (modelo ${model}, prompt ${prompt.length} chars)`);
      reject(new Error(`claude subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      const ms = Date.now() - t0;
      if (code !== 0 && code !== null) {
        console.error(`[claude] exit ${code} en ${ms}ms: ${stderr.slice(0, 300)}`);
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { result?: string; is_error?: boolean };
        // is_error=true: el CLI reporta fallo (no logueado, sin créditos, sesión
        // Max caída) y mete el texto de error en `result`. Antes solo se logueaba
        // y ese texto se devolvía como si fuera contenido válido, lo que podía
        // persistir una propuesta "ready" con basura (auditoría 2026-06-22).
        if (parsed.is_error) {
          const detail = String(parsed.result ?? stderr ?? "sin detalle").slice(0, 300);
          console.error(`[claude] is_error=true en ${ms}ms (${model}): ${detail}`);
          reject(new Error(`claude is_error: ${detail}`));
          return;
        }
        console.log(`[claude] ok en ${ms}ms (${model})`);
        // Strip markdown fencing si Claude envuelve la respuesta
        const raw = parsed.result ?? stdout.trim();
        const stripped = raw.replace(/^```[a-z]*\n?/m, "").replace(/\n?```$/m, "").trim();
        resolve(stripped);
      } catch {
        // Con --output-format json el CLI SIEMPRE devuelve el envelope JSON. Un
        // stdout no-JSON es anómalo (CLI cortado, warning antes del JSON). Antes
        // se resolvía con el crudo y podía guardar texto no estructurado en la DB;
        // ahora se rechaza para que el flujo (ej. propuestas) marque error en vez
        // de persistir basura (auditoría 2026-06-22).
        console.error(`[claude] respuesta no-JSON en ${ms}ms — stdout crudo de ${stdout.length} chars (modelo ${model}): ${stdout.slice(0, 200)}`);
        reject(new Error(`claude respuesta no-JSON (${stdout.length} chars)`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });
  });
}

export async function runClaudeCached(
  prompt: string,
  opts?: { model?: string; timeoutMs?: number; ttlMs?: number; cacheKey?: string }
): Promise<string> {
  const key = opts?.cacheKey
    ? crypto.createHash("sha256").update(opts.cacheKey).digest("hex")
    : cacheKey(prompt);
  const ttlMs = opts?.ttlMs ?? 30 * 60 * 1000;
  const now = Date.now();

  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return hit.result;

  const result = await runClaude(prompt, opts);
  // Poda de entradas expiradas (auditoría: el cache nunca podaba y crecía sin límite)
  for (const [k, v] of _cache) {
    if (v.expiresAt <= now) _cache.delete(k);
  }
  _cache.set(key, { result, expiresAt: now + ttlMs });
  return result;
}
