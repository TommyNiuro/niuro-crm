import { redirect } from "next/navigation";

// Analítica v2: la raíz manda a la primera sección; la navegación vive en layout.tsx.
export default function AnalyticsPage() {
  redirect("/analytics/ventas");
}
