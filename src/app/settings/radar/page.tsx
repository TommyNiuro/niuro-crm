"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoPromoteToggle } from "@/components/shared/AutoPromoteToggle";
import { RubricEditor } from "@/components/shared/RubricEditor";
import { toast } from "sonner";

/** Días sin actividad antes de auto-descartar un candidato pendiente. */
function DecayDaysInput() {
  const [days, setDays] = useState("");
  useEffect(() => {
    fetch("/api/settings?key=radar_decay_days")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDays(d?.value || "30"))
      .catch(() => setDays("30"));
  }, []);
  const save = () => {
    const v = Math.max(1, Number(days) || 30);
    setDays(String(v));
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "radar_decay_days", value: String(v) }),
    })
      .then((r) => (r.ok ? toast.success(`Decay en ${v} días`) : toast.error("No se pudo guardar")))
      .catch(() => toast.error("No se pudo guardar"));
  };
  return (
    <div className="space-y-1 max-w-xs">
      <Label htmlFor="decay-days">Días sin actividad antes de auto-descartar</Label>
      <Input
        id="decay-days"
        type="number"
        min={1}
        value={days}
        onChange={(e) => setDays(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <p className="text-xs text-muted-foreground">
        Un candidato pendiente sin mensajes en este plazo se descarta solo; si el contacto revive, vuelve a aparecer.
      </p>
    </div>
  );
}

export default function RadarSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Radar y scoring</h2>
        <p className="text-sm text-muted-foreground">
          Cómo se puntúan, promueven y expiran los leads que detecta el radar.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comportamiento del radar</CardTitle>
          <CardDescription>Promoción automática de calientes y expiración de fríos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <AutoPromoteToggle />
          <DecayDaysInput />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rúbrica de scoring</CardTitle>
          <CardDescription>Los pesos con los que se calcula el score de cada lead.</CardDescription>
        </CardHeader>
        <CardContent>
          <RubricEditor />
        </CardContent>
      </Card>
    </div>
  );
}
