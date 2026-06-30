/**
 * Identidad del operador y marca, configurable por env. Defaults genéricos para
 * el release open-source; cada usuario pone los suyos en .env.local.
 */
export const operator = {
  name: process.env.OPERATOR_NAME ?? "Operador",
  role: process.env.OPERATOR_ROLE ?? "Ventas",
  email: process.env.OPERATOR_EMAIL ?? "operador@example.com",
  company: process.env.COMPANY_NAME ?? "Tu Empresa",
  // Pitch corto que usan los prompts de IA al redactar mensajes en nombre del operador.
  pitch: process.env.COMPANY_PITCH ?? "una empresa de servicios",
};
