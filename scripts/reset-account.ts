#!/usr/bin/env npx tsx
/**
 * Resetea la cuenta local (email + contraseña + sesiones) cuando el operador
 * la olvidó. NO borra datos del CRM: contactos, deals, workflows, etc. quedan
 * intactos. En el próximo arranque la app vuelve a pedir crear la cuenta en
 * /setup-account. El reset queda registrado en el audit log.
 *
 * Uso: npx tsx scripts/reset-account.ts
 */
import { hasAccount, deleteAccount } from "../src/lib/auth";

if (!hasAccount()) {
  console.log("No hay cuenta creada; nada que resetear.");
  process.exit(0);
}

deleteAccount();
console.log("Cuenta reseteada (los datos del CRM quedan intactos).");
console.log("Abrí la app y creá tu cuenta de nuevo en /setup-account.");
