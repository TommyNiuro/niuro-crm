"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { RubricConfig, RubricDimension } from "@/lib/score-lead";
import { DEFAULT_RUBRIC_CONFIG } from "@/lib/score-lead";

type DimKey = keyof RubricConfig;

const DIM_LABELS: Record<DimKey, string> = {
  intencion: "Intencion",
  autoridad: "Autoridad",
  necesidad: "Necesidad",
  urgencia: "Urgencia",
  presupuesto: "Presupuesto",
};

function dimToText(dim: RubricDimension): string {
  return dim.keywords.flat().join("\n");
}

function textToDim(text: string, prevDim: RubricDimension): RubricDimension {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { ...prevDim, keywords: [lines] };
}

export function RubricEditor() {
  const [config, setConfig] = useState<RubricConfig>(DEFAULT_RUBRIC_CONFIG);
  const [texts, setTexts] = useState<Record<DimKey, string>>(() => {
    const init = {} as Record<DimKey, string>;
    for (const k of Object.keys(DEFAULT_RUBRIC_CONFIG) as DimKey[]) {
      init[k] = dimToText(DEFAULT_RUBRIC_CONFIG[k]);
    }
    return init;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=rubric_config")
      .then((r) => r.json())
      .then((data) => {
        if (data.value) {
          const parsed = JSON.parse(data.value) as Partial<RubricConfig>;
          const merged: RubricConfig = { ...DEFAULT_RUBRIC_CONFIG, ...parsed };
          setConfig(merged);
          const t = {} as Record<DimKey, string>;
          for (const k of Object.keys(merged) as DimKey[]) {
            t[k] = dimToText(merged[k]);
          }
          setTexts(t);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMaxChange = (dim: DimKey, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    setConfig((prev) => ({
      ...prev,
      [dim]: { ...prev[dim], max: num },
    }));
  };

  const handleTextChange = (dim: DimKey, value: string) => {
    setTexts((prev) => ({ ...prev, [dim]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const updated: RubricConfig = {} as RubricConfig;
    for (const k of Object.keys(config) as DimKey[]) {
      updated[k] = textToDim(texts[k], { ...config[k] });
    }
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "rubric_config", value: JSON.stringify(updated) }),
      });
      if (!r.ok) throw new Error();
      setConfig(updated);
      toast.success("Rubrica guardada");
    } catch {
      toast.error("Error al guardar la rubrica");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando rubrica...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cada linea es una palabra clave. El orden de las secciones define el nivel de puntaje (de mayor a menor).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(config) as DimKey[]).map((dim) => (
          <div key={dim} className="space-y-2 p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium flex-1">{DIM_LABELS[dim]}</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Max:</span>
                <Input
                  type="number"
                  value={config[dim].max}
                  onChange={(e) => handleMaxChange(dim, e.target.value)}
                  className="w-16 h-7 text-xs"
                  min={0}
                  max={100}
                />
              </div>
            </div>
            <Textarea
              value={texts[dim]}
              onChange={(e) => handleTextChange(dim, e.target.value)}
              rows={5}
              className="text-xs font-mono resize-none"
              placeholder="Una keyword por linea..."
            />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? "Guardando..." : "Guardar rubrica"}
      </Button>
    </div>
  );
}
