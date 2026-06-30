"use client";

import { useState } from "react";
import { RecordIndex } from "@/components/record/RecordIndex";
import { ticketsConfig } from "@/components/record/configs/tickets";

export default function TicketsPage() {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ subject: "", priority: "medium" });

  const create = async () => {
    if (!form.subject) return;
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ subject: "", priority: "medium" });
    setOpen(false);
    setReload((n) => n + 1);
  };

  return (
    <div className="h-full flex flex-col">
      {open && (
        <div className="mx-5 mt-4 rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-center max-w-2xl slide-in">
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Asunto del ticket"
            aria-label="Asunto del ticket"
            className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            aria-label="Prioridad del ticket"
            className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none"
          >
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
          <button onClick={create} aria-label="Crear ticket" className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium cursor-pointer hover:bg-primary-hover">
            Crear
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <RecordIndex
          config={ticketsConfig}
          onNew={() => setOpen((o) => !o)}
          newLabel="Nuevo ticket"
          reloadSignal={reload}
        />
      </div>
    </div>
  );
}
