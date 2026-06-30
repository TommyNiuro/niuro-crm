"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  AlertTriangle,
  Target,
  Calendar,
  ArrowRight,
  Swords,
  Shield,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Crosshair,
  DollarSign,
  Clock,
  MessagesSquare,
  ExternalLink,
  X,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type WaChat, chatDisplayName, jidToPhone } from "./types";

const STAGES = ["Prospecto", "Discovery", "Propuesta", "Perfil", "Entrevistas", "Cierre", "Expansion"];
const SENIORITIES = ["junior", "mid", "senior", "lead", "principal"];

interface SaveLeadDialogProps {
  chat: WaChat | null;
  open: boolean;
  onClose: () => void;
}

interface SalesSignals {
  positive: string[];
  negative: string[];
}

interface Activity {
  firstContactAt: string | null;
  lastContactAt: string | null;
  lastFromLeadAt: string | null;
  lastFromMeAt: string | null;
  daysSinceLastContact: number | null;
  daysSinceLastLeadReply: number | null;
  conversationSpanDays: number;
  msgsFromLead: number;
  msgsFromMe: number;
}

interface Extracted {
  name: string | null;
  email: string | null;
  jobDescription: string | null;
  company: string | null;
  role: string | null;
  seniority: string | null;
  stack: string[];
  stage: string;
  urgency: string | null;
  headcount: number;
  notes: string;
  estimatedMonthly: { min: number; max: number; perPerson: { min: number; max: number }; role: string } | null;
  messageCount: number;
  mode: "ai" | "fallback";
  painPoints: string[];
  budgetSignal: string | null;
  decisionMaker: boolean | null;
  keyObjections: string[];
  openQuestions: string[];
  nextStep: string | null;
  followUpDate: string | null;
  responseStrategy: string | null;
  salesSignals: SalesSignals;
  objectionHandling: { objection: string; counterArg: string }[];
  competitor: { name: string; positioning: string[] } | null;
  stageMismatch: { declaredStage: string; realStage: string; reason: string } | null;
  activity?: Activity;
}

// ── Helpers para mostrar actividad temporal ─────────────────────────────────
function formatRelativeDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  if (days < 365) return `${Math.floor(days / 30)}m`;
  return `${Math.floor(days / 365)}a`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

