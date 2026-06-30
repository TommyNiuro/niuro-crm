/**
 * getRubricConfig: versión server-only que lee desde SQLite.
 * NO importar en Client Components — usa better-sqlite3 (Node.js only).
 */
import { DEFAULT_RUBRIC_CONFIG } from "./score-lead";
import type { RubricConfig } from "./score-lead";

export function getRubricConfig(): RubricConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    const dbPath = path.join(process.cwd(), "data", "crm.db");
    const sqlite = new Database(dbPath, { timeout: 5000 });
    try {
      const row = sqlite
        .prepare("SELECT value FROM crm_settings WHERE key = 'rubric_config'")
        .get() as { value: string } | undefined;
      if (row?.value) {
        const parsed = JSON.parse(row.value) as Partial<RubricConfig>;
        return { ...DEFAULT_RUBRIC_CONFIG, ...parsed };
      }
    } finally {
      sqlite.close();
    }
  } catch {
    // fallback silencioso si la DB no está disponible
  }
  return DEFAULT_RUBRIC_CONFIG;
}
