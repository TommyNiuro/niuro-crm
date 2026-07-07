import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadCandidates } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { dbExists, getMessages } from "@/lib/whatsapp";
import {
  scoreLead,
  recruitingHits,
  type ScoreLeadResult,
  type ScoreBreakdown,
  DIM_MAX,
} from "@/lib/score-lead";
import { getRubricConfig } from "@/lib/score-lead-server";
import type { Temperature } from "@/types";

export const dynamic = "force-dynamic";

const VALID_TEMPS: Temperature[] = ["cold", "warm", "hot"];

interface CachedBreakdown {
  // Shape "scanner Python": claves en inglés, planas
  intention?: number; authority?: number; need?: number; urgency?: number; budget?: number;
  base?: number; factor?: number; reason?: string;
  // Shape "categorize/precalif": español, PLANO (tercer shape conviviendo)
  intencion?: number; autoridad?: number; necesidad?: number; urgencia?: number; presupuesto?: number;
  // Shape "ScoreLeadResult persistido" (esta misma ruta y save-lead): español, anidado
  breakdown?: { intencion?: number; autoridad?: number; necesidad?: number; urgencia?: number; presupuesto?: number };
  signals?: {
    companyToken?: boolean; companyTokenText?: string | null;
    ownerSelling?: boolean; ownerSellKw?: number; ownerSellHits?: number; docsSent?: number;
    reciprocity?: boolean; contactIntent?: number; recencyFactor?: number;
  };
}

// Normaliza el breakdown cacheado al shape canónico del panel de inteligencia.
// Soporta los DOS shapes que conviven en lead_candidates (auditoría 2026-06-09:
// esta ruta persistía ScoreLeadResult en español anidado pero leía esperando
// el shape inglés plano del scanner — su propio cache devolvía dimensiones en 0).
function fromCachedCandidate(row: typeof leadCandidates.$inferSelect): ScoreLeadResult | null {
  if (!row.breakdown) return null;
  let parsed: CachedBreakdown;
  try { parsed = JSON.parse(row.breakdown) as CachedBreakdown; } catch { return null; }

  const nested = parsed.breakdown;
  const breakdown: ScoreBreakdown = nested
    ? {
        intencion: clamp(nested.intencion, DIM_MAX.intencion),
        autoridad: clamp(nested.autoridad, DIM_MAX.autoridad),
        necesidad: clamp(nested.necesidad, DIM_MAX.necesidad),
        urgencia: clamp(nested.urgencia, DIM_MAX.urgencia),
        presupuesto: clamp(nested.presupuesto, DIM_MAX.presupuesto),
      }
    : {
        intencion: clamp(parsed.intention ?? parsed.intencion, DIM_MAX.intencion),
        autoridad: clamp(parsed.authority ?? parsed.autoridad, DIM_MAX.autoridad),
        necesidad: clamp(parsed.need ?? parsed.necesidad, DIM_MAX.necesidad),
        urgencia: clamp(parsed.urgency ?? parsed.urgencia, DIM_MAX.urgencia),
        presupuesto: clamp(parsed.budget ?? parsed.presupuesto, DIM_MAX.presupuesto),
      };
  const sig = parsed.signals || {};
  const temp = (VALID_TEMPS as string[]).includes(row.temperature) ? (row.temperature as Temperature) : "cold";

  const recommendation: "save" | "discard" | "review" =
    row.status === "dismissed" ? "discard"
    : temp === "hot" || (temp === "warm" && (sig.companyToken || sig.reciprocity)) ? "save"
    : row.score < 25 ? "discard"
    : "review";

  return {
    score: row.score,
    base: parsed.base ?? row.score,
    temperature: temp,
    breakdown,
    signals: {
      companyToken: !!sig.companyToken,
      companyTokenText: sig.companyTokenText ?? null,
      ownerSelling: !!sig.ownerSelling,
      ownerSellHits: sig.ownerSellHits ?? sig.ownerSellKw ?? 0,
      docsSent: sig.docsSent ?? 0,
      reciprocity: !!sig.reciprocity,
      contactIntent: sig.contactIntent ?? 0,
      daysSinceLast: row.lastMessageAt ? Math.max(0, Math.floor((Date.now() - new Date(row.lastMessageAt).getTime()) / (1000 * 60 * 60 * 24))) : null,
      recencyFactor: parsed.factor ?? sig.recencyFactor ?? 1,
    },
    reason: row.reason || parsed.reason || "Sin razón registrada.",
    recommendation,
    disqualifier: row.status === "dismissed" ? (row.reason?.toLowerCase().includes("trabajo") ? "busca-trabajo" : row.reason?.toLowerCase().includes("personal") ? "personal" : null) : null,
    mode: "rules",
  };
}

