import { redirect } from "next/navigation";

// La Agenda pasó a llamarse Tareas (2026-07-03). Ruta vieja redirige.
export default function CalendarRedirect() {
  redirect("/tasks");
}
