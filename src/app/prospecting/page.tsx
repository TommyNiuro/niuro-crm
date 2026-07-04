"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RecordIndex } from "@/components/record/RecordIndex";
import { prospectsConfig } from "@/components/record/configs/prospects";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

/** Banner de configuración de Apollo: si no hay API key, la pide acá mismo
 *  (se guarda en crm_settings y nunca vuelve al cliente). */
function ApolloKeyBar() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    fetch("/api/settings?key=apollo_api_key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConfigured(!!d?.set))
      .catch(() => setConfigured(false));
  }, []);

  if (configured !== false) return null;

  const save = async () => {
    if (!value.trim()) return;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "apollo_api_key", value: value.trim() }),
    });
    if (res.ok) {
      setConfigured(true);
      toast.success("Apollo configurado: ya podés enriquecer prospectos");
    } else {
      toast.error("No se pudo guardar la key");
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-[13px]">
      <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">
        Apollo sin configurar: pegá tu API key (Apollo → Settings → Integrations → API) para
        encontrar al decisor de cada empresa.
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="API key de Apollo"
        className="h-8 flex-1 max-w-xs rounded-md border border-border bg-background px-2 text-[13px]"
      />
      <Button size="sm" onClick={save} disabled={!value.trim()}>
        Guardar
      </Button>
    </div>
  );
}

export default function ProspectingPage() {
  return (
    <div className="flex h-full flex-col">
      <ApolloKeyBar />
      <div className="flex-1 min-h-0">
        <RecordIndex config={prospectsConfig} />
      </div>
    </div>
  );
}
