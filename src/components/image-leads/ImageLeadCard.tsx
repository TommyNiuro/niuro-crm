"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2, Check, X, Trash2, Sparkles, ExternalLink, Mail, Link2, Pencil, ArrowRight, Building2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ImageLead {
  id: string;
  status: "analyzing" | "ready" | "approved" | "dismissed";
  score: number;
  company: string | null;
  whatTheyDo: string | null;
  role: string | null;
  stack: string[];
  seniority: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
  contactInfo: string | null;
  summary: string | null;
  notes: string | null;
  isLead: boolean | null;
  contactId: string | null;
  createdAt: number;
  updatedAt: number;
}

// Score → color: mismo criterio que el Radar (rojo actuar, ámbar vale la pena, gris tibio).
function scoreAccent(score: number): string {
  return score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#94a3b8";
}

export function ImageLeadCard({
  lead,
  onChange,
}: {
  lead: ImageLead;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    company: lead.company || "",
    role: lead.role || "",
    contactEmail: lead.contactEmail || "",
    notes: lead.notes || "",
  });

  const analyzing = lead.status === "analyzing";
  const approved = lead.status === "approved";
  const accent = scoreAccent(lead.score);

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/image-leads/${lead.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: form.company,
          role: form.role,
          contactEmail: form.contactEmail,
          notes: form.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo aprobar");
      toast.success(`${form.company || "Lead"} agregado como contacto en Prospecto`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setBusy(false);
    }
  };

  const act = async (kind: "dismiss" | "delete") => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/image-leads/${lead.id}${kind === "dismiss" ? "/dismiss" : ""}`,
        { method: kind === "dismiss" ? "POST" : "DELETE" }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      toast.success(kind === "dismiss" ? "Captura descartada" : "Captura eliminada");
      onChange();
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border/80">
      <div className="flex flex-col sm:flex-row">
        {/* Thumbnail de la captura */}
        <a
          href={`/api/image-leads/${lead.id}/image`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block sm:w-[180px] shrink-0 bg-surface-2 group"
          title="Ver captura completa"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/image-leads/${lead.id}/image`}
            alt={lead.company || "Captura subida"}
            className="h-[140px] sm:h-full w-full object-cover object-top"
          />
          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-90" />
          </span>
        </a>

        {/* Cuerpo */}
        <div className="flex-1 min-w-0 p-4 space-y-3">
          {analyzing ? (
            <div className="flex items-center gap-2 text-sm text-violet-400 py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analizando la captura con IA...
            </div>
          ) : (
            <>
              {/* Header: empresa + score */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold leading-tight truncate flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      {lead.company || "Empresa sin identificar"}
                    </h3>
                    {lead.isLead === true && (
                      <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 shrink-0">
                        Cliente potencial
                      </span>
                    )}
                    {lead.isLead === false && (
                      <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-surface-3 text-muted-foreground shrink-0">
                        Poco probable
                      </span>
                    )}
                  </div>
                  {lead.whatTheyDo && (
                    <p className="text-[12.5px] text-muted-foreground mt-1 leading-snug">{lead.whatTheyDo}</p>
                  )}
                </div>
                <div
                  className="rounded-xl px-2.5 py-1.5 text-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
                  title="Score de cliente potencial (IA)"
                >
                  <div className="text-[17px] font-bold tabular-nums leading-none" style={{ color: accent }}>{lead.score}</div>
                  <div className="text-[8.5px] uppercase tracking-wider mt-0.5" style={{ color: accent, opacity: 0.75 }}>score</div>
                </div>
              </div>

              {/* Chips: rol + seniority + stack */}
              {(lead.role || lead.seniority || lead.stack.length > 0) && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {lead.role && (
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 font-medium text-foreground/80 border border-border/60">{lead.role}</span>
                  )}
                  {lead.seniority && (
                    <span className="rounded-md bg-violet-500/10 text-violet-400 px-2 py-0.5 font-medium">{lead.seniority}</span>
                  )}
                  {lead.stack.slice(0, 6).map((s) => (
                    <span key={s} className="rounded-md bg-surface-2 px-2 py-0.5 font-medium text-foreground/70 border border-border/60">{s}</span>
                  ))}
                </div>
              )}

              {/* Contacto detectado */}
              {(lead.contactEmail || lead.contactUrl) && (
                <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
                  {lead.contactEmail && (
                    <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.contactEmail}</span>
                  )}
                  {lead.contactUrl && (
                    <span className="flex items-center gap-1.5 truncate max-w-[240px]"><Link2 className="h-3.5 w-3.5 shrink-0" />{lead.contactUrl}</span>
                  )}
                </div>
              )}

              {/* Resumen IA */}
              {lead.summary && (
                <div className="rounded-xl bg-violet-500/8 border border-violet-500/20 px-3 py-2 text-[12.5px] leading-snug flex gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
                  <span>{lead.summary}</span>
                </div>
              )}

              {approved ? (
                <div className="flex items-center gap-2 pt-1 text-[13px] text-emerald-400 font-medium">
                  <Check className="h-4 w-4" /> Aprobado como contacto
                  {lead.contactId && (
                    <Link
                      href={`/contacts/${lead.contactId}`}
                      className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Ver ficha <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  {/* Editor de datos antes de aprobar */}
                  {editing && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-surface-2/60 p-3">
                      <label className="text-[11px] font-medium text-muted-foreground space-y-1">
                        Empresa
                        <input
                          value={form.company}
                          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                          className="w-full bg-background rounded-md px-2 py-1.5 text-[12.5px] text-foreground border border-border focus:border-primary outline-none"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-muted-foreground space-y-1">
                        Rol potencial
                        <input
                          value={form.role}
                          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                          className="w-full bg-background rounded-md px-2 py-1.5 text-[12.5px] text-foreground border border-border focus:border-primary outline-none"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-muted-foreground space-y-1">
                        Email de contacto
                        <input
                          value={form.contactEmail}
                          onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                          className="w-full bg-background rounded-md px-2 py-1.5 text-[12.5px] text-foreground border border-border focus:border-primary outline-none"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-muted-foreground space-y-1 sm:col-span-2">
                        Notas
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={2}
                          className="w-full bg-background rounded-md px-2 py-1.5 text-[12.5px] text-foreground border border-border focus:border-primary outline-none resize-y"
                        />
                      </label>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={approve}
                      disabled={busy}
                      className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Aprobar como contacto
                    </button>
                    <button
                      onClick={() => setEditing((e) => !e)}
                      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> {editing ? "Listo" : "Editar datos"}
                    </button>
                    <button
                      onClick={() => act("dismiss")}
                      disabled={busy}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer text-muted-foreground")}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> Descartar
                    </button>
                    <button
                      onClick={() => act("delete")}
                      disabled={busy}
                      title="Eliminar captura"
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer text-red-400 ml-auto")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