// Color semáforo según días sin que el lead responda
function staleness(days: number | null): { tone: string; label: string; dot: string } {
  if (days === null) return { tone: "bg-muted text-muted-foreground border-border", label: "Sin datos", dot: "bg-muted-foreground" };
  if (days <= 1) return { tone: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60", label: "Activo", dot: "bg-emerald-500" };
  if (days <= 3) return { tone: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60", label: "Enfriándose", dot: "bg-amber-500" };
  if (days <= 7) return { tone: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/60", label: "Frío", dot: "bg-orange-500" };
  return { tone: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60", label: "Perdido", dot: "bg-red-500" };
}

function ActivityStrip({ activity }: { activity: Activity }) {
  const stale = staleness(activity.daysSinceLastLeadReply);
  return (
    <div className={`rounded-xl border ${stale.tone} px-4 py-3`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className={`relative flex h-2.5 w-2.5`}>
            {activity.daysSinceLastLeadReply !== null && activity.daysSinceLastLeadReply <= 1 && (
              <span className={`absolute inline-flex h-full w-full rounded-full ${stale.dot} opacity-60 animate-ping`} />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${stale.dot}`} />
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-bold tracking-tight">{stale.label}</span>
            <span className="text-[11px] opacity-70">
              · Lead respondió hace {formatRelativeDays(activity.daysSinceLastLeadReply)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] opacity-80">
          <div className="flex items-center gap-1.5" title={`Primera: ${formatDate(activity.firstContactAt)} · Última: ${formatDate(activity.lastContactAt)}`}>
            <Clock className="h-3.5 w-3.5" />
            <span>{activity.conversationSpanDays === 0 ? "Hoy" : `${activity.conversationSpanDays}d de relación`}</span>
          </div>
          <div className="flex items-center gap-1.5" title={`${activity.msgsFromMe} tuyos · ${activity.msgsFromLead} del lead`}>
            <MessagesSquare className="h-3.5 w-3.5" />
            <span>{activity.msgsFromMe}↑ · {activity.msgsFromLead}↓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const URGENCY_LABELS: Record<string, string> = { high: "Alta", medium: "Media", low: "Baja" };
const URGENCY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sales Intelligence Panel — clean, opinionated, single accent (violet)
// Inspired by Linear/Attio/Pipedrive. Sections, not tabs. Strong contrast.
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-meta">{icon}</span>}
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </h4>
    </div>
  );
}

function IntelSkeleton() {
  return (
    <aside className="flex flex-col min-h-0 h-full bg-muted/30 border-l border-border px-6 py-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4 text-white animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
              <span className="text-[11px] text-muted-foreground">Claude analizando…</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Hero Cómo responder */}
        <div className="rounded-xl bg-violet-50/60 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-900/40 p-5 space-y-2.5">
          <div className="h-3 w-32 rounded bg-violet-200/60 dark:bg-violet-900/60 animate-pulse" />
          <div className="space-y-1.5 pt-1">
            <div className="h-3.5 rounded bg-violet-100 dark:bg-violet-950/60 animate-pulse" />
            <div className="h-3.5 w-[92%] rounded bg-violet-100 dark:bg-violet-950/60 animate-pulse" />
            <div className="h-3.5 w-[78%] rounded bg-violet-100 dark:bg-violet-950/60 animate-pulse" />
          </div>
        </div>

        {/* Señales 2-col */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl bg-card border border-border p-3.5 space-y-2">
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-[85%] rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Dolores */}
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg bg-card border border-border px-3.5 py-2.5">
              <div className={`h-3 ${i === 0 ? "w-3/4" : "w-2/3"} rounded bg-muted animate-pulse`} />
            </div>
          ))}
        </div>

        {/* Datos del deal */}
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-[70%] rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function IntelPanel({ extracted }: { extracted: Extracted }) {
  const hasStrategy = !!extracted.responseStrategy;
  const hasSignals = (extracted.salesSignals?.positive?.length ?? 0) > 0 || (extracted.salesSignals?.negative?.length ?? 0) > 0;
  const hasFacts = !!extracted.budgetSignal || extracted.decisionMaker !== null || !!extracted.competitor;
  const hasPains = (extracted.painPoints?.length ?? 0) > 0;
  const hasObjections = (extracted.objectionHandling?.length ?? 0) > 0 || (extracted.keyObjections?.length ?? 0) > 0;
  const hasQuestions = (extracted.openQuestions?.length ?? 0) > 0;

  return (
    <aside className="flex flex-col min-h-0 h-full bg-muted/30 border-l border-border px-6 py-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground leading-tight">Brief de venta</h3>
            <p className="text-[11px] text-muted-foreground leading-tight">Análisis de {extracted.messageCount} mensajes</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">

        {/* HERO — Stage mismatch alert (only if exists) */}
        {extracted.stageMismatch && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-amber-900 dark:text-amber-100">
                  La etapa real es <span className="underline decoration-amber-400 decoration-2 underline-offset-2">{extracted.stageMismatch.realStage}</span>
                </p>
                <p className="text-[12px] text-amber-800/80 dark:text-amber-200/80 mt-1.5 leading-relaxed">
                  {extracted.stageMismatch.reason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* HERO — Cómo responder */}
        {hasStrategy && (
          <div className="rounded-xl bg-gradient-to-br from-violet-50 via-violet-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-violet-950/30 dark:to-fuchsia-950/30 border border-violet-200 dark:border-violet-900/60 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-violet-200/40 to-transparent dark:from-violet-700/20 rounded-full blur-2xl -translate-y-8 translate-x-8" />
            <div className="relative">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
                    Cómo responder ahora
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(extracted.responseStrategy ?? "");
                    toast.success("Estrategia copiada al portapapeles");
                  }}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-violet-100 dark:bg-violet-900/60 hover:bg-violet-200 dark:hover:bg-violet-900 text-violet-700 dark:text-violet-200 transition-colors cursor-pointer"
                >
                  Copiar
                </button>
              </div>
              <p className="text-[14px] text-violet-950 dark:text-violet-50 leading-relaxed font-medium">
                {extracted.responseStrategy}
              </p>
            </div>
          </div>
        )}

        {/* Signals — 2 col */}
        {hasSignals && (
          <div className="grid grid-cols-2 gap-3">
            {(extracted.salesSignals?.positive?.length ?? 0) > 0 && (
              <div className="rounded-xl bg-card border border-border p-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <div className="h-5 w-5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    A favor
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {extracted.salesSignals!.positive.map((s, i) => (
                    <li key={i} className="text-[12.5px] text-foreground flex gap-2 leading-relaxed">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(extracted.salesSignals?.negative?.length ?? 0) > 0 && (
              <div className="rounded-xl bg-card border border-border p-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <div className="h-5 w-5 rounded-md bg-red-100 dark:bg-red-950/60 flex items-center justify-center">
                    <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                    En contra
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {extracted.salesSignals!.negative.map((s, i) => (
                    <li key={i} className="text-[12.5px] text-foreground flex gap-2 leading-relaxed">
                      <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pains */}
        {hasPains && (
          <div>
            <SectionTitle icon={<Crosshair className="h-3.5 w-3.5" />}>Dolores del prospecto</SectionTitle>
            <div className="space-y-2">
              {extracted.painPoints!.map((p, i) => (
                <div key={i} className="rounded-lg bg-card border border-border px-3.5 py-2.5 flex items-start gap-2.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                  <p className="text-[13px] text-foreground leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Facts — Budget / Decision Maker / Competitor */}
        {hasFacts && (
          <div>
            <SectionTitle>Datos del deal</SectionTitle>
            <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
              {extracted.budgetSignal && (
                <div className="px-4 py-3 flex items-start gap-3">
                  <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Presupuesto</p>
                    <p className="text-[13px] text-foreground leading-snug">{extracted.budgetSignal}</p>
                  </div>
                </div>
              )}
              {extracted.decisionMaker !== null && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                    extracted.decisionMaker
                      ? "bg-emerald-100 dark:bg-emerald-950/60"
                      : "bg-amber-100 dark:bg-amber-950/60"
                  }`}>
                    <Shield className={`h-3.5 w-3.5 ${
                      extracted.decisionMaker ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Decisor</p>
                    <p className="text-[13px] font-semibold text-foreground">
                      {extracted.decisionMaker ? "Puede contratar" : "No es decisor final"}
                    </p>
                  </div>
                </div>
              )}
              {extracted.competitor && (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-7 w-7 rounded-lg bg-orange-100 dark:bg-orange-950/60 flex items-center justify-center shrink-0">
                      <Swords className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Compite contra</p>
                      <p className="text-[13px] font-semibold text-foreground">{extracted.competitor.name}</p>
                    </div>
                  </div>
                  {extracted.competitor.positioning.length > 0 && (
                    <ul className="ml-10 space-y-1 mt-2">
                      {extracted.competitor.positioning.map((p, i) => (
                        <li key={i} className="text-[12px] text-muted-foreground flex gap-2 leading-relaxed">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Objections handling */}
        {hasObjections && (
          <div>
            <SectionTitle icon={<Shield className="h-3.5 w-3.5" />}>
              Objeciones &amp; respuestas
            </SectionTitle>
            <div className="space-y-2.5">
              {extracted.objectionHandling!.map((o, i) => (
                <div key={i} className="rounded-xl bg-card border border-border overflow-hidden">
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-start gap-2">
                      <div className="text-[20px] text-border leading-none font-serif shrink-0">&ldquo;</div>
                      <p className="text-[13px] text-muted-foreground italic leading-snug">
                        {o.objection}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-3 pt-2 bg-violet-50/60 dark:bg-violet-950/30 border-t border-violet-100 dark:border-violet-900/40 flex items-start gap-2">
                    <ArrowRight className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400 mt-0.5 shrink-0" />
                    <p className="text-[13px] text-violet-900 dark:text-violet-100 font-medium leading-relaxed">
                      {o.counterArg}
                    </p>
                  </div>
                </div>
              ))}
              {/* Loose objections without counter-args */}
              {(extracted.keyObjections?.length ?? 0) > 0 && (extracted.objectionHandling?.length ?? 0) === 0 && (
                <div className="rounded-lg bg-card border border-border p-3 space-y-1.5">
                  {extracted.keyObjections!.map((o, i) => (
                    <p key={i} className="text-[13px] text-foreground flex gap-2 leading-relaxed">
                      <span className="text-amber-500 shrink-0">•</span> {o}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Open questions */}
        {hasQuestions && (
          <div>
            <SectionTitle icon={<HelpCircle className="h-3.5 w-3.5" />}>Preguntas pendientes</SectionTitle>
            <div className="space-y-2">
              {extracted.openQuestions!.map((q, i) => (
                <div key={i} className="rounded-lg bg-card border border-border px-3.5 py-2.5">
                  <p className="text-[13px] text-foreground leading-relaxed">{q}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dialog
// ─────────────────────────────────────────────────────────────────────────────

export function SaveLeadDialog({ chat, open, onClose }: SaveLeadDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [seniority, setSeniority] = useState<string>("");
  const [stage, setStage] = useState("Prospecto");
  const [headcount, setHeadcount] = useState(1);
  const [urgency, setUrgency] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [budgetMonthly, setBudgetMonthly] = useState<{ min: number; max: number } | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!chat || !open) return;

    const display = chatDisplayName(chat);
    // Si el "display name" es un número de teléfono (con o sin +), dejar el input vacío
    // para forzar al usuario a poner el nombre real, no el JID.
    const isPhone = /^\+?\d{7,}$/.test(display.replace(/\s/g, ""));
    setName(isPhone ? "" : display);
    setEmail("");
    setPhone(`+${jidToPhone(chat.jid)}`);
    setCompany("");
    setRole("");
    setJobDescription("");
    setSeniority("");
    setStage("Prospecto");
    setHeadcount(1);
    setUrgency("");
    setNotes("");
    setNextAction("");
    setFollowUpDate("");
    setBudgetMonthly(null);
    setStack([]);
    setExtracted(null);

    const ctrl = new AbortController();
    setExtracting(true);
    fetch("/api/whatsapp/extract-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatJid: chat.jid, declaredStage: "Prospecto" }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Extracted | null) => {
        if (!d || ctrl.signal.aborted) return;
        setExtracted(d);
        if (d.name) setName(d.name);
        if (d.email) setEmail(d.email);
        if (d.company) setCompany(d.company);
        if (d.role) setRole(d.role);
        if (d.jobDescription) setJobDescription(d.jobDescription);
        if (d.seniority) setSeniority(d.seniority);
        if (d.stage) setStage(d.stage);
        if (d.headcount && d.headcount > 0) setHeadcount(d.headcount);
        if (d.urgency) setUrgency(d.urgency);
        if (d.notes) setNotes(d.notes);
        if (d.stack && d.stack.length) setStack(d.stack);
        if (d.estimatedMonthly) setBudgetMonthly({ min: d.estimatedMonthly.min, max: d.estimatedMonthly.max });
        if (d.nextStep) setNextAction(d.nextStep);
        if (d.followUpDate) setFollowUpDate(d.followUpDate);
      })
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!ctrl.signal.aborted) setExtracting(false); });

    return () => {
      ctrl.abort();
      // El abort saltaba el finally condicional y extracting quedaba en true
      // (auditoría 2026-06-09)
      setExtracting(false);
    };
  }, [chat, open]);

  useEffect(() => {
    if (!role || !open) return;
    const ctrl = new AbortController();
    fetch("/api/whatsapp/rate-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, seniority: seniority || null, headcount }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.estimatedMonthly && !ctrl.signal.aborted) {
          setBudgetMonthly({ min: d.estimatedMonthly.min, max: d.estimatedMonthly.max });
        }
      })
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); });
    return () => ctrl.abort();
  }, [role, seniority, headcount, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const valueCents = budgetMonthly ? Math.round(budgetMonthly.max * 100) : null;
      const res = await fetch("/api/whatsapp/save-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          chatJid: chat?.jid,
          company: company.trim() || null,
          role: role.trim() || null,
          seniority: seniority || null,
          stage,
          headcount,
          urgency: urgency || null,
          notes: notes.trim() || null,
          jobDescription: jobDescription.trim() || null,
          nextAction: nextAction.trim() || null,
          followUpDate: followUpDate || null,
          valueCents,
          // Brief de venta IA — persistir todo lo extraído para verlo en la ficha del contacto
          salesIntel: extracted && extracted.mode === "ai"
            ? {
                painPoints: extracted.painPoints ?? [],
                budgetSignal: extracted.budgetSignal ?? null,
                decisionMaker: extracted.decisionMaker ?? null,
                keyObjections: extracted.keyObjections ?? [],
                openQuestions: extracted.openQuestions ?? [],
                responseStrategy: extracted.responseStrategy ?? null,
                salesSignals: extracted.salesSignals ?? { positive: [], negative: [] },
                objectionHandling: extracted.objectionHandling ?? [],
                competitor: extracted.competitor ?? null,
                stageMismatch: extracted.stageMismatch ?? null,
                stack: stack ?? [],
                seniority: seniority || null,
                urgency: urgency || null,
                headcount,
              }
            : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${name.trim()} guardado`, {
        description: `Etapa: ${stage}${budgetMonthly ? ` · $${budgetMonthly.min.toLocaleString()}–${budgetMonthly.max.toLocaleString()} USD/mes` : ""}`,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const hasIntelligence = extracted?.mode === "ai" && !extracting && Boolean(
    (extracted.painPoints?.length ?? 0) > 0 ||
    extracted.budgetSignal ||
    (extracted.keyObjections?.length ?? 0) > 0 ||
    (extracted.openQuestions?.length ?? 0) > 0 ||
    extracted.responseStrategy ||
    (extracted.salesSignals?.positive?.length ?? 0) > 0 ||
    (extracted.salesSignals?.negative?.length ?? 0) > 0 ||
    (extracted.objectionHandling?.length ?? 0) > 0 ||
    extracted.competitor ||
    extracted.stageMismatch
  );

  // Mostrá el panel derecho (con skeleton) desde que arranca extracting para evitar
  // el layout shift de 560px → 1100px cuando llega la respuesta de la IA.
  const showRightPanel = hasIntelligence || extracting;

  // Atajo de teclado: ⌘+Enter para guardar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving && !extracting) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, extracting, name, phone, company, role, seniority, stage, headcount, urgency, notes, nextAction, followUpDate, budgetMonthly]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={`p-0 gap-0 overflow-hidden ${
          showRightPanel
            ? "sm:max-w-[min(1500px,calc(100vw-3rem))] w-[calc(100vw-2rem)] h-[calc(100vh-3rem)]"
            : "sm:max-w-[640px] w-[calc(100vw-2rem)] h-[min(calc(100vh-3rem),820px)]"
        }`}
      >
        <div className={`grid ${showRightPanel ? "grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : "grid-cols-1"} h-full min-h-0`}>

          {/* ─────── LEFT: Form ─────── */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <DialogHeader className="px-7 pt-6 pb-5 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <DialogTitle className="text-xl font-bold tracking-tight">Guardar como lead</DialogTitle>
                  <DialogDescription className="text-[13px]">
                    {extracting
                      ? "Claude está analizando la conversación…"
                      : extracted?.mode === "ai"
                      ? `Auto-rellenado con ${extracted.messageCount} mensajes de WhatsApp`
                      : "Revisá los datos y guardá en el CRM"}
                  </DialogDescription>
                </div>
                {extracting && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 shrink-0">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando
                  </span>
                )}
                {extracted?.mode === "ai" && !extracting && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm shrink-0">
                    <Sparkles className="h-3.5 w-3.5" /> Análisis IA
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
              {/* ── Activity strip ── */}
              {extracted?.activity && <ActivityStrip activity={extracted.activity} />}

              {/* ── SECCIÓN: CONTACTO ── */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta">Contacto</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-name" className="text-[12px] font-medium text-muted-foreground">Nombre</Label>
                    <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del contacto" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-phone" className="text-[12px] font-medium text-muted-foreground">Teléfono</Label>
                    <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email" className="text-[12px] font-medium text-muted-foreground flex items-center justify-between">
                    <span>Email</span>
                    {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && (
                      <a
                        href={`mailto:${email}`}
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                        title="Enviar correo"
                      >
                        Escribir <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </Label>
                  <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" className="h-10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-company" className="text-[12px] font-medium text-muted-foreground flex items-center justify-between">
                      <span>Empresa</span>
                      {company.trim().length >= 2 && (
                        <a
                          href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                          title="Buscar en LinkedIn"
                        >
                          LinkedIn <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </Label>
                    <Input id="lead-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Empresa del prospecto" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-stage" className="text-[12px] font-medium text-muted-foreground">Etapa</Label>
                    <select id="lead-stage" value={stage} onChange={(e) => setStage(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40">
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* ── SECCIÓN: BÚSQUEDA ── */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta">Búsqueda</h3>
                <div className="grid grid-cols-[1fr_120px_90px] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-role" className="text-[12px] font-medium text-muted-foreground">Rol que buscan</Label>
                    <Input id="lead-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Dev…" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-seniority" className="text-[12px] font-medium text-muted-foreground">Seniority</Label>
                    <select id="lead-seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40">
                      <option value="">—</option>
                      {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-headcount" className="text-[12px] font-medium text-muted-foreground">Cant.</Label>
                    <Input id="lead-headcount" type="number" min={1} value={headcount}
                      onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value) || 1))} className="h-10" />
                  </div>
                </div>

                {(urgency || stack.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {urgency && (
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-md bg-muted text-foreground font-medium">
                        <span className={`h-1.5 w-1.5 rounded-full ${URGENCY_DOT[urgency] ?? URGENCY_DOT.low}`} />
                        Urgencia {URGENCY_LABELS[urgency] ?? urgency}
                      </span>
                    )}
                    {stack.map((s) => (
                      <span key={s} className="text-[11.5px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Budget hero — premium con barra de rango */}
              {budgetMonthly && (
                <section className="space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta">Presupuesto</h3>
                  <div className="rounded-xl bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-teal-50/40 dark:from-emerald-950/40 dark:via-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-900/60 p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-28 w-28 bg-emerald-400/20 dark:bg-emerald-500/15 rounded-full blur-3xl -translate-y-8 translate-x-8" />
                    <div className="absolute bottom-0 left-0 h-20 w-20 bg-teal-400/15 dark:bg-teal-500/10 rounded-full blur-2xl translate-y-6 -translate-x-4" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center shadow-sm">
                            <DollarSign className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-emerald-800 dark:text-emerald-300">
                            Estimado mensual
                          </span>
                        </div>
                        <span className="text-[9.5px] text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-wider font-semibold">basado en histórico Niuro</span>
                      </div>

                      <div className="flex items-baseline gap-1.5 flex-wrap mb-3">
                        <span className="text-[32px] leading-none font-bold text-emerald-700 dark:text-emerald-200 tabular-nums">
                          ${budgetMonthly.min.toLocaleString()}
                          <span className="text-emerald-500 dark:text-emerald-400 mx-1.5 font-light">–</span>
                          ${budgetMonthly.max.toLocaleString()}
                        </span>
                        <span className="text-[13px] text-emerald-700 dark:text-emerald-400 font-semibold">USD/mes</span>
                      </div>

                      {/* Barra de rango con labels min/max */}
                      <div className="space-y-1.5 mb-2">
                        <div className="h-1.5 rounded-full bg-emerald-200/60 dark:bg-emerald-900/60 overflow-hidden relative">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-300 rounded-full" style={{ width: "100%" }} />
                          {budgetMonthly.min === budgetMonthly.max && (
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-emerald-700 dark:bg-emerald-200 rounded-full" />
                          )}
                        </div>
                        <div className="flex justify-between text-[10px] text-emerald-700/70 dark:text-emerald-400/70 font-semibold tabular-nums">
                          <span>${budgetMonthly.min.toLocaleString()} MIN</span>
                          <span>MAX ${budgetMonthly.max.toLocaleString()}</span>
                        </div>
                      </div>

                      {headcount > 1 && extracted?.estimatedMonthly && (
                        <div className="flex items-center gap-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/60 mt-2">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700/70 dark:text-emerald-400/70">Por persona</span>
                          <span className="text-[12px] text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
                            ${extracted.estimatedMonthly.perPerson.min.toLocaleString()}–${extracted.estimatedMonthly.perPerson.max.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70">× {headcount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* ── SECCIÓN: NOTAS ── */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta">Resumen</h3>
                <Textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  placeholder="Resumen del prospecto…" className="resize-none text-[13px] leading-relaxed" />
              </section>

              {/* ── SECCIÓN: DESCRIPCIÓN DE CARGO ── */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta flex items-center gap-1.5">
                  Descripción de cargo
                  {jobDescription && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 normal-case tracking-normal">
                      <Sparkles className="h-2.5 w-2.5" /> IA
                    </span>
                  )}
                </h3>
                <Textarea
                  id="lead-job-description"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={4}
                  placeholder="Responsabilidades, requisitos técnicos, contexto del equipo…"
                  className="resize-none text-[13px] leading-relaxed"
                />
              </section>

              {/* ── SECCIÓN: SEGUIMIENTO ── */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-meta">Seguimiento</h3>
                <div className="grid grid-cols-[1fr_150px] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-next-action" className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-violet-500" /> Próximo paso
                    </Label>
                    <Input id="lead-next-action" value={nextAction} onChange={(e) => setNextAction(e.target.value)}
                      placeholder="Acción concreta…" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lead-followup" className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-violet-500" /> Follow-up
                    </Label>
                    <Input id="lead-followup" type="date" value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)} className="h-10" />
                  </div>
                </div>
              </section>
            </div>

            <DialogFooter className="px-7 py-4 border-t border-border bg-muted/40 sm:justify-between gap-3 items-center">
              <span className="hidden sm:block text-[11px] text-meta">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-card font-mono text-[10px]">Esc</kbd> cancelar
                <span className="mx-2">·</span>
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-card font-mono text-[10px]">⌘</kbd>
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-card font-mono text-[10px] ml-0.5">⏎</kbd> guardar
              </span>
              <div className="flex gap-2 items-center">
                <Button variant="outline" onClick={onClose} className="cursor-pointer h-11 px-5 gap-2 border-border hover:bg-muted dark:hover:bg-muted">
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || extracting}
                  className="cursor-pointer h-11 px-6 gap-2 bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-md hover:shadow-lg font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                  ) : extracting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Analizando…</>
                  ) : (
                    <><Save className="h-4 w-4" /> Guardar lead</>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>

          {/* ─────── RIGHT: AI Intelligence (skeleton mientras carga) ─────── */}
          {showRightPanel && (
            extracting || !extracted
              ? <IntelSkeleton />
              : <IntelPanel extracted={extracted} />
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
