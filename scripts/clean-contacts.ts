#!/usr/bin/env npx tsx
/**
 * Limpieza de higiene del directorio:
 *  1. Contactos cuyo nombre es un número crudo (jid sin resolver): intenta
 *     renombrarlos con el nombre real del chat (wa_chats.name).
 *  2. Lista duplicados por teléfono para mergear a mano en la UI (el merge
 *     automático repuntea FKs; mejor decidirlo viendo los datos).
 *
 * Uso:
 *   npx tsx scripts/clean-contacts.ts           # dry-run
 *   npx tsx scripts/clean-contacts.ts --apply   # aplica los renombres
 */
import { dbPath } from "../src/lib/paths";
import { openDb } from "../src/lib/db-open";

const apply = process.argv.includes("--apply");
const db = openDb(dbPath());

// 1) Nombres que son puro número: resolver contra el nombre del chat sincronizado.
const raw = db
  .prepare(
    `SELECT c.id, c.name, ch.name AS chat_name
     FROM contacts c
     LEFT JOIN wa_chats ch ON ch.jid = c.whatsapp_jid
     WHERE c.name NOT GLOB '*[a-zA-Z]*'`
  )
  .all() as { id: string; name: string; chat_name: string | null }[];

let renamed = 0;
for (const r of raw) {
  const better = r.chat_name?.trim();
  if (better && better !== r.name && /[a-zA-Z]/.test(better)) {
    console.log(`renombrar: "${r.name}" -> "${better}"`);
    if (apply) {
      db.prepare(`UPDATE contacts SET name = ? WHERE id = ?`).run(better, r.id);
      renamed++;
    }
  } else {
    console.log(`sin nombre mejor para "${r.name}" (chat: ${r.chat_name ?? "no sincronizado"})`);
  }
}

// 2) Duplicados por teléfono normalizado (solo dígitos): reporte para merge manual.
const dups = db
  .prepare(
    `SELECT REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '+', ''), ' ', ''), '-', '') AS p,
            GROUP_CONCAT(name, ' | ') AS names, COUNT(*) AS n
     FROM contacts WHERE COALESCE(phone, '') != ''
     GROUP BY p HAVING n > 1`
  )
  .all() as { p: string; names: string; n: number }[];

if (dups.length) {
  console.log(`\nDuplicados por teléfono (mergear a mano desde el Directorio):`);
  for (const d of dups) console.log(`  ${d.p}: ${d.names}`);
} else {
  console.log(`\nSin duplicados por teléfono.`);
}

console.log(apply ? `\nAplicado: ${renamed} renombres.` : `\nDry-run: nada cambiado. Corré con --apply para renombrar.`);
db.close();
