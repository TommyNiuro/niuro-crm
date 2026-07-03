"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default function AparienciaSettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Apariencia</h2>
        <p className="text-sm text-muted-foreground">Tema del CRM.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tema</CardTitle>
          <CardDescription>Claro u oscuro.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
