"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap } from "lucide-react";

const COMMANDS = [
  { name: "/setup", description: "Configurar CRM para tu negocio" },
  { name: "/add-lead", description: "Agregar un lead de forma conversacional" },
  { name: "/analyze-pipeline", description: "Analizar pipeline y obtener recomendaciones" },
  { name: "/daily-briefing", description: "Resumen diario de ventas" },
  { name: "/import-contacts", description: "Importar contactos desde CSV" },
  { name: "/customize", description: "Re-personalizar tu CRM" },
];

export default function ClaudeCodeSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Claude Code</h2>
        <p className="text-sm text-muted-foreground">
          Comandos disponibles al abrir el proyecto del CRM en Claude Code.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comandos</CardTitle>
          <CardDescription>Escribí el comando directamente en la terminal de Claude Code.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {COMMANDS.map((cmd) => (
              <div key={cmd.name} className="flex items-start gap-3 p-3 rounded-lg border">
                <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <code className="text-sm font-semibold">{cmd.name}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{cmd.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