function clamp(n: number | undefined, max: number): number {
  const v = typeof n === "number" && !isNaN(n) ? n : 0;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chatJid = searchParams.get("chat_jid");
  const force = searchParams.get("fresh") === "1";
  const name = searchParams.get("name");
  if (!chatJid) {
    return NextResponse.json({ error: "chat_jid es requerido" }, { status: 400 });
  }

  // 0) Reclutamiento ANTES del cache: los candidates viejos guardan scores de
  // venta calculados cuando el scorer no distinguía reclutamiento, y servirlos
  // seguiría mostrando "48 de venta" a un candidato. El chequeo es keywords
  // sobre los mensajes (barato) y gana siempre.
  if (dbExists()) {
    try {
      const recMsgs = getMessages({ chatJid, limit: 60 });
      const combined = recMsgs.map((m) => (m.content || "").toLowerCase()).join(" \n ");
      const recHits = recruitingHits(combined);
      if (recHits.length >= 2) {
        const result = scoreLead(
          recMsgs.map((m) => ({ content: m.content, isFromMe: m.isFromMe, timestamp: m.timestamp, mediaType: m.mediaType })),
          name,
          { rubric: getRubricConfig() }
        );
        return NextResponse.json({ ...result, source: "fresh" });
      }
    } catch {
      // si el store no responde, sigue el flujo normal (cache / on-demand)
    }
  }

  // 1) Cache: ¿hay un lead_candidate (pending o dismissed) con breakdown?
  // Pending tiene prioridad sobre dismissed; si solo hay dismissed, lo respeta.
  if (!force) {
    const rows = db
      .select()
      .from(leadCandidates)
      .where(and(eq(leadCandidates.chatJid, chatJid), inArray(leadCandidates.status, ["pending", "dismissed"])))
      .all();
    const row = rows.find((r) => r.status === "pending") || rows[0];
    if (row) {
      const result = fromCachedCandidate(row);
      if (result) {
        return NextResponse.json({
          ...result,
          source: "cache",
          candidateId: row.id,
          candidateStatus: row.status,
        });
      }
    }
  }

  // 2) On-demand: leer mensajes del puente y correr scoreLead.
  if (!dbExists()) {
    return NextResponse.json({ error: "No hay base de WhatsApp disponible" }, { status: 503 });
  }
  let msgs;
  try {
    msgs = getMessages({ chatJid, limit: 60 });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudieron leer los mensajes: ${err instanceof Error ? err.message : "desconocido"}` },
      { status: 500 }
    );
  }
  if (!msgs.length) {
    return NextResponse.json({ error: "Chat sin mensajes en la ventana visible" }, { status: 404 });
  }

  const result = scoreLead(
    msgs.map((m) => ({ content: m.content, isFromMe: m.isFromMe, timestamp: m.timestamp, mediaType: m.mediaType })),
    name,
    { rubric: getRubricConfig() }
  );

  // Persist fresh score back to lead_candidates so next request gets cached result
  const existing = db.select({ id: leadCandidates.id }).from(leadCandidates).where(eq(leadCandidates.chatJid, chatJid)).get();
  if (existing) {
    db.update(leadCandidates).set({
      score: result.score,
      temperature: result.temperature,
      breakdown: JSON.stringify({ breakdown: result.breakdown, signals: result.signals, base: result.base, reason: result.reason, mode: result.mode, updatedAt: new Date().toISOString() }),
      updatedAt: new Date(),
    }).where(eq(leadCandidates.chatJid, chatJid)).run();
  }

  return NextResponse.json({ ...result, source: "fresh" });
}
