"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AccountSection } from "@/components/shared/AccountSection";

export default function CuentaSettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Cuenta</h2>
        <p className="text-sm text-muted-foreground">Email, contraseña y sesión de esta instalación.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tu cuenta</CardTitle>
          <CardDescription>Una cuenta por instalación; los datos nunca salen de tu máquina.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSection />
        </CardContent>
      </Card>
    </div>
  );
}
