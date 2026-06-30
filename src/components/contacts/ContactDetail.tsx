"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ContactForm } from "./ContactForm";
import { ActivityForm } from "@/components/activities/ActivityForm";
import {
  ArrowLeft, Mail, Phone, Building2, Calendar, FileText,
  Clock, Users, Pencil, Trash2, Plus, MessageCircle, Copy, Check,
  ChevronDown, ChevronUp, Sparkles, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, Crosshair, DollarSign, Shield, Swords, HelpCircle,
  ArrowRight, Loader2,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeDate, cleanPhoneForWhatsApp } from "@/lib/constants";
import { ACTIVITY_TYPE_CONFIG, SOURCE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Temperature, ActivityType, LeadSource } from "@/types";

const activityIcons: Record<string, typeof Phone> = {
  call: Phone, email: Mail, meeting: Users, note: FileText, follow_up: Clock,
};

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
    salesIntel: string | null;
  };
  openTask: OpenTask | null;
  deals: Array<{ id: string; title: string; value: number; probability: number; stageName: string | null; stageColor: string | null; createdAt: number | Date; }>;
  activities: Array<{ id: string; type: string; description: string; scheduledAt: number | Date | null; completedAt: number | Date | null; createdAt: number | Date; }>;
  whatsapp?: { jid: string | null; messages: Array<{ id: string; content: string | null; mediaType: string | null; isFromMe: boolean; timestamp: string | null; }>; };
}

const DIM: Record<keyof ScoreBreakdown, { label: string; max: number }> = {
  intencion: { label: "Intencion", max: 35 }, autoridad: { label: "Autoridad", max: 20 },
  necesidad: { label: "Necesidad", max: 20 }, urgencia: { label: "Urgencia", max: 15 },
  presupuesto: { label: "Presupuesto", max: 10 },
};

