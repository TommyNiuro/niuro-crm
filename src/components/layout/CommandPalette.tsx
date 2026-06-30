"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Kanban,
  Radar,
  FileText,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { COPILOT_OPEN_EVENT } from "@/components/ai/CopilotPanel";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { NAV_ITEMS } from "./Sidebar";

interface Contact {
  id: string;
  name: string;
  company: string | null;
}
interface Deal {
  id: string;
  title: string;
  contactName: string | null;
}
interface Opportunity {
  id: string;
  role: string | null;
  company: string | null;
}
interface Proposal {
  id: string;
  client: { name?: string } | string | null;
  role: string | null;
}

function clientName(client: Proposal["client"]): string {
  if (!client) return "Propuesta";
  if (typeof client === "string") return client;
  return client.name || "Propuesta";
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);

  // Atajo global Cmd/Ctrl+K. cmdk maneja Escape y el resto del teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Carga perezosa: solo al abrir (y refresca cada vez que se abre).
  useEffect(() => {
    if (!open) return;
    const j = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([
      j("/api/contacts?limit=1000"),
      j("/api/deals"),
      j("/api/opportunities"),
      j("/api/proposals"),
    ]).then(([c, d, o, p]) => {
      setContacts(Array.isArray(c) ? c : []);
      setDeals(Array.isArray(d) ? d : []);
      setOpps(Array.isArray(o) ? o : []);
      setProposals(Array.isArray(p) ? p : []);
    });
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // Acciones rapidas. "Crear deal" abre el alta de la pantalla de Deals (?new=1).
  const actions = [
    { label: "Crear deal", icon: Plus, href: "/deals?new=1" },
    { label: "Ir al Directorio", icon: Users, href: "/contacts" },
    { label: "Ir a Radar de grupos", icon: Radar, href: "/opportunities" },
    { label: "Ir a Pipeline", icon: Kanban, href: "/pipeline" },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Buscador"
      description="Busca registros, navega o ejecuta una accion"
      className="max-w-[560px]"
    >
      <CommandInput placeholder="Buscar contactos, deals, oportunidades, propuestas o ir a..." />
      <CommandList>
        <CommandEmpty>Sin resultados</CommandEmpty>

        <CommandGroup heading="Acciones">
          <CommandItem
            value="accion preguntar a la ia asistente"
            onSelect={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT));
            }}
          >
            <Sparkles className="text-muted-foreground" />
            <span>Preguntar a la IA</span>
          </CommandItem>
          {actions.map((a) => (
            <CommandItem
              key={a.label}
              value={`accion ${a.label}`}
              onSelect={() => go(a.href)}
            >
              <a.icon className="text-muted-foreground" />
              <span>{a.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Ir a">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`ir ${item.label} ${item.href}`}
              onSelect={() => go(item.href)}
            >
              <item.icon className="text-muted-foreground" />
              <span>{item.label}</span>
              <ArrowRight className="ml-auto text-meta" />
            </CommandItem>
          ))}
        </CommandGroup>

        {contacts.length > 0 && (
          <CommandGroup heading="Contactos">
            {contacts.map((c) => (
              <CommandItem
                key={c.id}
                value={`contacto ${c.name} ${c.company ?? ""} ${c.id}`}
                onSelect={() => go(`/contacts/${c.id}`)}
              >
                <Users className="text-muted-foreground" />
                <span className="truncate">{c.name}</span>
                {c.company && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {c.company}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {deals.length > 0 && (
          <CommandGroup heading="Deals">
            {deals.map((d) => (
              <CommandItem
                key={d.id}
                value={`deal ${d.title} ${d.contactName ?? ""} ${d.id}`}
                onSelect={() => go(`/deals/${d.id}`)}
              >
                <Kanban className="text-muted-foreground" />
                <span className="truncate">{d.title}</span>
                {d.contactName && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {d.contactName}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {opps.length > 0 && (
          <CommandGroup heading="Oportunidades">
            {opps.map((o) => (
              <CommandItem
                key={o.id}
                value={`oportunidad ${o.role ?? ""} ${o.company ?? ""} ${o.id}`}
                onSelect={() => go("/opportunities")}
              >
                <Radar className="text-muted-foreground" />
                <span className="truncate">{o.role || "Oportunidad"}</span>
                {o.company && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {o.company}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {proposals.length > 0 && (
          <CommandGroup heading="Propuestas">
            {proposals.map((p) => (
              <CommandItem
                key={p.id}
                value={`propuesta ${clientName(p.client)} ${p.role ?? ""} ${p.id}`}
                onSelect={() => go("/proposals")}
              >
                <FileText className="text-muted-foreground" />
                <span className="truncate">{clientName(p.client)}</span>
                {p.role && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {p.role}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
