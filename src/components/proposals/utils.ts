/* Helpers compartidos por el ProposalRenderer.
 * Port de propuestas-niuro/src/components/proposal/utils.ts.
 */
import { formatCurrency } from "./format";

export const PENDING_LABEL = "Pendiente por confirmar";

export function orPending(value: string | null | undefined): string {
  return value && String(value).trim() ? value : PENDING_LABEL;
}

export function isPendingValue(v: string | null | undefined): boolean {
  return !(v && String(v).trim());
}

export function fmtAmount(
  n: number | null | undefined,
  currency: string,
): string {
  if (n == null) return PENDING_LABEL;
  return formatCurrency(n, currency);
}

/* Cuenta palabras "visibles" (sin HTML, sin tokens de markup). */
export function countWords(text: string): number {
  const stripped = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}
