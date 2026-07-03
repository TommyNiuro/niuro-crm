"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NotificationToggle } from "@/components/shared/NotificationToggle";

export default function NotificacionesSettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Notificaciones</h2>
        <p className="text-sm text-muted-foreground">Alertas del navegador para seguimientos vencidos.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificaciones del navegador</CardTitle>
          <CardDescription>
            Te avisan cuando tenés seguimientos vencidos. Se verifican cada 5 minutos mientras el CRM está abierto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationToggle />
        </CardContent>
      </Card>
    </div>
  );
}
