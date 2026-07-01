"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Database, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import type { FieldType, SelectOption } from "@/components/record/types";

// Los 16 tipos del record-view. La API los valida al crear; aca solo poblamos el
// select. ponytail: lista literal en vez de importar FIELD_TYPES (vive en
// custom-fields.ts, que es server-only por rawDb y rompe el bundle del cliente).
const FIELD_TYPES: FieldType[] = [
  "text", "number", "currency", "amount", "score", "select", "status", "stage",
  "temperature", "date", "tags", "longtext", "link", "email", "relation", "boolean",
];

import { contactsConfig } from "@/components/record/configs/contacts";
import { dealsConfig } from "@/components/record/configs/deals";
import { companiesConfig } from "@/components/record/configs/companies";
import { opportunitiesConfig } from "@/components/record/configs/opportunities";
import { proposalsConfig } from "@/components/record/configs/proposals";
import { ticketsConfig } from "@/components/record/configs/tickets";
import type { RecordConfig } from "@/components/record/types";

// Mapa objeto -> config, para listar los campos estandar (read-only). Los custom
// salen de la API. ponytail: hardcode de los 6 estandar; un objeto custom no tiene
// config y muestra solo sus campos custom.
const CONFIGS: Record<string, RecordConfig> = {
  contacts: contactsConfig,
  deals: dealsConfig,
  companies: companiesConfig,
  opportunities: opportunitiesConfig,
  proposals: proposalsConfig,
  tickets: ticketsConfig,
};

interface ObjectMeta {
  id: string;
  name: string;
  label_singular: string | null;
  label_plural: string | null;
  icon: string | null;
  is_custom: number;
}

interface FieldMeta {
  id: string;
  object_name: string;
  name: string;
  label: string | null;
  type: string;
  options: string | null;
  is_custom: number;
}

// Campo unificado para la tabla (estandar de config o custom de la API).
interface FieldRow {
  id: string | null; // null para estandar (no editable)
  name: string;
  label: string;
  type: string;
  isCustom: boolean;
  options?: SelectOption[];
}

const NEEDS_OPTIONS = (t: string) => t === "select" || t === "status";

