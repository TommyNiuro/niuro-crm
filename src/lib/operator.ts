/**
 * Identidad del operador y marca. Prioridad: crm_settings (lo que escribe el
 * onboarding en runtime) > env (.env.local) > default genérico open-source.
 * El env es solo fallback/pre-seed; la fuente viva es la DB, así el onboarding
 * cambia la identidad sin rebuild.
 */
import { readSettings } from "./settings";

/** Fallback env/default. Se usa como semilla y cuando la DB no está disponible. */
export const operator = {
  name: process.env.OPERATOR_NAME ?? "Operador",
  role: process.env.OPERATOR_ROLE ?? "Ventas",
  email: process.env.OPERATOR_EMAIL ?? "operador@example.com",
  company: process.env.COMPANY_NAME ?? "Tu Empresa",
  // Pitch corto que usan los prompts de IA al redactar mensajes en nombre del operador.
  pitch: process.env.COMPANY_PITCH ?? "una empresa de servicios",
};

export type Operator = typeof operator;

/**
 * Identidad resuelta en runtime. Server-only (lee SQLite). Cada clave cae a env
 * y luego al default si el onboarding todavía no la seteó.
 */
export function getOperator(): Operator {
  const s = readSettings([
    "operator_name",
    "operator_role",
    "operator_email",
    "company_name",
    "company_pitch",
  ]);
  return {
    name: s.operator_name ?? operator.name,
    role: s.operator_role ?? operator.role,
    email: s.operator_email ?? operator.email,
    company: s.company_name ?? operator.company,
    pitch: s.company_pitch ?? operator.pitch,
  };
}
