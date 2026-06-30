import { Construction } from "lucide-react";

export function ComingSoon({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase?: string;
}) {
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      <div className="mt-8 border border-dashed border-border rounded-xl p-12 text-center bg-card">
        <Construction className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="font-medium">En construcción</p>
        <p className="text-sm text-muted-foreground mt-1">
          Este módulo se conecta a tus datos reales {phase ? `en ${phase}` : "pronto"}.
        </p>
      </div>
    </div>
  );
}
