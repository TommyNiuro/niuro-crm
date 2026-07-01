import { Skeleton } from "@/components/ui/skeleton";

// auditoria SaaS 2026-07-01: ningun segmento tenia loading.tsx propio (usaban
// skeletons manuales por componente); este es el fallback generico de Next
// mientras un segmento sin su propio loading.tsx suspende.
export default function Loading() {
  return (
    <div className="p-6 space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
