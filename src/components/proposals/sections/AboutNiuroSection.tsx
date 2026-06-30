/* Seccion estatica con disclaimer parchment segun mode. */
import type { ProposalRenderData } from "../render-types";
import { formatDateES } from "../format";
import { PENDING_LABEL } from "../utils";

type Props = { proposal: ProposalRenderData };

export function AboutNiuroSection({ proposal }: Props) {
  const startDate =
    proposal.mode === "sprint" && proposal.pricing?.startDate
      ? formatDateES(proposal.pricing.startDate)
      : PENDING_LABEL;

  const disclaimer =
    proposal.mode === "sprint"
      ? `El cronograma asume la entrega de accesos clave antes del ${startDate}, la disponibilidad oportuna del equipo del cliente para kick-off y check-ins semanales, y la firma de NDA previo al inicio. Cualquier requerimiento no descrito explicitamente en el alcance se considerara un cambio de alcance y podra extender el plazo o requerir cotizacion adicional. El equipo de Niuro se compromete a la entrega del producto bajo el modelo de Project Sprint acordado.`
      : `Esta propuesta esta sujeta a dependencias del cliente, incluyendo entrega oportuna de accesos, definicion del esquema operativo esperado, feedback agil y disponibilidad de los stakeholders clave para entrevistas, onboarding y seguimiento. Cualquier alcance fuera del servicio de staff augmentation (perfiles adicionales, cambios sustantivos de alcance o requerimientos no contemplados en esta propuesta) se cotizara por separado.`;

  return (
    <div className="disclaimer">
      <p>{disclaimer}</p>
    </div>
  );
}
