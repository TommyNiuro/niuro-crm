"use client";

/* Vincular un contacto del CRM DESPUES de generada la propuesta. Opcional a
 * proposito: el flujo de creacion (modo turbo) ya no lo pide de entrada, esto
 * es para cuando el contacto se cargo despues o el vendedor quiere conectarlo
 * igual (ej. para que el pipeline avance al cambiar status a "sent"). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Search, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types";

type Props = {
  proposalId: string;
  onLinked: (contact: Contact) => void;
};

export function ProposalLinkContact({ proposalId, onLinked }: Props) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!open || contacts.length > 0) return;
    setLoading(true);
    fetch("/api/contacts?limit=500")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => toast.error("No se pudieron cargar los contactos"))
      .finally(() => setLoading(false));
  }, [open, contacts.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? contacts.slice(0, 30)
      : contacts.filter((c) => [c.name, c.company, c.email].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
    return list.slice(0, 30);
  }, [contacts, search]);

  const link = useCallback(
    async (contact: Contact) => {
      setLinking(contact.id);
      try {
        const res = await fetch(`/api/proposals/${proposalId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: contact.id }),
        });
        if (!res.ok) throw new Error("No se pudo vincular el contacto");
        onLinked(contact);
        toast.success(`Vinculado a ${contact.name}`);
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al vincular");
      } finally {
        setLinking(null);
      }
    },
    [proposalId, onLinked],
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
      >
        <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular contacto
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-xl border border-border bg-popover shadow-lg z-20 p-2">
          <div className="relative mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto..."
              className="w-full bg-background rounded-lg pl-7 pr-2 py-1.5 text-[12.5px] border border-input focus:border-ring outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="px-2 py-3 text-[12.5px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-3 text-[12.5px] text-muted-foreground">Sin resultados.</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => link(c)}
                  disabled={linking === c.id}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] flex items-center gap-2 cursor-pointer hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[c.company, c.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {linking === c.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <Check className="h-3.5 w-3.5 opacity-0 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
