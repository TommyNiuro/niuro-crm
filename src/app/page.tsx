import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activities, crmSettings } from "@/db/schema";
import { desc, eq, gt } from "drizzle-orm";
import { getOperator } from "@/lib/operator";
import { getDashboardData } from "@/lib/dashboard-cache";
import {
  ArrowRight, Flame, MessageCircle, Sparkles, Target, TrendingUp,
  Clock, BarChart3, Radar, Trophy, Scale, ExternalLink, CalendarClock, AlertTriangle,
} from "lucide-react";
import { Avatar } from "@/components/ds";
import MyDay from "@/components/dashboard/MyDay";
import { formatCurrency } from "@/lib/constants";
import { getStages, stageCfgFor } from "@/lib/stages";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const DIM_MAX = { intencion: 35, autoridad: 20, necesidad: 20, urgencia: 15, presupuesto: 10 };
const DIM_LABEL: Record<string, string> = {
  intencion: "Int", autoridad: "Aut", necesidad: "Nec", urgencia: "Urg", presupuesto: "Pre",
};

// Breakdowns en inglés (scanner Python) o español (spec)
function normBreakdown(b: Record<string, number>) {
  return {
    intencion: b.intention ?? b.intencion ?? 0,
    autoridad: b.authority ?? b.autoridad ?? 0,
    necesidad: b.need ?? b.necesidad ?? 0,
    urgencia: b.urgency ?? b.urgencia ?? 0,
    presupuesto: b.budget ?? b.presupuesto ?? 0,
  };
}

type Calibration = {
  updatedAt: string; wonCount: number; lostCount: number;
  avgWonScore: number | null; avgLostScore: number | null;
  lossCategories: { category: string; count: number }[];
};

