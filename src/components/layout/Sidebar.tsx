"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  Kanban,
  Users,
  Calendar,
  Zap,
  BarChart3,
  Plug,
  Settings,
  Sun,
  Moon,
  Radar,
  ScanLine,
  FileText,
  Building2,
  Star,
  X,
  Sparkles,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COPILOT_OPEN_EVENT } from "@/components/ai/CopilotPanel";

interface Favorite {
  id: string;
  targetType: string;
  targetId: string;
  label: string;
  href: string;
}

interface CustomObject {
  name: string;
  label_plural: string | null;
}

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/whatsapp", label: "Conversaciones", icon: MessageCircle },
  { href: "/opportunities", label: "Radar grupos", icon: Radar },
  { href: "/image-leads", label: "Importar", icon: ScanLine },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/proposals", label: "Propuestas", icon: FileText },
  { href: "/contacts", label: "Directorio", icon: Users },
  { href: "/companies", label: "Empresas", icon: Building2 },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/automations", label: "Automatizaciones", icon: Zap },
  { href: "/analytics", label: "Analitica", icon: BarChart3 },
  { href: "/integrations", label: "Integraciones", icon: Plug },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ leads: number; opportunities: number }>({
    leads: 0,
    opportunities: 0,
  });
  const [isDark, setIsDark] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [customObjects, setCustomObjects] = useState<CustomObject[]>([]);

  useEffect(() => {
    fetch("/api/metadata/objects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) =>
        setCustomObjects(
          Array.isArray(d) ? d.filter((o: { is_custom?: number }) => o.is_custom === 1) : []
        )
      )
      .catch(() => {});
  }, []);

  const loadFavorites = () =>
    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFavorites(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => {
    loadFavorites();
    const handler = () => loadFavorites();
    window.addEventListener("favorites-change", handler);
    return () => window.removeEventListener("favorites-change", handler);
  }, []);

  const removeFavorite = (e: React.MouseEvent, fav: Favorite) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((fs) => fs.filter((f) => f.id !== fav.id)); // optimista
    fetch(`/api/favorites?id=${fav.id}`, { method: "DELETE" })
      .then(() => window.dispatchEvent(new CustomEvent("favorites-change")))
      .catch(() => {});
  };

  useEffect(() => {
    // Import lazily to avoid SSR issues
    import("@/lib/theme").then(({ getTheme }) => setIsDark(getTheme() === "dark"));
    const handler = (e: Event) => setIsDark((e as CustomEvent<string>).detail === "dark");
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  const toggleTheme = () => {
    import("@/lib/theme").then(({ toggleTheme }) => toggleTheme());
  };

  useEffect(() => {
    fetch("/api/whatsapp/candidates?status=pending")
      .then((r) => (r.ok ? r.json() : []))
      .then((leads) => {
        setCounts((c) => ({ ...c, leads: Array.isArray(leads) ? leads.length : 0 }));
      })
      .catch(() => {});
    fetch("/api/opportunities?status=new")
      .then((r) => (r.ok ? r.json() : []))
      .then((ops) => {
        setCounts((c) => ({ ...c, opportunities: Array.isArray(ops) ? ops.length : 0 }));
      })
      .catch(() => {});
  }, []);

  const badgeFor = (href: string) => {
    if (href === "/whatsapp") return counts.leads;
    if (href === "/opportunities") return counts.opportunities;
    return 0;
  };

  return (
    <aside className="hidden md:flex md:w-[220px] md:flex-col bg-sidebar text-sidebar-foreground min-h-screen border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
          N
        </div>
        <div className="text-[14px] font-semibold tracking-tight">Niuro CRM</div>
      </div>

      {/* Favoritos */}
      {favorites.length > 0 && (
        <div className="px-2 pt-3 pb-1 border-b border-sidebar-border">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Favoritos
          </div>
          <div className="space-y-0.5">
            {favorites.map((fav) => {
              const active = isActive(pathname, fav.href);
              return (
                <Link
                  key={fav.id}
                  href={fav.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors cursor-pointer",
                    active
                      ? "bg-[var(--selected)] text-sidebar-foreground font-medium"
                      : "text-muted-foreground hover:bg-[var(--hover)] hover:text-sidebar-foreground"
                  )}
                >
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  <span className="flex-1 truncate">{fav.label}</span>
                  <button
                    type="button"
                    onClick={(e) => removeFavorite(e, fav)}
                    aria-label={`Quitar ${fav.label} de favoritos`}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-sidebar-foreground transition-opacity shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Asistente IA: accion, no ruta. Abre el slide-over via evento global. */}
      <div className="px-2 pt-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT))}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground transition-colors cursor-pointer hover:bg-[var(--hover)] hover:text-sidebar-foreground"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0 text-primary" />
          <span className="flex-1 text-left">Asistente IA</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors cursor-pointer",
                active
                  ? "bg-[var(--selected)] text-sidebar-foreground font-medium"
                  : "text-muted-foreground hover:bg-[var(--hover)] hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badgeFor(item.href) > 0 && (
                <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-primary text-primary-foreground tabular-nums">
                  {badgeFor(item.href)}
                </span>
              )}
            </Link>
          );
        })}

        {/* Objetos custom (Modelo de datos): se navegan via /o/[name]. */}
        {customObjects.length > 0 && (
          <div className="pt-3 mt-2 border-t border-sidebar-border">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Objetos
            </div>
            {customObjects.map((obj) => {
              const href = `/o/${obj.name}`;
              const active = isActive(pathname, href);
              return (
                <Link
                  key={obj.name}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors cursor-pointer",
                    active
                      ? "bg-[var(--selected)] text-sidebar-foreground font-medium"
                      : "text-muted-foreground hover:bg-[var(--hover)] hover:text-sidebar-foreground"
                  )}
                >
                  <Boxes className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1 truncate">{obj.label_plural || obj.name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2.5 rounded-lg p-2 bg-hover">
          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">{(process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Operador").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Operador"}</div>
            <div className="text-[10px] text-muted-foreground">{process.env.NEXT_PUBLIC_OPERATOR_ROLE ?? "Ventas"}</div>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-[var(--hover)] text-muted-foreground hover:text-sidebar-foreground transition-colors cursor-pointer shrink-0"
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
