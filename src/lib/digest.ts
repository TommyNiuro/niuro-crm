import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, tasks, leadCandidates } from "@/db/schema";
import { eq, and, lt, not, inArray } from "drizzle-orm";
import { formatCurrency } from "@/lib/constants";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function runDigest(): Promise<NextResponse> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.DIGEST_EMAIL;

  if (!apiKey) {
    return NextResponse.json({ ok: true, sent: false, reason: "RESEND_API_KEY no configurado" });
  }
  if (!toEmail) {
    return NextResponse.json({ ok: true, sent: false, reason: "DIGEST_EMAIL no configurado" });
  }

  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const hotLeads = db
    .select()
    .from(leadCandidates)
    .where(
      and(
        eq(leadCandidates.temperature, "hot"),
        eq(leadCandidates.status, "pending"),
        lt(leadCandidates.createdAt, now),
      )
    )
    .all()
    .filter((l) => {
      const created = l.createdAt instanceof Date ? l.createdAt : new Date((l.createdAt as number) < 1e12 ? (l.createdAt as number) * 1000 : (l.createdAt as number));
      return created >= ago24h;
    });

  const overdueTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      contactId: tasks.contactId,
      contactName: contacts.name,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(
      and(
        eq(tasks.status, "open"),
        lt(tasks.dueAt, now),
      )
    )
    .all();

  const atRiskContacts = db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.archived, false),
        not(inArray(contacts.stage, ["Cierre", "Expansion"])),
        lt(contacts.lastInteractionAt, ago7d),
      )
    )
    .all();

  const allContacts = db.select().from(contacts).where(eq(contacts.archived, false)).all();

  const mrrCents = allContacts
    .filter((c) => c.stage === "Cierre")
    .reduce((sum, c) => sum + c.valueCents, 0);

  const projectedCents = allContacts
    .filter((c) => c.stage !== "Cierre")
    .reduce((sum, c) => sum + Math.round(c.valueCents * c.probability / 100), 0);

  const allLeadCandidates = db.select().from(leadCandidates).where(eq(leadCandidates.status, "pending")).all();
  const hotCount = allLeadCandidates.filter((l) => l.temperature === "hot").length;
  const warmCount = allLeadCandidates.filter((l) => l.temperature === "warm").length;
  const coldCount = allLeadCandidates.filter((l) => l.temperature === "cold").length;

  const dateLabel = formatDate(now);

  // Escapar datos de la DB antes de interpolarlos en el HTML del email
  // (auditoría 2026-06-09: un nombre de chat de WhatsApp con HTML se
  // renderizaba tal cual en el correo).
  const esc = (s: string | null | undefined): string =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Niuro CRM - Resumen del dia</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <div style="background:#09090b;padding:28px 32px;">
    <div style="color:#10b981;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">Niuro CRM</div>
    <div style="color:#ffffff;font-size:22px;font-weight:700;">Resumen del dia</div>
    <div style="color:#71717a;font-size:13px;margin-top:4px;">${dateLabel}</div>
  </div>

  <div style="padding:28px 32px;">

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      <tr>
        <td style="width:33%;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center;vertical-align:top;">
          <div style="font-size:28px;font-weight:700;color:#09090b;">${mrrCents > 0 ? formatCurrency(mrrCents) : "—"}</div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">MRR Cierre</div>
        </td>
        <td style="width:8px;"></td>
        <td style="width:33%;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center;vertical-align:top;">
          <div style="font-size:28px;font-weight:700;color:#10b981;">${projectedCents > 0 ? formatCurrency(projectedCents) : "—"}</div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">Proyectado</div>
        </td>
        <td style="width:8px;"></td>
        <td style="width:33%;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center;vertical-align:top;">
          <div style="font-size:28px;font-weight:700;color:#09090b;">${hotCount + warmCount + coldCount}</div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">Leads pendientes</div>
        </td>
      </tr>
    </table>

    <div style="margin-bottom:4px;display:flex;gap:8px;">
      <span style="display:inline-block;background:#ef444420;color:#ef4444;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${hotCount} hot</span>
      <span style="display:inline-block;background:#f59e0b20;color:#f59e0b;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${warmCount} warm</span>
      <span style="display:inline-block;background:#71717a20;color:#71717a;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${coldCount} cold</span>
    </div>

    ${hotLeads.length > 0 ? `
    <div style="margin-top:24px;">
      <div style="font-size:14px;font-weight:700;color:#09090b;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f4f4f5;">
        Leads hot del dia (${hotLeads.length})
      </div>
      ${hotLeads.map((l) => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f9f9f9;">
        <div style="width:8px;height:8px;background:#ef4444;border-radius:50%;margin-top:5px;flex-shrink:0;"></div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#09090b;">${esc(l.name)}</div>
          ${l.reason ? `<div style="font-size:12px;color:#71717a;margin-top:2px;">${esc(l.reason)}</div>` : ""}
          ${l.nextAction ? `<div style="font-size:12px;color:#10b981;margin-top:2px;">Siguiente: ${esc(l.nextAction)}</div>` : ""}
        </div>
      </div>`).join("")}
    </div>
    ` : ""}

    ${overdueTasks.length > 0 ? `
    <div style="margin-top:24px;">
      <div style="font-size:14px;font-weight:700;color:#09090b;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f4f4f5;">
        Tareas vencidas (${overdueTasks.length})
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;">
        ${overdueTasks.map((t) => {
          const dueRaw = t.dueAt;
          const due = dueRaw instanceof Date ? dueRaw : dueRaw !== null ? new Date((dueRaw as number) < 1e12 ? (dueRaw as number) * 1000 : (dueRaw as number)) : null;
          return `<div style="font-size:13px;color:#991b1b;padding:4px 0;"><strong>${esc(t.title)}</strong> — ${esc(t.contactName ?? "Sin contacto")} <span style="color:#dc2626;font-size:11px;">${due ? due.toLocaleDateString("es-MX") : ""}</span></div>`;
        }).join("")}
      </div>
    </div>
    ` : ""}

    ${atRiskContacts.length > 0 ? `
    <div style="margin-top:24px;">
      <div style="font-size:14px;font-weight:700;color:#09090b;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f4f4f5;">
        Contactos en riesgo (sin interaccion 7+ dias) (${atRiskContacts.length})
      </div>
      ${atRiskContacts.map((c) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f9f9f9;">
        <div style="width:8px;height:8px;background:#f59e0b;border-radius:50%;flex-shrink:0;"></div>
        <div>
          <span style="font-size:13px;font-weight:600;color:#09090b;">${esc(c.name)}</span>
          ${c.company ? `<span style="font-size:12px;color:#71717a;"> — ${esc(c.company)}</span>` : ""}
          <span style="font-size:11px;color:#a1a1aa;margin-left:6px;">${c.stage}</span>
        </div>
      </div>`).join("")}
    </div>
    ` : ""}

    ${hotLeads.length === 0 && overdueTasks.length === 0 && atRiskContacts.length === 0 ? `
    <div style="text-align:center;padding:32px 0;color:#71717a;">
      <div style="font-size:32px;margin-bottom:8px;">✓</div>
      <div style="font-size:14px;">Sin pendientes urgentes hoy.</div>
    </div>
    ` : ""}

  </div>

  <div style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #f4f4f5;">
    <div style="font-size:11px;color:#a1a1aa;">Niuro CRM — niuro.io</div>
  </div>

</div>
</body>
</html>`;

  const subject = `Niuro CRM - Resumen del dia ${now.toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM || "digest@niuro.io",
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { ok: false, error: `Error de Resend: ${err}` },
        { status: 500 }
      );
    }

    const result = await res.json();
    return NextResponse.json({
      ok: true,
      sent: true,
      emailId: result.id,
      sentTo: toEmail,
      summary: {
        hotLeadsHoy: hotLeads.length,
        tareasVencidas: overdueTasks.length,
        contactosEnRiesgo: atRiskContacts.length,
        mrrCents,
        projectedCents,
        leadsPendientes: { hot: hotCount, warm: warmCount, cold: coldCount },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Error enviando email: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
