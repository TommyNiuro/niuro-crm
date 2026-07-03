"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ds";
import { ContactForm } from "./ContactForm";
import { ActivityForm } from "@/components/activities/ActivityForm";
import {
  ArrowLeft, Mail, Phone, Building2, FileText, Clock, Users, Pencil, Trash2,
  Plus, MessageCircle, Copy, Check, ChevronDown, ChevronUp, Sparkles,
  AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, XCircle, Crosshair,
  DollarSign, Shield, Swords, HelpCircle, ArrowRight, Loader2, MoreHorizontal,
  Target, Layers,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeDate, cleanPhoneForWhatsApp, SOURCE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LeadSource } from "@/types";

// Ficha de contacto reformulada como cockpit de venta (2026-07-03): en vez de
// una pila de tarjetas iguales, un header con acciones + una columna de foco
// (qué hacer ahora, brief IA, conversación, timeline) + una barra lateral de
// snapshot (score, valor, contacto, datos IA).

interface OpenTask {
  id: string; title: string; stepName: string | null; dueAt: Date | number | null; status: string;
}
interface ScoreBreakdown { intencion?: number; autoridad?: number; necesidad?: number; urgencia?: number; presupuesto?: number; }

interface SalesIntel {
  painPoints?: string[];
  budgetSignal?: string | null;
  decisionMaker?: boolean | null;
  keyObjections?: string[];
  openQuestions?: string[];
  responseStrategy?: string | null;
  salesSignals?: { positive?: string[]; negative?: string[] };
  objectionHandling?: { objection: string; counterArg: string }[];
  competitor?: { name: string; positioning: string[] } | null;
  stageMismatch?: { declaredStage: string; realStage: string; reason: string } | null;
  stack?: string[];
  seniority?: string | null;
  urgency?: string | null;
  headcount?: number;
  updatedAt?: string;
}

interface ContactDetailClientProps {
  contact: {
    id: string; name: string; email: string | null; phone: string | null; company: string | null;
    source: string; temperature: string; score: number; stage: string; notes: string | null;
    archived: boolean; disqualifyReason: string | null; scoreBreakdown: string | null;
    nextAction: string | null; nextStepDue: Date | number | null; createdAt: number | Date;
    jobDescription: string | null; valueCents: number; probability: number;
    salesIntel: string | null; contactType?: string | null; country?: string | null;
    lastInteractionAt?: number | Date | null;
  };
  openTask: OpenTask | null;
  deals: Array<{ id: string; title: string; value: number; probability: number; stageName: string | null; stageColor: string | null; createdAt: number | Date; }>;
  activities: Array<{ id: string; type: string; description: string; scheduledAt: number | Date | null; completedAt: number | Date | null; createdAt: number | Date; }>;
  whatsapp?: { jid: string | null; messages: Array<{ id: string; content: string | null; mediaType: string | null; isFromMe: boolean; timestamp: string | null; }>; };
}

const DIM: Record<keyof ScoreBreakdown, { label: string; max: number }> = {
  intencion: { label: "Intención", max: 35 }, autoridad: { label: "Autoridad", max: 20 },
  necesidad: { label: "Necesidad", max: 20 }, urgencia: { label: "Urgencia", max: 15 },
  presupuesto: { label: "Presupuesto", max: 10 },
};

const TYPE_LABEL: Record<string, string> = { lead: "Lead", client: "Cliente", engineer: "Ingeniero" };
const TEMP: Record<string, { label: string; cls: string; dot: string }> = {
  hot:  { label: "Caliente", cls: "text-red-600 dark:text-red-400 bg-red-500/12",     dot: "bg-red-500" },
  warm: { label: "Tibio",    cls: "text-amber-600 dark:text-amber-400 bg-amber-500/12", dot: "bg-amber-500" },
  cold: { label: "Frío",     cls: "text-sky-600 dark:text-sky-400 bg-sky-500/12",       dot: "bg-sky-500" },
};

function scoreColor(s: number): string {
  if (s >= 75) return "#10b981";
  if (s >= 50) return "#f59e0b";
  if (s >= 25) return "#f97316";
  return "#ef4444";
}

