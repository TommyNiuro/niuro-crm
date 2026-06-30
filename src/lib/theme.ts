/**
 * theme.ts — fuente única de verdad para el tema dark/light.
 * Usa un CustomEvent para sincronizar todos los componentes en la misma pestaña.
 */

export function getTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem("theme") as "dark" | "light") ?? "light";
}

export function setTheme(theme: "dark" | "light") {
  localStorage.setItem("theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}
