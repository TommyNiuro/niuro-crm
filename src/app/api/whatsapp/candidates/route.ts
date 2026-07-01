import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadCandidates, crmSettings, contacts } from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { promoteCandidate, AUTO_PROMOTE_THRESHOLD } from "@/lib/promote-lead";
import { logger } from "@/lib/logger";

function isAutoPromoteEnabled(): boolean {
  const row = db.select().from(crmSettings).where(eq(crmSettings.key, "auto_promote_hot")).get();
  // Default ON
  return row?.value !== "off";
}

const VALID_TEMPS = ["cold", "warm", "hot"];

// GET /api/whatsapp/candidates?status=pending&temperature=hot&limit=50&offset=0 — list candidates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const temperature = searchParams.get("temperature");
  const limit = Math.min(200, Number(searchParams.get("limit") || "100"));
  const offset = Number(searchParams.get("offset") || "0");
  const countOnly = searchParams.get("count") === "1";

  const conditions = [eq(leadCandidates.status, status)];
  if (temperature && VALID_TEMPS.includes(temperature)) {
    conditions.push(eq(leadCandidates.temperature, temperature));
  }
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  if (countOnly) {
    const counts = db
      .select({
        temperature: leadCandidates.temperature,
        count: sql<number>`count(*)`,
      })
      .from(leadCandidates)
      .where(eq(leadCandidates.status, status))
      .groupBy(leadCandidates.temperature)
      .all();
    return NextResponse.json(counts);
  }

  const rows = db
    .select()
    .from(leadCandidates)
    .where(where)
    .orderBy(desc(leadCandidates.score), desc(leadCandidates.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  return NextResponse.json(rows);
}

// PUT /api/whatsapp/candidates — bulk action { ids: string[], action: "approve"|"dismiss" }
export async function PUT(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { ids, action, temperature } = body || {};

  if (!action || !["approve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "action invalida" }, { status: 400 });
  }

  const now = new Date();

  // Bulk dismiss by temperature (e.g., dismiss all cold)
  if (!ids && temperature && VALID_TEMPS.includes(temperature)) {
    db.update(leadCandidates)
      .set({ status: action === "dismiss" ? "dismissed" : "approved", updatedAt: now })
      .where(and(eq(leadCandidates.status, "pending"), eq(leadCandidates.temperature, temperature)))
      .run();
    return NextResponse.json({ ok: true, action, temperature });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids requerido" }, { status: 400 });
  }

  // Bulk dismiss only for now (bulk approve requires contact creation — too complex here)
  if (action === "dismiss") {
    db.update(leadCandidates)
      .set({ status: "dismissed", updatedAt: now })
      .where(and(eq(leadCandidates.status, "pending"), inArray(leadCandidates.id, ids)))
      .run();
    return NextResponse.json({ ok: true, dismissed: ids.length });
  }

  return NextResponse.json({ error: "bulk approve no soportado — aprueba uno a uno" }, { status: 400 });
}

// POST /api/whatsapp/candidates — ingest one or many candidates (used by the
// terminal "brain" / scanner). Dedupes pending candidates by chat_jid.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : Array.isArray(body?.candidates) ? body.candidates : [body];
  const now = new Date();
  const results: unknown[] = [];

  for (const item of items) {
    const { name, phone, chatJid, score, temperature, reason, nextAction, lastMessageAt, breakdown } = item || {};
    if (!name || !chatJid) continue;

    const temp = VALID_TEMPS.includes(temperature) ? temperature : "cold";
    const sc = Math.max(0, Math.min(100, Number(score) || 0));
    const lastAt = lastMessageAt ? new Date(lastMessageAt) : null;
    const breakdownStr =
      breakdown && typeof breakdown === "object" ? JSON.stringify(breakdown) : null;

    // Dedupe via UNIQUE index on chat_jid: update existing (any status) o insert nuevo.
    // No reabrimos candidates ya approved/dismissed — solo actualizamos pending.
    const existing = db
      .select()
      .from(leadCandidates)
      .where(eq(leadCandidates.chatJid, chatJid))
      .get();
    if (existing && existing.status !== "pending") {
      // Ya fue procesado (approved o dismissed). No tocar ni duplicar.
      results.push(existing);
      continue;
    }

    if (existing) {
      const updated = db
        .update(leadCandidates)
        .set({
          name,
          phone: phone || null,
          score: sc,
          temperature: temp,
          reason: reason || null,
          nextAction: nextAction || null,
          breakdown: breakdownStr ?? existing.breakdown,
          lastMessageAt: lastAt && !isNaN(lastAt.getTime()) ? lastAt : existing.lastMessageAt,
          updatedAt: now,
        })
        .where(eq(leadCandidates.id, existing.id))
        .returning()
        .get();
      results.push(updated);
    } else {
      const inserted = db
        .insert(leadCandidates)
        .values({
          name,
          phone: phone || null,
          chatJid,
          score: sc,
          temperature: temp,
          reason: reason || null,
          nextAction: nextAction || null,
          breakdown: breakdownStr,
          source: "whatsapp",
          status: "pending",
          lastMessageAt: lastAt && !isNaN(lastAt.getTime()) ? lastAt : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      results.push(inserted);
    }
  }

  // Auto-promocion: hot + score >= AUTO_PROMOTE_THRESHOLD + sin contacto previo con ese jid
  // El helper es idempotente — si ya hay contacto con ese jid, lo reutiliza y solo marca approved.
  const autoPromoted: string[] = [];
  if (isAutoPromoteEnabled()) {
    for (const r of results) {
      const cand = r as typeof leadCandidates.$inferSelect | undefined;
      if (
        cand &&
        cand.status === "pending" &&
        cand.temperature === "hot" &&
        cand.score >= AUTO_PROMOTE_THRESHOLD
      ) {
        const existing = db
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.whatsappJid, cand.chatJid))
          .get();
        if (existing) continue; // ya esta en el CRM, no auto-promover de nuevo
        try {
          promoteCandidate(cand, { auto: true });
          autoPromoted.push(cand.name);
        } catch (err) {
          // no romper la ingesta si una promocion falla — pero dejar registro
          // (auditoría 2026-06-09: antes reportaba éxito sin crear el contacto)
          logger.error("candidates.auto-promote", "auto-promote fallo", {
            name: cand.name,
            chatJid: cand.chatJid,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return NextResponse.json(
    { ingested: results.length, candidates: results, autoPromoted },
    { status: 201 }
  );
}