function relTime(ts: number | Date | string | null | undefined): string {
  if (!ts) return "sin registro";
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return "sin registro";
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "hace <1h";
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d}d`;
  return `hace ${Math.floor(d / 30)}m`;
}

/** Anillo compacto de score (r=15.9 => circunferencia ~100, dasharray directo). */
function ScoreRing({ score }: { score: number }) {
  const c = scoreColor(score);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--muted)" strokeWidth="3.2" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={c} strokeWidth="3.2" strokeLinecap="round"
          strokeDasharray={`${Math.max(0, Math.min(100, score))} 100`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums" style={{ color: c }}>
        {score}
      </span>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</span>
    </div>
  );
}

function SalesBrief({ intel }: { intel: SalesIntel }) {
  const hasSignals = (intel.salesSignals?.positive?.length ?? 0) > 0 || (intel.salesSignals?.negative?.length ?? 0) > 0;
  const hasFacts = !!intel.budgetSignal || intel.decisionMaker != null || !!intel.competitor;
  const hasPains = (intel.painPoints?.length ?? 0) > 0;
  const hasObjections = (intel.objectionHandling?.length ?? 0) > 0 || (intel.keyObjections?.length ?? 0) > 0;
  const hasQuestions = (intel.openQuestions?.length ?? 0) > 0;
  if (!hasSignals && !hasFacts && !hasPains && !hasObjections && !hasQuestions) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </span>
        <h2 className="text-[15px] font-semibold">Brief de venta</h2>
        <span className="text-xs text-muted-foreground">análisis IA de la conversación</span>
      </div>

      {hasSignals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(intel.salesSignals?.positive?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-900/50 bg-emerald-500/[0.04] p-3.5">
              <div className="flex items-center gap-1.5 mb-2"><TrendingUp className="h-3.5 w-3.5 text-emerald-600" /><span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">A favor</span></div>
              <ul className="space-y-1.5">{intel.salesSignals!.positive!.map((s, i) => (<li key={i} className="text-[13px] flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul>
            </div>
          )}
          {(intel.salesSignals?.negative?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-red-200/60 dark:border-red-900/50 bg-red-500/[0.04] p-3.5">
              <div className="flex items-center gap-1.5 mb-2"><TrendingDown className="h-3.5 w-3.5 text-red-600" /><span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">En contra</span></div>
              <ul className="space-y-1.5">{intel.salesSignals!.negative!.map((s, i) => (<li key={i} className="text-[13px] flex gap-2"><XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul>
            </div>
          )}
        </div>
      )}

      {hasPains && (
        <div>
          <SectionLabel icon={Crosshair}>Dolores del prospecto</SectionLabel>
          <div className="space-y-2">{intel.painPoints!.map((p, i) => (<div key={i} className="rounded-lg border px-3.5 py-2.5 flex items-start gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-2 shrink-0" /><p className="text-[13px] leading-relaxed">{p}</p></div>))}</div>
        </div>
      )}

      {hasFacts && (
        <div>
          <SectionLabel icon={DollarSign}>Datos del deal</SectionLabel>
          <div className="rounded-xl border divide-y overflow-hidden">
            {intel.budgetSignal && (
              <div className="px-4 py-3 flex items-start gap-3"><DollarSign className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Presupuesto</p><p className="text-[13px] mt-0.5">{intel.budgetSignal}</p></div></div>
            )}
            {intel.decisionMaker != null && (
              <div className="px-4 py-3 flex items-center gap-3"><Shield className={cn("h-4 w-4 shrink-0", intel.decisionMaker ? "text-emerald-600" : "text-amber-600")} /><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Decisor</p><p className="text-[13px] font-semibold mt-0.5">{intel.decisionMaker ? "Puede contratar" : "No es decisor final"}</p></div></div>
            )}
            {intel.competitor && (
              <div className="px-4 py-3"><div className="flex items-center gap-3"><Swords className="h-4 w-4 text-orange-600 shrink-0" /><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Compite contra</p><p className="text-[13px] font-semibold mt-0.5">{intel.competitor.name}</p></div></div>{(intel.competitor.positioning?.length ?? 0) > 0 && (<ul className="ml-7 mt-2 space-y-1">{intel.competitor.positioning.map((p, i) => (<li key={i} className="text-[12px] text-muted-foreground flex gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" /><span>{p}</span></li>))}</ul>)}</div>
            )}
          </div>
        </div>
      )}

      {hasObjections && (
        <div>
          <SectionLabel icon={Shield}>Objeciones y respuestas</SectionLabel>
          <div className="space-y-2.5">
            {intel.objectionHandling!.map((o, i) => (
              <div key={i} className="rounded-xl border overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-[13px] text-muted-foreground italic">&ldquo;{o.objection}&rdquo;</p>
                <div className="px-4 pb-3 pt-2 bg-violet-500/[0.06] border-t border-violet-200/50 dark:border-violet-900/40 flex items-start gap-2"><ArrowRight className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" /><p className="text-[13px] text-violet-900 dark:text-violet-100 font-medium leading-relaxed">{o.counterArg}</p></div>
              </div>
            ))}
            {(intel.keyObjections?.length ?? 0) > 0 && (intel.objectionHandling?.length ?? 0) === 0 && (
              <div className="rounded-lg border p-3 space-y-1.5">{intel.keyObjections!.map((o, i) => (<p key={i} className="text-[13px] flex gap-2"><span className="text-amber-500 shrink-0">•</span>{o}</p>))}</div>
            )}
          </div>
        </div>
      )}

      {hasQuestions && (
        <div>
          <SectionLabel icon={HelpCircle}>Preguntas pendientes</SectionLabel>
          <div className="space-y-2">{intel.openQuestions!.map((q, i) => (<div key={i} className="rounded-lg border px-3.5 py-2.5 flex items-start gap-2"><HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" /><p className="text-[13px] leading-relaxed">{q}</p></div>))}</div>
        </div>
      )}
    </div>
  );
}

export function ContactDetailClient({ contact, openTask, deals, activities, whatsapp }: ContactDetailClientProps) {
  const router = useRouter();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", date: "" });
  const [savingTask, setSavingTask] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const breakdown: ScoreBreakdown | null = (() => { try { if (!contact.scoreBreakdown) return null; const raw = JSON.parse(contact.scoreBreakdown); return raw?.breakdown ?? raw ?? null; } catch { return null; } })();
  const intel: SalesIntel | null = (() => { try { if (!contact.salesIntel) return null; return JSON.parse(contact.salesIntel) as SalesIntel; } catch { return null; } })();

  const type = contact.contactType ?? "lead";
  const isEngineer = type === "engineer";
  const temp = TEMP[contact.temperature] ?? TEMP.cold;
  const waLinked = !!(whatsapp?.jid || (contact.phone && contact.phone.replace(/\D/g, "").length >= 7));
  const lastMsgTs = whatsapp?.messages.reduce<string | null>((a, m) => (m.timestamp && (!a || m.timestamp > a) ? m.timestamp : a), null);
  const lastInteraction = lastMsgTs ?? contact.lastInteractionAt ?? null;
  const dueDate = openTask?.dueAt ? new Date(openTask.dueAt) : null;
  const taskOverdue = dueDate && dueDate < new Date();
  const dealTotal = contact.valueCents || deals.reduce((a, d) => a + (d.value || 0), 0);

  const handleCopy = async (value: string, field: string) => {
    try { await navigator.clipboard.writeText(value); setCopiedField(field); toast.success("Copiado"); setTimeout(() => setCopiedField(null), 2000); } catch { toast.error("Error al copiar"); }
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    toast.info("Analizando la conversación con IA…", { description: "Puede tardar ~20s" });
    try {
      const res = await fetch(`/api/contacts/${contact.id}/reanalyze`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success("Brief actualizado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al re-analizar");
    } finally { setReanalyzing(false); }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este contacto?")) return;
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Contacto eliminado"); router.push("/contacts");
    } catch { toast.error("Error al eliminar el contacto"); }
  };

  const handleConvertToClient = async () => {
    if (!confirm("¿Convertir este lead en cliente? Arranca en Onboarding del pipeline post-venta.")) return;
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactType: "client" }) });
      if (!res.ok) throw new Error();
      toast.success("Convertido en cliente"); router.refresh();
    } catch { toast.error("No se pudo convertir el contacto"); }
  };

  const handleCompleteTask = async () => {
    if (!openTask) return;
    setCompletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${openTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) });
      if (!res.ok) throw new Error();
      toast.success("Tarea completada"); router.refresh();
    } catch { toast.error("Error al completar la tarea"); } finally { setCompletingTask(false); }
  };

  const handleSnoozeTask = async () => {
    if (!openTask) return;
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
    try {
      const res = await fetch(`/api/tasks/${openTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueAt: d.toISOString() }) });
      if (!res.ok) throw new Error();
      toast.success("Pospuesta para mañana a las 10:00"); router.refresh();
    } catch { toast.error("No se pudo posponer"); }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    setSavingTask(true);
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: contact.id, title: newTask.title.trim(), dueAt: newTask.date ? `${newTask.date}T10:00:00` : null }) });
      if (!res.ok) throw new Error();
      toast.success("Tarea creada"); setNewTask({ title: "", date: "" }); setAddingTask(false); router.refresh();
    } catch { toast.error("No se pudo crear la tarea"); } finally { setSavingTask(false); }
  };

  return (
   <div className="h-full overflow-y-auto fade-in">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
      {/* Header cockpit */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3 bg-background/90 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Volver" className="p-1.5 rounded-lg hover:bg-muted cursor-pointer shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar name={contact.name} size={40} country={contact.country ?? undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate leading-tight">{contact.name}</h1>
              <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5 inline-flex items-center gap-1", temp.cls)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", temp.dot)} />{temp.label}
              </span>
              <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground">{TYPE_LABEL[type] ?? type}</span>
            </div>
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">
              {contact.company ? `${contact.company} · ` : ""}{contact.stage}
              {" · "}última interacción {relTime(lastInteraction)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {whatsapp?.jid && (
              <Link href={`/whatsapp?chat=${encodeURIComponent(whatsapp.jid)}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-lg px-3 py-2 cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700">
                <MessageCircle className="h-4 w-4" /> Mensaje
              </Link>
            )}
            {waLinked && (
              <button onClick={handleReanalyze} disabled={reanalyzing} aria-busy={reanalyzing}
                title="Re-analizar la conversación con IA"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-lg px-3 py-2 cursor-pointer border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-60">
                {reanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="hidden sm:inline">{reanalyzing ? "Analizando…" : "Re-analizar"}</span>
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="Más acciones" aria-expanded={menuOpen}
                className="p-2 rounded-lg border border-border hover:bg-muted cursor-pointer">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-30 py-1">
                  {type === "lead" && !contact.archived && (
                    <button onClick={() => { setMenuOpen(false); handleConvertToClient(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Convertir en cliente
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(false); setShowEditForm(true); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2">
                    <Pencil className="h-4 w-4" /> Editar
                  </button>
                  <button onClick={() => { setMenuOpen(false); handleDelete(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive cursor-pointer flex items-center gap-2">
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-5 min-w-0">
          {/* Foco ahora */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {intel?.stageMismatch && (
              <div className="px-5 py-3 bg-amber-500/[0.08] border-b border-amber-200/50 dark:border-amber-900/40 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-900 dark:text-amber-100 leading-relaxed">
                  Ojo: la etapa real es <span className="font-semibold underline decoration-amber-400 underline-offset-2">{intel.stageMismatch.realStage}</span>, no {intel.stageMismatch.declaredStage}. {intel.stageMismatch.reason}
                </p>
              </div>
            )}
            <div className="p-5">
              <SectionLabel icon={Target}>Foco ahora</SectionLabel>
              {openTask ? (
                <div className="flex items-start gap-3">
                  <button onClick={handleCompleteTask} disabled={completingTask} aria-label={`Completar: ${openTask.title}`}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-500 cursor-pointer disabled:opacity-50">
                    {completingTask ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{openTask.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[12px]">
                      <span className={cn("inline-flex items-center gap-1", taskOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                        <Clock className="h-3.5 w-3.5" />{dueDate ? formatDate(openTask.dueAt!) : "sin fecha"}{taskOverdue ? " · vencida" : ""}
                      </span>
                      <button onClick={handleSnoozeTask} className="text-muted-foreground hover:text-foreground cursor-pointer">posponer</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-muted-foreground">Sin próximo paso definido.</p>
                  <button onClick={() => setAddingTask(true)} className="text-[13px] font-medium text-primary hover:underline cursor-pointer shrink-0">+ Crear tarea</button>
                </div>
              )}

              {intel?.responseStrategy && (
                <div className="mt-4 rounded-xl bg-violet-500/[0.06] border border-violet-200/50 dark:border-violet-900/40 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <MessageCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Cómo encararlo</span>
                  </div>
                  <p className="text-[13.5px] text-violet-950 dark:text-violet-50 leading-relaxed">{intel.responseStrategy}</p>
                </div>
              )}

              {addingTask && (
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                  <input autoFocus value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Qué hay que hacer…"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                    className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" aria-label="Título de la tarea" />
                  <input type="date" value={newTask.date} onChange={(e) => setNewTask({ ...newTask, date: e.target.value })}
                    className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" aria-label="Fecha" />
                  <button onClick={handleAddTask} disabled={savingTask || !newTask.title.trim()}
                    className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium cursor-pointer hover:bg-primary-hover disabled:opacity-50">
                    {savingTask ? "…" : "Crear"}
                  </button>
                </div>
              )}

              {contact.disqualifyReason && (
                <p className="mt-3 text-[12px] text-warning flex items-start gap-1.5"><XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{contact.disqualifyReason}</p>
              )}
            </div>
          </div>

          {intel && <SalesBrief intel={intel} />}

          {/* Conversación */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-[15px] font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600" /> Conversación</h2>
              {whatsapp?.jid && (
                <Link href={`/whatsapp?chat=${encodeURIComponent(whatsapp.jid)}`} className="text-[12px] text-primary hover:underline">Abrir chat completo</Link>
              )}
            </div>
            <div className="p-4">
              {!whatsapp?.jid ? <p className="text-sm text-muted-foreground py-4 text-center">Sin WhatsApp vinculado.</p>
                : whatsapp.messages.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No hay mensajes recientes.</p>
                : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto px-1">
                    {whatsapp.messages.map((m) => {
                      const body = m.content?.trim() || (m.mediaType ? `[${m.mediaType}]` : "");
                      return (
                        <div key={m.id} className={cn("flex", m.isFromMe ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[78%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug", m.isFromMe ? "bg-emerald-600 text-white rounded-br-md" : "bg-muted rounded-bl-md")}>
                            {body || <span className="opacity-60">(sin texto)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-[15px] font-semibold">Actividad</h2>
              <button onClick={() => setShowActivityForm(true)} className="text-[12px] text-primary hover:underline cursor-pointer inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Registrar</button>
            </div>
            <div className="p-5">
              {activities.length === 0 ? <p className="text-sm text-muted-foreground">Sin actividad registrada.</p> : (
                <div className="relative pl-5">
                  <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border" />
                  <div className="space-y-4">
                    {activities.map((a) => {
                      const ai = a.description.startsWith("Tarea IA") || a.description.startsWith("Observación IA");
                      return (
                        <div key={a.id} className="relative">
                          <span className={cn("absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-background", ai ? "bg-violet-500" : "bg-muted-foreground/40")} />
                          <p className="text-[13px] leading-relaxed">{a.description}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{formatRelativeDate(a.createdAt)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5 min-w-0">
          {/* Snapshot */}
          {!isEngineer && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <ScoreRing score={contact.score} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Score de venta</p>
                  <p className="text-[13px] mt-0.5">{contact.score}/100 · {SOURCE_LABELS[contact.source as LeadSource] || contact.source}</p>
                </div>
                {breakdown && (
                  <button onClick={() => setShowBreakdown((o) => !o)} aria-expanded={showBreakdown}
                    className="ml-auto text-[11px] text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-0.5 shrink-0">
                    {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} desglose
                  </button>
                )}
              </div>
              {showBreakdown && breakdown && (
                <div className="mt-4 space-y-2">
                  {(Object.keys(DIM) as (keyof ScoreBreakdown)[]).map((k) => {
                    const val = breakdown[k] ?? 0; const { label, max } = DIM[k];
                    return (
                      <div key={k}>
                        <div className="flex items-center justify-between text-[11px] mb-0.5"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{val}/{max}</span></div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${max ? (val / max) * 100 : 0}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Valor / Deals */}
          {!isEngineer && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-baseline justify-between">
                <SectionLabel icon={DollarSign}>Valor</SectionLabel>
                <span className="text-[11px] text-muted-foreground">{contact.probability}% prob.</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-emerald-500">{dealTotal ? formatCurrency(dealTotal) : "Sin monto"}</p>
              {deals.length > 0 && (
                <div className="mt-3 space-y-2">
                  {deals.map((d) => (
                    <button key={d.id} onClick={() => router.push(`/deals/${d.id}`)}
                      className="w-full text-left p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <p className="text-[13px] font-medium truncate">{d.title}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[12px] font-semibold text-emerald-500 tabular-nums">{formatCurrency(d.value)}</span>
                        {d.stageName && <span className="text-[10.5px] font-medium rounded-full px-1.5 py-0.5" style={{ background: (d.stageColor || "#64748b") + "22", color: d.stageColor || undefined }}>{d.stageName}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contacto */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel icon={Users}>Contacto</SectionLabel>
            <div className="space-y-2.5">
              {contact.phone && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{contact.phone}</span>
                  <a href={`https://wa.me/${cleanPhoneForWhatsApp(contact.phone)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted cursor-pointer" title="WhatsApp" aria-label="Abrir WhatsApp"><MessageCircle className="h-3.5 w-3.5 text-emerald-600" /></a>
                  <button onClick={() => handleCopy(contact.phone!, "phone")} aria-label="Copiar teléfono" className="p-1 rounded hover:bg-muted cursor-pointer">{copiedField === "phone" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline flex-1 truncate">{contact.email}</a>
                  <button onClick={() => handleCopy(contact.email!, "email")} aria-label="Copiar email" className="p-1 rounded hover:bg-muted cursor-pointer">{copiedField === "email" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}</button>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-2 text-[13px]"><Building2 className="h-4 w-4 text-muted-foreground shrink-0" /><span className="truncate">{contact.company}</span></div>
              )}
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Clock className="h-4 w-4 shrink-0" /><span>Creado {formatDate(contact.createdAt)}</span></div>
            </div>
          </div>

          {/* Datos IA rápidos */}
          {intel && ((intel.stack?.length ?? 0) > 0 || intel.seniority || intel.urgency || intel.headcount) && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel icon={Layers}>Datos de la búsqueda</SectionLabel>
              <div className="space-y-2.5 text-[13px]">
                {(intel.stack?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">{intel.stack!.map((s, i) => (<span key={i} className="text-[11px] font-medium rounded-md px-2 py-0.5 bg-muted text-foreground">{s}</span>))}</div>
                )}
                {intel.seniority && <div className="flex justify-between"><span className="text-muted-foreground">Seniority</span><span className="font-medium">{intel.seniority}</span></div>}
                {intel.headcount != null && intel.headcount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Headcount</span><span className="font-medium">{intel.headcount}</span></div>}
                {intel.urgency && <div className="flex justify-between"><span className="text-muted-foreground">Urgencia</span><span className="font-medium capitalize">{intel.urgency}</span></div>}
              </div>
            </div>
          )}

          {/* Notas */}
          {(contact.notes || contact.jobDescription) && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel icon={FileText}>Notas</SectionLabel>
              {contact.notes && <p className="text-[13px] text-muted-foreground leading-relaxed">{contact.notes}</p>}
              {contact.jobDescription && (
                <div className={cn(contact.notes && "mt-3 pt-3 border-t")}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">Descripción de cargo</p>
                  <p className="text-[13px] leading-relaxed">{contact.jobDescription}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ContactForm open={showEditForm} onClose={() => { setShowEditForm(false); router.refresh(); }}
        initialData={{ id: contact.id, name: contact.name, email: contact.email || "", phone: contact.phone || "", company: contact.company || "", source: contact.source, temperature: contact.temperature as "cold" | "warm" | "hot", notes: contact.notes || "" }} />
      <ActivityForm open={showActivityForm} onClose={() => { setShowActivityForm(false); router.refresh(); }} preselectedContactId={contact.id} />
    </div>
   </div>
  );
}
