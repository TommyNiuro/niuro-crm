"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // getTheme() lee localStorage, client-only; el gate `mounted` evita
    // renderizar con un valor que no coincide con el SSR hasta despues del
    // mount (anti hydration-mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(getTheme() === "dark");
    setMounted(true);
    const handler = (e: Event) => setIsDark((e as CustomEvent<string>).detail === "dark");
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  if (!mounted) return null;

  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3">
        {isDark ? (
          <Moon className="h-5 w-5 text-primary" />
        ) : (
          <Sun className="h-5 w-5 text-primary" />
        )}
        <div>
          <p className="text-sm font-medium">Tema de interfaz</p>
          <p className="text-xs text-muted-foreground">
            {isDark ? "Modo oscuro activo" : "Modo claro activo"}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={toggle} className="cursor-pointer">
        {isDark ? "Cambiar a claro" : "Cambiar a oscuro"}
      </Button>
    </div>
  );
}
