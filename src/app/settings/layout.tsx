"use client";

/**
 * Ajustes v2: sub-navegación por secciones (estilo Linear/Twenty) en vez de
 * una sola página scrolleable de cards. Cada sección es una ruta anidada;
 * Modelo de datos y Agentes IA (páginas que ya existían) viven bajo la misma nav.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Kanban,
  Radar,
  Database,
  Bot,
  Webhook,
  Bell,
  Palette,
  KeyRound,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings/negocio", label: "Negocio", icon: Briefcase },
  { href: "/settings/pipelines", label: "Pipelines", icon: Kanban },
  { href: "/settings/radar", label: "Radar y scoring", icon: Radar },
  { href: "/settings/data-model", label: "Modelo de datos", icon: Database },
  { href: "/settings/ai", label: "Agentes IA", icon: Bot },
  { href: "/settings/integraciones", label: "Integraciones", icon: Webhook },
  { href: "/settings/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/settings/apariencia", label: "Apariencia", icon: Palette },
  { href: "/settings/cuenta", label: "Cuenta", icon: KeyRound },
  { href: "/settings/claude-code", label: "Claude Code", icon: Terminal },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-border overflow-y-auto p-3">
        <h1 className="text-sm font-semibold tracking-tight px-2 py-2">Ajustes</h1>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => {
            const active = pathname === s.href || pathname.startsWith(s.href + "/");
            return (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
    </div>
  );
}
