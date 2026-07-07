import { NextRequest, NextResponse } from "next/server";
import { loggedErrorDetail } from "@/lib/api-error";
import { db } from "@/db";
import { contacts } from "@/db/schema";

const VALID_TEMP = new Set(["hot", "warm", "cold"]);
function clampScore(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { contacts: contactList } = body;

  if (!Array.isArray(contactList) || contactList.length === 0) {
    return NextResponse.json(
      { error: "Se requiere un array de contactos" },
      { status: 400 }
    );
  }
  if (contactList.length > 5000) {
    return NextResponse.json({ error: "Máximo 5000 contactos por importación" }, { status: 413 });
  }

  const results = {
    imported: 0,
    failed: 0,
    errors: [] as string[],
  };

  const now = new Date();

  // Una sola transacción (auditoría 2026-06-09): atómico y un solo fsync
  // para todo el lote en vez de uno por contacto.
  db.transaction(() => {
  for (const contact of contactList) {
    if (!contact.name) {
      results.failed++;
      results.errors.push(`Contacto sin nombre: ${JSON.stringify(contact)}`);
      continue;
    }

    try {
      db.insert(contacts)
        .values({
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone || null,
          company: contact.company || null,
          source: contact.source || "import",
          // ponytail: normalizar al enum/rango que asume el resto del CRM (badges,
          // orden por score). El import era la única vía de escritura que lo saltaba.
          temperature: VALID_TEMP.has(contact.temperature) ? contact.temperature : "cold",
          score: clampScore(contact.score),
          notes: contact.notes || null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      results.imported++;
    } catch (error) {
      results.failed++;
      results.errors.push(
        `Error importando ${contact.name}: ${loggedErrorDetail(error)}`
      );
    }
  }
  });

  return NextResponse.json(results, {
    status: results.failed > 0 ? 207 : 201,
  });
}
