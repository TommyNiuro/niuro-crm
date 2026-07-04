"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, ScanLine, Plus, X } from "lucide-react";
import { COPILOT_OPEN_EVENT } from "@/components/ai/CopilotPanel";

// FAB de asistentes (bottom-right): agrupa el copiloto IA y el importador de
// capturas, que antes vivían en el sidebar. Se despliega en dos acciones.
const CHROME_LESS_ROUTES = new Set(["/login", "/setup-account"]);

export function AssistantFab() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  if (CHROME_LESS_ROUTES.has(pathname)) return null;

  const actions = [
    {
      label: "Asistente IA",
      icon: Sparkles,
      onClick: () => window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT)),
    },
    {
      label: "Importar capturas",
      icon: ScanLine,
      onClick: () => router.push("/image-leads"),
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {open &&
        actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              a.onClick();
              setOpen(false);
            }}
            className="flex items-center gap-2.5 rounded-full bg-card border border-border pl-4 pr-2 py-2 text-[13px] font-medium text-foreground shadow-lg transition-colors hover:bg-[var(--hover)] cursor-pointer"
          >
            <span>{a.label}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <a.icon className="h-4 w-4" />
            </span>
          </button>
        ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar asistentes" : "Abrir asistentes"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 cursor-pointer"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}
