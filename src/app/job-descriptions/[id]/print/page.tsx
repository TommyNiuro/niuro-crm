/**
 * src/app/job-descriptions/[id]/print/page.tsx
 *
 * Página de impresión de una JD, pensada para A4 / PDF (Playwright navega acá
 * desde src/lib/job-descriptions-pdf.ts). Renderiza SOLO el
 * <JobDescriptionRenderer/> dentro de .niuro-jd, como capa fija a pantalla
 * completa que tapa el chrome de la app.
 *
 * Los estilos globales de página (@page margin + fondo Warm White que cubre
 * también el área de margen vía body::before fijo) viven acá, en un <style> que
 * SOLO carga en esta ruta: así el PDF nunca muestra blanco puro en los márgenes
 * y no se filtra al resto de la app (mismo motivo por el que jd-template.css es
 * scopeado bajo .jd-doc).
 */
"use client";

import { use, useEffect, useState } from "react";
import {
  JobDescriptionRenderer,
  type JdRenderData,
} from "@/components/job-descriptions/JobDescriptionRenderer";

export default function JobDescriptionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [jd, setJd] = useState<JdRenderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/job-descriptions/${id}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("No se pudo cargar la descripción de cargo");
          return;
        }
        const data = (await res.json()) as JdRenderData;
        if (!cancelled) setJd(data);
      } catch {
        if (!cancelled) setError("No se pudo cargar la descripción de cargo");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm 16mm; }
        html, body { background: #FFFFFF; }
        body::before { content: ""; position: fixed; inset: 0; background: #FFFFFF; z-index: -1; }
      `}</style>
      <div
        className="niuro-jd"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          overflow: "auto",
          background: "#FFFFFF",
          color: "#050F41",
          padding: "20px",
        }}
      >
        {error ? (
          <div style={{ padding: "24px", fontFamily: "sans-serif" }}>{error}</div>
        ) : jd ? (
          <JobDescriptionRenderer jd={jd} />
        ) : null}
      </div>
    </>
  );
}
