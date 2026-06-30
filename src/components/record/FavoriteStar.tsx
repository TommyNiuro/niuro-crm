"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estrella para fijar/quitar un registro de favoritos (sidebar). Optimista:
 * consulta el estado al montar (GET /api/favorites) y togglea contra POST/DELETE.
 * Emite "favorites-change" para que el Sidebar recargue su lista.
 */
export function FavoriteStar({
  targetType,
  targetId,
  label,
  href,
  className,
}: {
  targetType: string;
  targetId: string;
  label: string;
  href: string;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((favs: { targetType: string; targetId: string }[]) => {
        if (alive)
          setPinned(Array.isArray(favs) && favs.some((f) => f.targetType === targetType && f.targetId === targetId));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [targetType, targetId]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !pinned;
    setPinned(next); // optimista
    try {
      if (next) {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType, targetId, label, href }),
        });
      } else {
        await fetch(`/api/favorites?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, {
          method: "DELETE",
        });
      }
      window.dispatchEvent(new CustomEvent("favorites-change"));
    } catch {
      setPinned(!next); // revertir
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={pinned ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={pinned}
      title={pinned ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={cn(
        "flex items-center justify-center rounded-md p-1.5 transition-colors cursor-pointer",
        pinned ? "text-amber-400 hover:text-amber-500" : "text-meta hover:text-foreground",
        className
      )}
    >
      <Star className={cn("h-4 w-4", pinned && "fill-current")} />
    </button>
  );
}
