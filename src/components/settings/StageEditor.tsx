"use client";

/**
 * Editor de etapas del pipeline en Ajustes. Todo real y enlazado:
 * renombrar propaga a contactos y tareas (lo hace la API en transacción),
 * reordenar mueve las columnas del kanban, borrar se bloquea si hay contactos
 * en la etapa. El color se cicla tocando el punto.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Stage = { id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean };

const PALETTE = ["#64748b", "#3B5FE5", "#D4940A", "#0EA5E9", "#8B5CF6", "#16A34A", "#DC2626", "#EAB308"];

export function StageEditor() {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/pipeline/stages")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Stage[]) => {
        setStages(d);
        setNames(Object.fromEntries(d.map((s) => [s.id, s.name])));
      })
      .catch(() => setStages([]));
  }, []);
  useEffect(load, [load]);

  const call = async (init: RequestInit & { url?: string }, okMsg?: string) => {
    setBusy(true);
    try {
      const r = await fetch(init.url ?? "/api/pipeline/stages", init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Error");
      if (okMsg) toast.success(okMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      load();
    } finally {
      setBusy(false);
    }
  };

  const rename = (s: Stage) => {
    const name = (names[s.id] ?? "").trim();
    if (!name || name === s.name) {
      setNames((n) => ({ ...n, [s.id]: s.name }));
      return;
    }
    call(
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, name }) },
      `"${s.name}" ahora es "${name}" (contactos y tareas actualizados)`
    );
  };

  const cycleColor = (s: Stage) => {
    const next = PALETTE[(PALETTE.indexOf(s.color) + 1) % PALETTE.length];
    call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, color: next }) });
  };

  const move = (s: Stage, direction: "up" | "down") =>
    call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, direction }) });

  const remove = (s: Stage) => {
    if (!confirm(`¿Borrar la etapa "${s.name}"?`)) return;
    call({ method: "DELETE", url: `/api/pipeline/stages?id=${encodeURIComponent(s.id)}` }, "Etapa borrada");
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    call(
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) },
      `Etapa "${name}" creada`
    );
  };

  if (!stages) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-2">
      <div role="list" aria-label="Etapas del pipeline" className="space-y-1.5">
        {stages.map((s, i) => (
          <div key={s.id} role="listitem" className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/50">
            <button
              onClick={() => cycleColor(s)}
              className="w-4 h-4 rounded-full shrink-0 cursor-pointer border border-border"
              style={{ backgroundColor: s.color }}
              title="Cambiar color"
              aria-label={`Cambiar color de ${s.name}`}
            />
            <Input
              value={names[s.id] ?? s.name}
              onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))}
              onBlur={() => rename(s)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-8 flex-1"
              aria-label={`Nombre de la etapa ${s.name}`}
            />
            {s.isWon && <span className="text-[10px] text-primary font-semibold shrink-0">GANADA</span>}
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || i === 0} onClick={() => move(s, "up")} aria-label={`Subir ${s.name}`}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || i === stages.length - 1} onClick={() => move(s, "down")} aria-label={`Bajar ${s.name}`}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={busy} onClick={() => remove(s)} aria-label={`Borrar ${s.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nueva etapa..."
          className="h-8"
        />
        <Button size="sm" onClick={add} disabled={busy || !newName.trim()}>
          {busy ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Renombrar propaga a contactos y tareas. Reordenar mueve las columnas del kanban. Borrar pide que la etapa esté vacía.
      </p>
    </div>
  );
}
