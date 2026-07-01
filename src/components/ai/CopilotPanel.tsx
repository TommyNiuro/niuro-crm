"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Wrench, Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Panel del copiloto IA (b6-ui-agentes). Slide-over con shadcn Sheet. Se abre
// desde el boton del sidebar o desde el command-K, ambos disparan el evento
// global "copilot-open" (mismo patron que theme-change/favorites-change en el
// codebase). Habla con POST /api/ai/chat y, si hay acciones propuestas, las
// confirma contra /api/ai/execute-action.

type Role = "user" | "assistant";

interface ProposedAction {
  kind: "update" | "create";
  objectName: string;
  id?: string;
  fields: Record<string, unknown>;
}

interface ToolTraceEntry {
  tool: string;
  args: unknown;
  result?: unknown;
  error?: string;
}

type ActionStatus = "applying" | "applied" | "error" | "discarded";

interface ChatTurn {
  role: Role;
  content: string;
  toolTrace?: ToolTraceEntry[];
  actions?: ProposedAction[];
  // Estado POR ACCIÓN (mismo índice que actions), no un flag por turno: con 2+
  // acciones propuestas, aplicarlas dispara requests en paralelo y la primera en
  // resolver no puede decidir el estado de las demás (click-path-audit
  // CLICK-PATH-002 — antes un turno con acciones en paralelo perdía en silencio
  // la que fallara después de que la primera ya marcara todo "resuelto").
  actionStatus?: (ActionStatus | undefined)[];
}

export const COPILOT_OPEN_EVENT = "copilot-open";

function actionLabel(a: ProposedAction): string {
  const fields = Object.keys(a.fields).join(", ");
  return a.kind === "create"
    ? `Crear ${a.objectName} (${fields})`
    : `Actualizar ${a.objectName} ${a.id ?? ""} (${fields})`;
}

export function CopilotPanel() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(COPILOT_OPEN_EVENT, handler);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, handler);
  }, []);

  // Auto-scroll al fondo cuando llega contenido nuevo o aparece el loader.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextTurns: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);

    // El backend espera el historial completo {role, content}. Mandamos solo
    // los campos que entiende (sin toolTrace/actions).
    const messages = nextTurns.map((t) => ({ role: t.role, content: t.content }));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error de la IA");
      setTurns((ts) => [
        ...ts,
        {
          role: "assistant",
          content: String(data.answer ?? ""),
          toolTrace: Array.isArray(data.toolTrace) ? data.toolTrace : [],
          actions: Array.isArray(data.actions) ? data.actions : [],
        },
      ]);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setTurns((ts) => [...ts, { role: "assistant", content: `No pude responder: ${detail}` }]);
    } finally {
      setLoading(false);
    }
  };

  const setActionStatus = (turnIdx: number, actionIdx: number, status: ActionStatus) => {
    setTurns((ts) =>
      ts.map((t, i) => {
        if (i !== turnIdx) return t;
        const next = [...(t.actionStatus ?? new Array(t.actions?.length ?? 0).fill(undefined))];
        next[actionIdx] = status;
        return { ...t, actionStatus: next };
      })
    );
  };

  const applyAction = async (turnIdx: number, actionIdx: number, action: ProposedAction) => {
    setActionStatus(turnIdx, actionIdx, "applying");
    try {
      const res = await fetch("/api/ai/execute-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al aplicar");
      toast.success(`Aplicado: ${action.objectName}`);
      setActionStatus(turnIdx, actionIdx, "applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar la accion");
      setActionStatus(turnIdx, actionIdx, "error");
    }
  };

  const discardAction = (turnIdx: number, actionIdx: number) => {
    setActionStatus(turnIdx, actionIdx, "discarded");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Asistente IA
          </SheetTitle>
          <SheetDescription>
            Pregunta sobre tus datos. Los cambios se confirman antes de aplicarse.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {turns.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              Ejemplos: &quot;cuantos contactos calientes tengo?&quot;, &quot;cuantas oportunidades en el radar?&quot;,
              &quot;resumime el contacto Acme&quot;.
            </p>
          )}

          {turns.map((t, idx) => (
            <div key={idx} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  t.role === "user"
                    ? "max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                    : "max-w-[90%] space-y-2"
                }
              >
                {t.role === "assistant" ? (
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{t.content}</div>
                ) : (
                  t.content
                )}

                {t.role === "assistant" && t.toolTrace && t.toolTrace.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer flex items-center gap-1 select-none">
                      <Wrench className="h-3 w-3" /> Consultó {t.toolTrace.length} herramienta(s)
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {t.toolTrace.map((tr, i) => (
                        <li key={i} className="font-mono">
                          {tr.tool}({JSON.stringify(tr.args)}){tr.error ? ` → error: ${tr.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {t.role === "assistant" && t.actions && t.actions.length > 0 && (() => {
                  const statuses = t.actions.map((_, i) => t.actionStatus?.[i]);
                  const anyPending = statuses.some((s) => s !== "applied" && s !== "discarded");
                  if (!anyPending) return <p className="text-xs text-muted-foreground">Cambios resueltos.</p>;
                  return (
                    <div className="space-y-2 rounded-lg border border-border p-2">
                      <p className="text-xs font-medium text-muted-foreground">Cambios propuestos</p>
                      {t.actions.map((a, i) => {
                        const status = statuses[i];
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <p className="text-xs flex-1">
                              {actionLabel(a)}
                              {status === "applied" && <span className="text-success"> · aplicado</span>}
                              {status === "discarded" && <span className="text-muted-foreground"> · descartado</span>}
                              {status === "error" && <span className="text-destructive"> · fallo, reintentá</span>}
                              {status === "applying" && <span className="text-muted-foreground"> · aplicando…</span>}
                            </p>
                            {(status === undefined || status === "error") && (
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  size="icon-xs"
                                  className="h-6 w-6 cursor-pointer"
                                  onClick={() => applyAction(idx, i, a)}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  className="h-6 w-6 cursor-pointer"
                                  onClick={() => discardAction(idx, i)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground animate-pulse">
                Pensando...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribí tu pregunta..."
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="self-end cursor-pointer">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