export default function DataModelPage() {
  const [objects, setObjects] = useState<ObjectMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<FieldMeta[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  const [newObjectOpen, setNewObjectOpen] = useState(false);
  const [fieldDialog, setFieldDialog] = useState<{ mode: "new" | "edit"; field?: FieldRow } | null>(
    null
  );

  const loadObjects = useCallback(() => {
    fetch("/api/metadata/objects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ObjectMeta[]) => {
        setObjects(Array.isArray(d) ? d : []);
        setSelected((s) => s ?? (Array.isArray(d) && d[0] ? d[0].name : null));
      })
      .catch(() => {});
  }, []);

  const loadFields = useCallback((objectName: string) => {
    setLoadingFields(true);
    fetch(`/api/metadata/objects/${objectName}`)
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => setCustomFields(Array.isArray(d?.fields) ? d.fields : []))
      .catch(() => setCustomFields([]))
      .finally(() => setLoadingFields(false));
  }, []);

  useEffect(() => loadObjects(), [loadObjects]);
  useEffect(() => {
    // fetch-on-mount estandar (loadFields marca loadingFields=true antes del fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) loadFields(selected);
  }, [selected, loadFields]);

  const selectedObj = objects.find((o) => o.name === selected);
  const config = selected ? CONFIGS[selected] : undefined;

  // Filas: estandar (de config, sin id) + custom (de la API). El backend guarda
  // solo is_custom=1 en field_metadata, asi que no hay solape con las de config.
  const standardRows: FieldRow[] = (config?.columns ?? []).map((c) => ({
    id: null,
    name: c.key,
    label: c.label,
    type: c.type,
    isCustom: false,
  }));
  const customRows: FieldRow[] = customFields
    .filter((f) => f.is_custom)
    .map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label ?? f.name,
      type: f.type,
      isCustom: true,
      options: f.options ? safeParse(f.options) : undefined,
    }));
  const rows = [...standardRows, ...customRows];

  async function deleteField(field: FieldRow) {
    if (!field.id) return;
    if (!confirm(`Borrar el campo "${field.label}"? Se eliminan tambien sus valores guardados.`))
      return;
    const res = await fetch(`/api/metadata/fields/${field.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Campo borrado");
      if (selected) loadFields(selected);
    } else {
      toast.error((await res.json().catch(() => ({})))?.error ?? "Error al borrar");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Volver a ajustes"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5" />
            Modelo de datos
          </h1>
          <p className="text-muted-foreground">
            Objetos y campos del CRM. Agrega campos custom a cualquier objeto.
          </p>
        </div>
        <Button variant="outline" onClick={() => setNewObjectOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo objeto
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Lista de objetos */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Objetos</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div role="list" className="space-y-0.5">
              {objects.map((o) => (
                <button
                  key={o.id}
                  role="listitem"
                  onClick={() => setSelected(o.name)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                    selected === o.name ? "bg-[var(--selected)] font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex-1 truncate">{o.label_plural ?? o.name}</span>
                  {o.is_custom ? (
                    <Badge variant="secondary" className="text-[10px]">
                      custom
                    </Badge>
                  ) : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Campos del objeto seleccionado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedObj ? selectedObj.label_plural ?? selectedObj.name : "Campos"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {rows.length} campos
              </span>
            </CardTitle>
            <Button
              size="sm"
              disabled={!selected}
              onClick={() => setFieldDialog({ mode: "new" })}
            >
              <Plus className="h-4 w-4" />
              Nuevo campo
            </Button>
          </CardHeader>
          <CardContent>
            {loadingFields ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : (
              <div role="list" className="divide-y">
                {rows.map((f) => (
                  <div
                    key={(f.id ?? "std") + f.name}
                    role="listitem"
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{f.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      {f.type}
                    </Badge>
                    {f.isCustom ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setFieldDialog({ mode: "edit", field: f })}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground cursor-pointer"
                          aria-label={`Editar ${f.label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteField(f)}
                          className="p-1.5 rounded hover:bg-muted text-destructive cursor-pointer"
                          aria-label={`Borrar ${f.label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Lock
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-label="Campo estandar (solo lectura)"
                      />
                    )}
                  </div>
                ))}
                {!rows.length && (
                  <p className="text-sm text-muted-foreground py-2">Sin campos.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {newObjectOpen && (
        <NewObjectDialog
          onClose={() => setNewObjectOpen(false)}
          onCreated={(name) => {
            setNewObjectOpen(false);
            loadObjects();
            setSelected(name);
          }}
        />
      )}

      {fieldDialog && selected && (
        <FieldDialog
          objectName={selected}
          mode={fieldDialog.mode}
          field={fieldDialog.field}
          onClose={() => setFieldDialog(null)}
          onSaved={() => {
            setFieldDialog(null);
            loadFields(selected);
          }}
        />
      )}
    </div>
  );
}

function safeParse(s: string): SelectOption[] | undefined {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

// --- Dialog: nuevo objeto custom ---
function NewObjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [labelPlural, setLabelPlural] = useState("");
  const [labelSingular, setLabelSingular] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await fetch("/api/metadata/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, labelSingular, labelPlural }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Objeto creado");
      onCreated(name.trim().toLowerCase());
    } else {
      toast.error((await res.json().catch(() => ({})))?.error ?? "Error al crear objeto");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo objeto</DialogTitle>
          <DialogDescription>
            Crea un objeto custom. El nombre interno usa minusculas, numeros y _.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="obj-plural">Nombre (plural)</Label>
            <Input
              id="obj-plural"
              value={labelPlural}
              onChange={(e) => setLabelPlural(e.target.value)}
              placeholder="Proveedores"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-singular">Nombre (singular)</Label>
            <Input
              id="obj-singular"
              value={labelSingular}
              onChange={(e) => setLabelSingular(e.target.value)}
              placeholder="Proveedor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-name">Nombre interno</Label>
            <Input
              id="obj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="proveedores"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Dialog: nuevo / editar campo custom ---
function FieldDialog({
  objectName,
  mode,
  field,
  onClose,
  onSaved,
}: {
  objectName: string;
  mode: "new" | "edit";
  field?: FieldRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>((field?.type as FieldType) ?? "text");
  // Editor de opciones: una por linea, "valor|etiqueta" o solo "valor".
  const [optionsText, setOptionsText] = useState(
    (field?.options ?? []).map((o) => (o.label && o.label !== o.value ? `${o.value}|${o.label}` : o.value)).join("\n")
  );
  const [saving, setSaving] = useState(false);

  const parsedOptions: SelectOption[] = optionsText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [value, lbl] = l.split("|").map((p) => p.trim());
      return { value, label: lbl || value };
    });

  async function submit() {
    setSaving(true);
    const optionsPayload = NEEDS_OPTIONS(type) ? parsedOptions : undefined;
    let res: Response;
    if (mode === "new") {
      res = await fetch("/api/metadata/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectName, name, label, type, options: optionsPayload }),
      });
    } else {
      res = await fetch(`/api/metadata/fields/${field!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, type, options: optionsPayload }),
      });
    }
    setSaving(false);
    if (res.ok) {
      toast.success(mode === "new" ? "Campo creado" : "Campo actualizado");
      onSaved();
    } else {
      toast.error((await res.json().catch(() => ({})))?.error ?? "Error al guardar");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "Nuevo campo" : "Editar campo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fld-label">Etiqueta</Label>
            <Input
              id="fld-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Industria"
            />
          </div>
          {mode === "new" && (
            <div className="space-y-1.5">
              <Label htmlFor="fld-name">Nombre interno</Label>
              <Input
                id="fld-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="industria"
                className="font-mono"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fld-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as FieldType)}>
              <SelectTrigger id="fld-type" className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {NEEDS_OPTIONS(type) && (
            <div className="space-y-1.5">
              <Label htmlFor="fld-options">Opciones</Label>
              <textarea
                id="fld-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"saas\nfintech|Fintech\nretail|Retail"}
                rows={4}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Una opcion por linea. Formato: valor o valor|etiqueta.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={
              saving ||
              !label.trim() ||
              (mode === "new" && !name.trim()) ||
              (NEEDS_OPTIONS(type) && !parsedOptions.length)
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
