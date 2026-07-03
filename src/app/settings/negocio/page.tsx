"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BusinessForm } from "@/components/settings/BusinessForm";

export default function NegocioSettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Negocio</h2>
        <p className="text-sm text-muted-foreground">
          La identidad de tu CRM: la usan la IA para redactar, el digest y las propuestas.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidad y meta</CardTitle>
          <CardDescription>La meta MRR mueve las barras del Inicio y de Analítica.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessForm />
        </CardContent>
      </Card>
    </div>
  );
}