function SalesBrief({ intel }: { intel: SalesIntel }) {
  const hasSignals = (intel.salesSignals?.positive?.length ?? 0) > 0 || (intel.salesSignals?.negative?.length ?? 0) > 0;
  const hasFacts = !!intel.budgetSignal || intel.decisionMaker != null || !!intel.competitor;
  const hasPains = (intel.painPoints?.length ?? 0) > 0;
  const hasObjections = (intel.objectionHandling?.length ?? 0) > 0 || (intel.keyObjections?.length ?? 0) > 0;
  const hasQuestions = (intel.openQuestions?.length ?? 0) > 0;
  const anything = hasSignals || hasFacts || hasPains || hasObjections || hasQuestions || intel.responseStrategy || intel.stageMismatch;
  if (!anything) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          Brief de venta
          <span className="text-xs font-normal text-muted-foreground">· Análisis IA de la conversación</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stage mismatch */}
        {intel.stageMismatch && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                La etapa real es <span className="underline decoration-amber-400 underline-offset-2">{intel.stageMismatch.realStage}</span>
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1 leading-relaxed">{intel.stageMismatch.reason}</p>
            </div>
          </div>
        )}

        {/* Cómo responder */}
        {intel.responseStrategy && (
          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Cómo responder ahora</span>
            </div>
            <p className="text-sm text-violet-950 dark:text-violet-50 leading-relaxed">{intel.responseStrategy}</p>
          </div>
        )}

        {/* Signals 2-col */}
        {hasSignals && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(intel.salesSignals?.positive?.length ?? 0) > 0 && (
              <div className="rounded-xl border p-3.5">
                <div className="flex items-center gap-1.5 mb-2"><TrendingUp className="h-3.5 w-3.5 text-emerald-600" /><span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">A favor</span></div>
                <ul className="space-y-1.5">{intel.salesSignals!.positive!.map((s, i) => (<li key={i} className="text-[13px] flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul>
              </div>
            )}
            {(intel.salesSignals?.negative?.length ?? 0) > 0 && (
              <div className="rounded-xl border p-3.5">
                <div className="flex items-center gap-1.5 mb-2"><TrendingDown className="h-3.5 w-3.5 text-red-600" /><span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">En contra</span></div>
                <ul className="space-y-1.5">{intel.salesSignals!.negative!.map((s, i) => (<li key={i} className="text-[13px] flex gap-2"><XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul>
              </div>
            )}
          </div>
        )}

        {/* Pains */}
        {hasPains && (
          <div>
            <div className="flex items-center gap-2 mb-2"><Crosshair className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dolores del prospecto</span></div>
            <div className="space-y-2">{intel.painPoints!.map((p, i) => (<div key={i} className="rounded-lg border px-3.5 py-2.5 flex items-start gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-2 shrink-0" /><p className="text-[13px] leading-relaxed">{p}</p></div>))}</div>
          </div>
        )}

        {/* Facts */}
        {hasFacts && (
          <div>
            <div className="mb-2"><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Datos del deal</span></div>
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

        {/* Objections */}
        {hasObjections && (
          <div>
            <div className="flex items-center gap-2 mb-2"><Shield className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Objeciones &amp; respuestas</span></div>
            <div className="space-y-2.5">
              {intel.objectionHandling!.map((o, i) => (
                <div key={i} className="rounded-xl border overflow-hidden">
                  <p className="px-4 pt-3 pb-2 text-[13px] text-muted-foreground italic">&ldquo;{o.objection}&rdquo;</p>
                  <div className="px-4 pb-3 pt-2 bg-violet-50/60 dark:bg-violet-950/30 border-t border-violet-100 dark:border-violet-900/40 flex items-start gap-2"><ArrowRight className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" /><p className="text-[13px] text-violet-900 dark:text-violet-100 font-medium leading-relaxed">{o.counterArg}</p></div>
                </div>
              ))}
              {(intel.keyObjections?.length ?? 0) > 0 && (intel.objectionHandling?.length ?? 0) === 0 && (
                <div className="rounded-lg border p-3 space-y-1.5">{intel.keyObjections!.map((o, i) => (<p key={i} className="text-[13px] flex gap-2"><span className="text-amber-500 shrink-0">•</span>{o}</p>))}</div>
              )}
            </div>
          </div>
        )}

        {/* Open questions */}
        {hasQuestions && (
          <div>
            <div className="flex items-center gap-2 mb-2"><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preguntas pendientes</span></div>
            <div className="space-y-2">{intel.openQuestions!.map((q, i) => (<div key={i} className="rounded-lg border px-3.5 py-2.5"><p className="text-[13px] leading-relaxed">{q}</p></div>))}</div>
          </div>
        )}
      </CardContent>
    </Card>
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

  const breakdown: ScoreBreakdown | null = (() => { try { if (!contact.scoreBreakdown) return null; const raw = JSON.parse(contact.scoreBreakdown); return raw?.breakdown ?? raw ?? null; } catch { return null; } })();

  const intel: SalesIntel | null = (() => { try { if (!contact.salesIntel) return null; return JSON.parse(contact.salesIntel) as SalesIntel; } catch { return null; } })();

  const handleCopy = async (value: string, field: string) => {
    try { await navigator.clipboard.writeText(value); setCopiedField(field); toast.success("Copiado"); setTimeout(() => setCopiedField(null), 2000); } catch { toast.error("Error al copiar"); }
  };

  const waLinked = !!(whatsapp?.jid || (contact.phone && contact.phone.replace(/\D/g, "").length >= 7));

  const handleReanalyze = async () => {
    setReanalyzing(true);
    toast.info("Analizando la conversación con IA…", { description: "Puede tardar ~20s" });
    try {
      const res = await fetch(`/api/contacts/${contact.id}/reanalyze`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success("Brief actualizado", { description: "Se refrescó el análisis y los datos del deal." });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al re-analizar");
    } finally {
      setReanalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Estas seguro de eliminar este contacto?")) return;
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Contacto eliminado"); router.push("/contacts");
    } catch { toast.error("Error al eliminar el contacto"); }
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

  const handleCompleteActivity = async (activityId: string) => {
    try {
      const res = await fetch(`/api/activities/${activityId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completedAt: new Date().toISOString() }) });
      if (!res.ok) throw new Error();
      toast.success("Actividad completada"); router.refresh();
    } catch { toast.error("Error al completar la actividad"); }
  };

  const dueDate = openTask?.dueAt ? new Date(openTask.dueAt) : null;
  const taskOverdue = dueDate && dueDate < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/contacts")} className="cursor-pointer" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{contact.name}</h1>
            <StatusBadge temperature={contact.temperature as Temperature} />
          </div>
          {/* Score con desglose inline */}
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">
              Score: <span className="font-semibold text-foreground">{contact.score}/100</span>
              {" · "}{SOURCE_LABELS[contact.source as LeadSource] || contact.source}
              {" · "}{contact.stage}
            </p>
            {breakdown && (
              <button
                onClick={() => setShowBreakdown(o => !o)}
                aria-expanded={showBreakdown}
                aria-label={showBreakdown ? "Ocultar desglose de score" : "Ver desglose de score"}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                desglose
              </button>
            )}
          </div>
          {showBreakdown && breakdown && (
            <div className="mt-2 flex flex-wrap gap-3">
              {(Object.keys(DIM) as (keyof ScoreBreakdown)[]).map(k => {
                const val = breakdown[k] ?? 0;
                const { label, max } = DIM[k];
                return (
                  <div key={k} className="text-xs text-muted-foreground">
                    {label}: <span className="text-foreground font-medium">{val}/{max}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Proximo paso */}
          {openTask && (
            <div className={cn("mt-2 flex items-center gap-2 text-sm", taskOverdue ? "text-destructive" : "text-muted-foreground")}>
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Proximo: <span className="font-medium text-foreground">{openTask.title}</span>{dueDate && <span> · {formatDate(openTask.dueAt!)}</span>}</span>
              <button
                onClick={handleCompleteTask}
                disabled={completingTask}
                aria-label={completingTask ? "Completando tarea..." : `Completar tarea: ${openTask.title}`}
                aria-busy={completingTask}
                className="ml-1 text-xs text-primary hover:underline cursor-pointer disabled:opacity-50"
              >
                {completingTask ? "..." : "Completar"}
              </button>
            </div>
          )}
          {/* Razon de descarte */}
          {contact.disqualifyReason && (
            <p className="mt-1 text-xs text-warning">{contact.disqualifyReason}</p>
          )}
        </div>
        <div className="flex gap-2">
          {waLinked && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzing}
              aria-busy={reanalyzing}
              className="cursor-pointer gap-1.5 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"
              title="Re-analizar la conversación con IA y refrescar el brief + datos"
            >
              {reanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {reanalyzing ? "Analizando…" : "Re-analizar"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)} className="cursor-pointer">
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="cursor-pointer text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Informacion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline flex-1 truncate">{contact.email}</a>
                <button onClick={() => handleCopy(contact.email!, "email")} aria-label="Copiar email" className="p-1 rounded hover:bg-muted cursor-pointer">
                  {copiedField === "email" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{contact.phone}</span>
                <div className="flex items-center gap-1">
                  <a href={`https://wa.me/${cleanPhoneForWhatsApp(contact.phone)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-primary/10 cursor-pointer" title="Abrir WhatsApp" aria-label="Abrir WhatsApp">
                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                  </a>
                  {whatsapp?.jid && (
                    <Link href={`/whatsapp?chat=${encodeURIComponent(whatsapp.jid)}`} className="p-1 rounded hover:bg-muted cursor-pointer" title="Abrir en Conversaciones" aria-label="Abrir en Conversaciones">
                      <MessageCircle className="h-3.5 w-3.5 text-primary" />
                    </Link>
                  )}
                  <button onClick={() => handleCopy(contact.phone!, "phone")} aria-label="Copiar teléfono" className="p-1 rounded hover:bg-muted cursor-pointer">
                    {copiedField === "phone" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" /><span>{contact.company}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" /><span>Creado {formatDate(contact.createdAt)}</span>
            </div>
            {contact.notes && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground">{contact.notes}</p></div>}
            {contact.jobDescription && <div className="pt-2 border-t"><p className="text-xs font-medium text-muted-foreground mb-1">Descripcion de cargo</p><p className="text-sm">{contact.jobDescription}</p></div>}
          </CardContent>
        </Card>

        {/* Deals */}
        <Card>
          <CardHeader><CardTitle className="text-base">Deals ({deals.length})</CardTitle></CardHeader>
          <CardContent>
            {deals.length === 0 ? <p className="text-sm text-muted-foreground">Sin deals</p> : (
              <div className="space-y-3">
                {deals.map(deal => (
                  <div key={deal.id} className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/deals/${deal.id}`)}>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-primary">{formatCurrency(deal.value)}</span>
                      <Badge variant="outline" style={{ borderColor: deal.stageColor || undefined, color: deal.stageColor || undefined }}>{deal.stageName}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actividades */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Actividades ({activities.length})</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowActivityForm(true)} className="cursor-pointer">
              <Plus className="h-4 w-4 mr-1" />Registrar
            </Button>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? <p className="text-sm text-muted-foreground">Sin actividades.</p> : (
              <div className="space-y-4">
                {activities.map(activity => {
                  const Icon = activityIcons[activity.type] || FileText;
                  const config = ACTIVITY_TYPE_CONFIG[activity.type as ActivityType];
                  const isPending = !activity.completedAt && activity.scheduledAt;
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="rounded-full bg-muted p-2 h-fit shrink-0"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{config?.label || activity.type}</Badge>
                          {isPending && <Badge variant="outline" className="text-xs text-orange-600 border-orange-600 cursor-pointer" onClick={() => handleCompleteActivity(activity.id)}>Completar</Badge>}
                        </div>
                        <p className="text-sm mt-1">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeDate(activity.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Brief de venta IA */}
      {intel && <SalesBrief intel={intel} />}

      {/* WhatsApp */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-600" />Conversacion de WhatsApp
          </CardTitle>
          {whatsapp?.jid && (
            <Link href={`/whatsapp?chat=${encodeURIComponent(whatsapp.jid)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
              Abrir conversacion
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {!whatsapp?.jid ? <p className="text-sm text-muted-foreground">Sin telefono de WhatsApp vinculado.</p>
            : whatsapp.messages.length === 0 ? <p className="text-sm text-muted-foreground">No hay mensajes recientes.</p>
            : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {whatsapp.messages.map(m => {
                  const body = m.content?.trim() || (m.mediaType ? `[${m.mediaType}]` : "");
                  return (
                    <div key={m.id} className={cn("flex", m.isFromMe ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.isFromMe ? "bg-emerald-600 text-white rounded-br-md" : "bg-muted rounded-bl-md")}>
                        {body || <span className="opacity-60">(sin texto)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      <ContactForm open={showEditForm} onClose={() => { setShowEditForm(false); router.refresh(); }}
        initialData={{ id: contact.id, name: contact.name, email: contact.email || "", phone: contact.phone || "", company: contact.company || "", source: contact.source, temperature: contact.temperature as "cold" | "warm" | "hot", notes: contact.notes || "" }} />
      <ActivityForm open={showActivityForm} onClose={() => { setShowActivityForm(false); router.refresh(); }} preselectedContactId={contact.id} />
    </div>
  );
}
