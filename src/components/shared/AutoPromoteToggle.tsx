"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AutoPromoteToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings?key=auto_promote_hot")
      .then((r) => r.json())
      .then((data) => {
        setEnabled(data.value === "on");
      })
      .catch(() => toast.error("Error al cargar configuracion"))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (checked: boolean) => {
    const prev = enabled;
    setEnabled(checked);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "auto_promote_hot", value: checked ? "on" : "off" }),
      });
      if (!r.ok) throw new Error("Error al guardar");
      toast.success(checked ? "Auto-promocion activada" : "Auto-promocion desactivada");
    } catch {
      setEnabled(prev);
      toast.error("No se pudo guardar el cambio");
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="space-y-1">
        <Label htmlFor="auto-promote" className="text-sm font-medium cursor-pointer">
          Promover leads calientes automaticamente
        </Label>
        <p className="text-xs text-muted-foreground">
          Los leads con score &gt;= 85 se promueven automaticamente a Discovery
        </p>
      </div>
      <Switch
        id="auto-promote"
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={loading}
      />
    </div>
  );
}