export default function HomePage() {
  // Gate de primer arranque: sin identidad configurada -> onboarding.
  // ponytail: solo la home (es donde aterriza la app al abrir). Upgrade path:
  // mover a src/middleware.ts si hay que bloquear todas las rutas.
  const onboarded = db
    .select()
    .from(crmSettings)
    .where(eq(crmSettings.key, "onboarding_completed"))
    .get();
  if (!onboarded?.value) redirect("/onboarding");

  const operator = getOperator();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  // Etapas y meta desde la DB (editables en Ajustes), no constantes.
  const STAGES = getStages().map((s) => s.name);
  const GOAL_CENTS = (Number(readSettings(["goal_mrr"]).goal_mrr) || 20_000) * 100;

  // ── Datos (cacheados 15s: son agregados de KPIs, no tiene sentido recalcular
  // un full scan en cada request de force-dynamic) ──
  const dash = getDashboardData();
  const all = dash.contacts;
  const active = all.filter((c) => !c.archived);
  const lost = all.filter((c) => c.archived);

  const pending = dash.pendingCandidates;
  const hotPending = pending.filter((p) => p.temperature === "hot");
  const warmPending = pending.filter((p) => p.temperature === "warm");
  const topCandidates = pending.filter((p) => p.temperature === "hot" || (p.temperature === "warm" && (p.score || 0) >= 55)).slice(0, 4);

  const newOps = dash.newOpportunities;
  const opsWA = newOps.filter((o) => o.source === "whatsapp");
  const opsExt = newOps.filter((o) => o.source !== "whatsapp");
  const topOps = newOps.slice(0, 4);

  const openTasks = dash.openTasks;
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const dueToday = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) <= endOfToday);
  const openTaskIds = new Set(openTasks.map((t) => t.contactId));
  const workingStages = new Set(["Prospecto", "Discovery", "Propuesta", "Perfil", "Entrevistas"]);
  const atRisk = active.filter((c) => workingStages.has(c.stage) && !openTaskIds.has(c.id));

  const recentActivities = db.select().from(activities)
    .where(gt(activities.createdAt, weekAgo))
    .orderBy(desc(activities.createdAt))
    .limit(7)
    .all();

  // ── KPIs ──
  const STAGE_PROB: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, stageCfgFor(s, i).probability]));
  const closedCents = active.filter((c) => c.stage === "Cierre" || c.stage === "Expansion").reduce((s, c) => s + (c.valueCents || 0), 0);
  const projectedCents = active.filter((c) => c.stage !== "Cierre" && c.stage !== "Expansion")
    .reduce((s, c) => s + ((c.valueCents || 0) * (STAGE_PROB[c.stage] || 0)) / 100, 0);
  const goalPct = Math.min(100, Math.round(((closedCents + projectedCents) / GOAL_CENTS) * 100));
  const weightedCents = active.reduce((s, c) => s + ((c.valueCents || 0) * (c.probability || 0)) / 100, 0);

  const won = active.filter((c) => c.stage === "Cierre" || c.stage === "Expansion").length;
  const winRate = won + lost.length > 0 ? Math.round((won / (won + lost.length)) * 100) : null;
  const newLeads7d = pending.filter((p) => p.createdAt && new Date(p.createdAt) > weekAgo).length;

  // ── Pipeline compacto ──
  const byStage = STAGES.map((s) => {
    const items = active.filter((c) => c.stage === s);
    return { stage: s, count: items.length, value: items.reduce((a, c) => a + (c.valueCents || 0), 0) };
  });
  const maxCount = Math.max(1, ...byStage.map((s) => s.count));

  // ── Calibración del scoring ──
  let calibration: Calibration | null = null;
  try {
    const row = db.select().from(crmSettings).where(eq(crmSettings.key, "scoring_calibration")).get();
    if (row?.value) calibration = JSON.parse(row.value) as Calibration;
  } catch { /* sin calibración aún */ }

  // ── Saludo + briefing ──
  const dateStr = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const hour = now.getHours();
  const saludo = hour < 12 ? "Buenos dias" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const parts: string[] = [];
  if (dueToday.length > 0) parts.push(`${dueToday.length} tarea${dueToday.length > 1 ? "s" : ""} para hoy`);
  if (hotPending.length > 0) parts.push(`${hotPending.length} lead${hotPending.length > 1 ? "s" : ""} caliente${hotPending.length > 1 ? "s" : ""}`);
  if (newOps.length > 0) parts.push(`${newOps.length} oportunidad${newOps.length > 1 ? "es" : ""} en el radar`);
  if (atRisk.length > 0) parts.push(`${atRisk.length} contacto${atRisk.length > 1 ? "s" : ""} sin próximo paso`);
  const briefing = parts.length > 0 ? `Tienes ${parts.join(" · ")}.` : "Todo bajo control. Buen momento para nutrir cuentas y perseguir expansión.";

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <div className="max-w-[1280px] space-y-5">

        {/* ── Header + briefing ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground capitalize">{dateStr}</p>
            <h1 className="text-[26px] font-semibold tracking-tight">{saludo}, {operator.name}</h1>
            <p className="text-[13px] text-muted-foreground mt-1 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" /> {briefing}
            </p>
          </div>
          <div className="flex gap-2">
            {hotPending.length > 0 && (
              <Link href="/whatsapp/leads" className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive/15">
                <Flame className="h-3.5 w-3.5" /> {hotPending.length} calientes
              </Link>
            )}
            {newOps.length > 0 && (
              <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-2 bg-primary/10 text-primary hover:bg-primary/15">
                <Radar className="h-3.5 w-3.5" /> {newOps.length} en radar
              </Link>
            )}
            {atRisk.length > 0 && (
              <Link href="/contacts" className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-2 bg-muted/60 text-muted-foreground hover:bg-hover">
                <AlertTriangle className="h-3.5 w-3.5" /> {atRisk.length} sin próximo paso
              </Link>
            )}
          </div>
        </div>

        {/* ── KPI hero ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Meta MRR</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: goalPct >= 70 ? "var(--primary)" : "var(--warning)" }}>{goalPct}%</span>
            </div>
            <div className="text-[22px] font-bold tabular-nums leading-tight mt-0.5">{formatCurrency(closedCents + Math.round(projectedCents))}</div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-2 flex">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.round((closedCents / GOAL_CENTS) * 100))}%` }} />
              <div className="h-full bg-warning/60" style={{ width: `${Math.min(100, Math.round((projectedCents / GOAL_CENTS) * 100))}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {formatCurrency(closedCents)} cerrado · {formatCurrency(Math.round(projectedCents))} proyectado · de $20,000
            </div>
          </div>
          <Kpi icon={Scale} label="Pipeline ponderado" value={formatCurrency(Math.round(weightedCents))} sub={`${active.filter((c) => c.valueCents > 0).length} con monto`} />
          <Kpi icon={Trophy} label="Win rate" value={winRate != null ? `${winRate}%` : "—"} sub={`${won} ganados · ${lost.length} perdidos`} tone={winRate != null && winRate >= 30 ? "ok" : undefined} href="/analytics" />
          <Kpi icon={Flame} label="Con señal de lead" value={hotPending.length + warmPending.length} sub={`${hotPending.length} calientes · ${warmPending.length} tibios · ${newLeads7d} nuevos 7d`} tone={hotPending.length > 0 ? "warn" : undefined} href="/whatsapp/leads" />
          <Kpi icon={CalendarClock} label="Tareas hoy" value={dueToday.length} sub={`${openTasks.length} abiertas · ${atRisk.length} sin paso`} tone={dueToday.length > 0 ? "warn" : "ok"} href="/calendar" />
        </div>

        {/* ── Grid principal ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* Columna izquierda (2/3) */}
          <div className="lg:col-span-2 space-y-5">
            <MyDay />

            {/* Pipeline compacto */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Pipeline</h2>
                  <span className="text-[11px] text-muted-foreground">{active.length} activos</span>
                </div>
                <Link href="/pipeline" className="text-xs text-muted-foreground hover:text-foreground">Ver kanban</Link>
              </div>
              <div className="space-y-2">
                {byStage.map((s) => {
                  const cfg = stageCfgFor(s.stage, 0);
                  return (
                    <Link key={s.stage} href="/pipeline" aria-label={`${s.stage}: ${s.count} contacto${s.count !== 1 ? "s" : ""}${s.value > 0 ? ", " + formatCurrency(s.value) : ""}`} className="flex items-center gap-3 group">
                      <span className="w-[84px] text-[11px] text-right shrink-0" style={{ color: cfg.text }}>{s.stage}</span>
                      <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-md flex items-center px-2 transition-all group-hover:opacity-80"
                          style={{ width: `${Math.max(s.count > 0 ? 8 : 0, Math.round((s.count / maxCount) * 100))}%`, background: cfg.bg, borderLeft: s.count > 0 ? `3px solid ${cfg.text}` : "none" }}
                        >
                          {s.count > 0 && <span className="text-[11px] font-bold tabular-nums" style={{ color: cfg.text }}>{s.count}</span>}
                        </div>
                      </div>
                      <span className="w-[76px] text-[11px] text-right tabular-nums shrink-0 text-muted-foreground">
                        {s.value > 0 ? formatCurrency(s.value) : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Actividad reciente */}
            {recentActivities.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Actividad reciente</h2>
                  <span className="text-[11px] text-muted-foreground">últimos 7 días</span>
                </div>
                <div role="list" aria-label="Actividad reciente" className="space-y-1">
                  {recentActivities.map((a) => {
                    const c = all.find((x) => x.id === a.contactId);
                    const when = a.createdAt ? new Date(a.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" }) : "";
                    return (
                      <div key={a.id} role="listitem" className="flex items-start gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-hover">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px]">{a.description}</span>
                          {c && <span className="text-[11px] text-muted-foreground ml-2">· {c.name}</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{when}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha (1/3) */}
          <div className="space-y-5">

            {/* Radar de oportunidades */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Radar</h2>
                </div>
                <Link href="/opportunities" className="text-xs text-muted-foreground hover:text-foreground">Ver todas</Link>
              </div>
              <div className="flex gap-2 mb-3">
                <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-surface-2 text-muted-foreground">{opsWA.length} de grupos</span>
                <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-sky-500/10 text-sky-500">{opsExt.length} de GetOnBoard</span>
              </div>
              {topOps.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Sin oportunidades nuevas. El radar sigue vigilando.</p>
              ) : (
                <div className="space-y-1">
                  {topOps.map((o) => {
                    const ext = o.source !== "whatsapp";
                    return (
                      <Link key={o.id} href="/opportunities" className="flex items-center gap-2.5 px-2 py-2 -mx-2 rounded-lg hover:bg-hover">
                        {ext ? <ExternalLink className="h-3.5 w-3.5 text-sky-500 shrink-0" /> : <MessageCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium truncate">{o.role || o.summary || "Busca talento"}</div>
                          <div className="text-[10.5px] text-muted-foreground truncate">{ext ? o.company || o.sender : o.groupName}</div>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: o.score >= 70 ? "var(--destructive)" : o.score >= 40 ? "var(--warning)" : "var(--muted-foreground)" }}>{o.score}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Leads que pintan */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-destructive" />
                  <h2 className="text-sm font-semibold">Leads que pintan</h2>
                </div>
                <Link href="/whatsapp/leads" className="text-xs text-muted-foreground hover:text-foreground">Ver todos</Link>
              </div>
              {topCandidates.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Sin calientes ni tibios altos pendientes.</p>
              ) : (
                <div className="space-y-3">
                  {topCandidates.map((l) => {
                    let bd: Record<string, number> = {};
                    try { bd = normBreakdown(JSON.parse(l.breakdown || "{}")); } catch { /* breakdown ilegible */ }
                    const tempColor = l.temperature === "hot" ? "var(--destructive)" : "var(--warning)";
                    return (
                      <Link key={l.id} href={`/whatsapp?chat=${encodeURIComponent(l.chatJid)}`} className="block p-2.5 rounded-lg bg-surface-2 hover:bg-hover transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar name={l.name} size={24} />
                          <span className="text-[12.5px] font-medium truncate flex-1">{l.name}</span>
                          <span className="text-[12px] font-bold tabular-nums" style={{ color: tempColor }}>{l.score}</span>
                        </div>
                        {Object.keys(bd).length > 0 && (
                          <div className="grid grid-cols-5 gap-1">
                            {(Object.keys(DIM_MAX) as (keyof typeof DIM_MAX)[]).map((k) => {
                              const pct = Math.round(((bd[k] ?? 0) / DIM_MAX[k]) * 100);
                              return (
                                <div key={k}>
                                  <div className="h-1 rounded-full bg-surface-3 overflow-hidden mb-0.5">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 50 ? "var(--primary)" : "var(--muted-foreground)" }} />
                                  </div>
                                  <div className="text-[9px] text-muted-foreground text-center">{DIM_LABEL[k]}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scoring que aprende */}
            {calibration && calibration.avgWonScore != null && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Scoring calibrado</h2>
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <div className="text-[20px] font-bold tabular-nums text-primary">{calibration.avgWonScore}</div>
                    <div className="text-[10px] text-muted-foreground">score prom. ganados ({calibration.wonCount})</div>
                  </div>
                  <div>
                    <div className="text-[20px] font-bold tabular-nums text-destructive">{calibration.avgLostScore ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">score prom. perdidos ({calibration.lostCount})</div>
                  </div>
                </div>
                {calibration.lossCategories[0] && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Pérdida más común: “{calibration.lossCategories[0].category}” ×{calibration.lossCategories[0].count}. La IA califica con estos casos reales.
                  </p>
                )}
              </div>
            )}

            {/* Acciones rápidas */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
                { label: "Pipeline", href: "/pipeline", icon: BarChart3 },
                { label: "Agenda", href: "/calendar", icon: Clock },
                { label: "Analítica", href: "/analytics", icon: TrendingUp },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-hover transition-colors">
                  <a.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-[12px] font-medium truncate">{a.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone, href }: {
  icon: typeof Target; label: string; value: string | number; sub: string;
  tone?: "ok" | "warn"; href?: string;
}) {
  const valColor = tone === "warn" ? "var(--warning)" : tone === "ok" ? "var(--primary)" : "var(--foreground)";
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 h-full">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-[22px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: valColor }}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner;
}
