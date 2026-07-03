"use client";

/**
 * Formulario de Negocio en Ajustes: edita la identidad real del CRM
 * (crm_settings vía PUT /api/operator, la misma que usa el onboarding y la IA)
 * y la meta de MRR mensual que mueve las barras del dashboard y analítica.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function BusinessForm() {
  const [form, setForm] = useState({ name: "", role: "", email: "", company: "", pitch: "" });
  const [goalMrr, setGoalMrr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/operator")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setForm({ name: d.name || "", role: d.role || "", email: d.email || "", company: d.company || "", pitch: d.pitch || "" });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    fetch("/api/settings?key=goal_mrr")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGoalMrr(d?.value || "20000"))
      .catch(() => setGoalMrr("20000"));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim() || !form.company.trim()) {
      toast.error("Nombre y empresa son requeridos");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/operator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Error al guardar");
      const goal = Math.max(0, Number(goalMrr) || 0);
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "goal_mrr", value: String(goal || 20000) }),
      });
      toast.success("Negocio actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="biz-name">Tu nombre</Label>
          <Input id="biz-name" value={form.name} onChange={set("name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="biz-role">Rol</Label>
          <Input id="biz-role" value={form.role} onChange={set("role")} placeholder="Ventas" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="biz-email">Email</Label>
        <Input id="biz-email" type="email" value={form.email} onChange={set("email")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="biz-company">Empresa</Label>
        <Input id="biz-company" value={form.company} onChange={set("company")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="biz-pitch">Pitch (lo usa la IA para redactar)</Label>
        <Input id="biz-pitch" value={form.pitch} onChange={set("pitch")} placeholder="staff augmentation de ingenieros..." />
      </div>
      <div className="space-y-1">
        <Label htmlFor="biz-goal">Meta MRR mensual (USD)</Label>
        <Input id="biz-goal" type="number" min={0} value={goalMrr} onChange={(e) => setGoalMrr(e.target.value)} />
        <p className="text-xs text-muted-foreground">Mueve la barra de meta del Inicio y de Analítica.</p>
      </div>
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="animate-spin" /> : null}
        Guardar negocio
      </Button>
    </div>
  );
}
