#!/usr/bin/env npx tsx
/**
 * Backfill del pipeline de Ingenieros: escanea los mensajes ENTRANTES de cada
 * contacto tipo lead buscando señales de que la persona es un ingeniero
 * (candidato a colocar), no un cliente. Sin IA: keywords, gratis y auditable.
 *
 * Uso:
 *   npx tsx scripts/backfill-engineers.ts           # solo lista sugerencias
 *   npx tsx scripts/backfill-engineers.ts --apply   # marca contact_type='engineer'
 */
import { dbPath } from "../src/lib/paths";
import { openDb } from "../src/lib/db-open";

// Señales de "soy ingeniero buscando colocarme". Cortas y en minúscula: se
// matchea con LIKE sobre el mensaje en minúscula.
const KEYWORDS = [
  "mi cv", "currículum", "curriculum", "github.com", "gitlab.com", "linkedin.com/in",
  "portafolio", "portfolio", "años de experiencia", "anos de experiencia",
  "busco trabajo", "buscando trabajo", "busco empleo", "nueva oportunidad laboral",
  "soy desarrollador", "soy developer", "soy ingeniero", "soy programador",
  "full stack", "fullstack", "backend", "frontend", "devops",
];
const MIN_HITS = 3; // pedir varias señales distintas: 1 sola es ruido

const apply = process.argv.includes("--apply");
const db = openDb(dbPath());

const contacts = db
  .prepare(
    `SELECT id, name, whatsapp_jid FROM contacts
     WHERE contact_type = 'lead' AND whatsapp_jid IS NOT NULL AND archived = 0`
  )
  .all() as { id: string; name: string; whatsapp_jid: string }[];

const msgStmt = db.prepare(
  `SELECT lower(content) AS c FROM wa_messages
   WHERE chat_jid = ? AND is_from_me = 0 AND content IS NOT NULL`
);

const suggestions: { id: string; name: string; hits: string[] }[] = [];
for (const contact of contacts) {
  const msgs = msgStmt.all(contact.whatsapp_jid) as { c: string }[];
  if (!msgs.length) continue;
  const text = msgs.map((m) => m.c).join("\n");
  const hits = KEYWORDS.filter((k) => text.includes(k));
  if (hits.length >= MIN_HITS) suggestions.push({ id: contact.id, name: contact.name, hits });
}

if (!suggestions.length) {
  console.log(`Escaneados ${contacts.length} contactos: ninguno parece ingeniero (>= ${MIN_HITS} señales).`);
  process.exit(0);
}

console.log(`Sugerencias (${suggestions.length} de ${contacts.length} contactos):\n`);
for (const s of suggestions) {
  console.log(`  ${s.name}  [${s.hits.slice(0, 5).join(", ")}]`);
}

if (apply) {
  const upd = db.prepare(`UPDATE contacts SET contact_type = 'engineer' WHERE id = ?`);
  for (const s of suggestions) upd.run(s.id);
  console.log(`\nMarcados ${suggestions.length} contactos como ingeniero. Revisalos en /engineers.`);
} else {
  console.log(`\nDry-run: nada cambiado. Corré con --apply para marcarlos como ingeniero.`);
}
db.close();
