/**
 * getRubricConfig: versión server-only que lee desde SQLite.
 * NO importar en Client Components — usa better-sqlite3 (Node.js only).
 */
import { DEFAULT_RUBRIC_CONFIG } from "./score-lead";
import type { RubricConfig } from "./score-lead";
import { readSettings } from "./settings";

export function getRubricConfig(): RubricConfig {
  const raw = readSettings(["rubric_config"]).rubric_config;
  if (!raw) return DEFAULT_RUBRIC_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<RubricConfig>;
    return { ...DEFAULT_RUBRIC_CONFIG, ...parsed };
  } catch {
    return DEFAULT_RUBRIC_CONFIG;
  }
}
