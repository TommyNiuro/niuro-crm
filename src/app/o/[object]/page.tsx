"use client";

import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { RecordIndex } from "@/components/record/RecordIndex";
import type { RecordConfig } from "@/components/record/types";

/**
 * Página genérica de un objeto 100% custom. No tiene columnas propias: RecordIndex
 * appendea sus campos desde el metadata engine. Solo construye el config (endpoints,
 * título, searchKeys) y el alta de registro en blanco.
 */

interface FieldMeta {
  name: string;
  type: string;
}

const SEARCHABLE = new Set(["text", "email", "link", "longtext"]);

export default function CustomObjectPage({ params }: { params: Promise<{ object: string }> }) {
  const { object } = use(params);
  const [config, setConfig] = useState<RecordConfig | null>(null);
  const [missing, setMissing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/metadata/objects/${object}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        // Solo objetos custom: built-ins (is_custom=0) y slugs inexistentes no tienen página aquí.
        if (!d || d.is_custom !== 1) {
          setMissing(true);
          return;
        }
        const fields: FieldMeta[] = Array.isArray(d.fields) ? d.fields : [];
        const searchKeys = fields.filter((f) => SEARCHABLE.has(f.type)).map((f) => f.name);
        setConfig({
          object,
          title: d.label_plural || object,
          singular: d.label_singular || object,
          listEndpoint: `/api/custom/${object}`,
          updateEndpoint: (id) => `/api/custom/${object}/${id}`,
          updateMethod: "PUT",
          deleteEndpoint: (id) => `/api/custom/${object}/${id}`,
          hasAvatar: false,
          searchKeys: searchKeys.length ? searchKeys : ["id"],
          columns: [], // RecordIndex appendea los campos custom desde metadata
        });
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [object]);

  if (missing) return <div className="p-6 text-sm text-muted-foreground">Objeto no encontrado.</div>;
  if (!config) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  const onNew = async () => {
    const res = await fetch(`/api/custom/${object}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      toast.error("No se pudo crear el registro");
      return;
    }
    setReload((n) => n + 1);
  };

  return (
    <RecordIndex config={config} onNew={onNew} newLabel={`Nuevo ${config.singular}`} reloadSignal={reload} />
  );
}
