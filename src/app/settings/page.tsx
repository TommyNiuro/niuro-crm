import { redirect } from "next/navigation";

// Ajustes v2: la raíz manda a la primera sección; la navegación vive en layout.tsx.
export default function SettingsPage() {
  redirect("/settings/negocio");
}
