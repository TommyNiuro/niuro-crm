import { PENDING_LABEL } from "./utils";

/** Highlight visual de campos que el rep aun no confirmo.
 * Renderiza el `<span class="pending">` definido en proposal-template.css.
 */
export function Pending() {
  return <span className="pending">{PENDING_LABEL}</span>;
}

/** Renderiza el valor si existe, o el highlight Pending si no. */
export function OrPending({ value }: { value: string | null | undefined }) {
  if (value && String(value).trim()) return <>{value}</>;
  return <Pending />;
}
