import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// auditoria SaaS 2026-07-01: ningun segmento tenia not-found.tsx propio.
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Pagina no encontrada</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        La pagina que buscas no existe o se movio.
      </p>
      <Link href="/" className={buttonVariants({ className: "cursor-pointer" })}>
        Volver al inicio
      </Link>
    </div>
  );
}
