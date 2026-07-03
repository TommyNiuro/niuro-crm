"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function IntegracionesSettingsPage() {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4555";
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Integraciones</h2>
        <p className="text-sm text-muted-foreground">
          Entradas de leads desde afuera del CRM. El estado de WhatsApp vive en{" "}
          <Link href="/status" className="text-primary hover:underline">Estado</Link> y las
          integraciones conectadas en{" "}
          <Link href="/integrations" className="text-primary hover:underline inline-flex items-center gap-0.5">
            Integraciones <ExternalLink className="h-3 w-3" />
          </Link>.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Recibe leads automáticamente desde formularios, landing pages, o cualquier herramienta que soporte webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-muted p-2 rounded font-mono truncate">
              POST {origin}/api/webhook
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${origin}/api/webhook`);
                toast.success("URL copiada");
              }}
              className="p-2 rounded hover:bg-muted cursor-pointer"
              title="Copiar URL"
              aria-label="Copiar URL del webhook"
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-xs font-mono">
            <p className="text-muted-foreground mb-1">Ejemplo:</p>
            <p>curl -X POST {origin}/api/webhook \</p>
            <p className="pl-4">-H &quot;Content-Type: application/json&quot; \</p>
            <p className="pl-4">-d &apos;{`{"name":"Juan","email":"j@test.com","phone":"555-1234"}`}&apos;</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Soporta campos en espanol e ingles: name/nombre, email/correo, phone/telefono, company/empresa, notes/notas
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
