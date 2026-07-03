"use client";

/**
 * Analítica v2: secciones con sub-navegación propia (mismo patrón que Ajustes),
 * una por dominio del negocio: ventas, pérdidas, actividad, ingenieros, clientes.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, TrendingDown, Activity, HardHat, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/analytics/ventas", label: "Ventas", icon: TrendingUp },
  { href: "/analytics/perdidas", label: "Pérdidas", icon: TrendingDown },
  { href: "/analytics/actividad", label: "Actividad", icon: Activity },
  { href: "/analytics/ingenieros", label: "Ingenieros", icon: HardHat },
  { href: "/analytics/clientes", label: "Clientes", icon: Handshake },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-border overflow-y-auto p-3">
        <h1 className="text-sm font-semibold tracking-tight px-2 py-2">Analítica</h1>
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
      <main className="flex-1 overflow-y-auto p-6 md:p-8 fade-in">{children}</main>
    </div>
  );
}
