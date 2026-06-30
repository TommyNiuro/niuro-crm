import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

interface Row {
  id: string;
  type: string;
  changes: string | null;
  actor: string | null;
  happens_at: number;
}

const selectStmt = rawDb.prepare(
  `SELECT id, type, changes, actor, happens_at FROM timeline_activity
   WHERE object_name = ? AND record_id = ?
   ORDER BY happens_at DESC LIMIT ?`
);

// Timeline de auditoría de un registro (b7-timeline-audit). Devuelve eventos ya
// con una descripción legible armada en el server.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const objectName = searchParams.get("objectName");
  const recordId = searchParams.get("recordId");
  if (!objectName || !recordId) {
    return NextResponse.json({ error: "objectName y recordId requeridos" }, { status: 400 });
  }
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 1000);

  const rows = selectStmt.all(objectName, recordId, limit) as Row[];
  const events = rows.map((r) => ({
    id: r.id,
    type: r.type,
    description: describe(r.type, r.changes),
    actor: r.actor,
    // el panel espera ms (createdAt): happens_at está en segundos.
    createdAt: r.happens_at * 1000,
  }));
  return NextResponse.json(events);
}

const LABELS: Record<string, string> = {
  stage: "Etapa", stageId: "Etapa", status: "Estado", name: "Nombre", title: "Título",
  value: "Valor", valueCents: "Valor", probability: "Probabilidad", temperature: "Temperatura",
  score: "Score", source: "Origen", channel: "Canal", company: "Empresa", email: "Email",
  phone: "Teléfono", country: "País", notes: "Notas", domain: "Dominio", industry: "Industria",
  size: "Tamaño", contactId: "Contacto", expectedClose: "Cierre estimado", nextAction: "Próxima acción",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function describe(type: string, changesJson: string | null): string {
  if (type === "created") return "Registro creado";
  if (type === "deleted") return "Movido a papelera";
  if (type === "restored") return "Restaurado desde papelera";
  if (type === "updated" && changesJson) {
    try {
      const ch = JSON.parse(changesJson) as Record<string, { from: unknown; to: unknown }>;
      const parts = Object.entries(ch).map(
        ([k, { from, to }]) => `cambió ${LABELS[k] ?? k} de ${fmt(from)} a ${fmt(to)}`
      );
      if (parts.length) return parts.join(", ");
    } catch {
      /* fallthrough */
    }
  }
  return type;
}
