/* Pricing + condiciones comerciales.
 *  - staff-aug: tabla de condiciones + clausula de absorcion 17%.
 *  - sprint:    pricing-box navy con gradiente gold + tabla de hitos de pago.
 */
import type { ProposalRenderData, Milestone } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons, Icons } from "../icons";
import { Pending } from "../Pending";
import { PENDING_LABEL, fmtAmount } from "../utils";
import { formatDateES } from "../format";

type Props = { proposal: ProposalRenderData };

/* ---------- STAFF AUG ---------- */
function StaffPricing({ proposal }: Props) {
  const pricing = proposal.pricing ?? { currency: "CLP" };
  const currency = pricing.currency ?? "CLP";
  const min = pricing.monthlyMin;
  const max = pricing.monthlyMax;
  const pricingDisplay = min
    ? max && max !== min && max > min
      ? `${fmtAmount(min, currency)} a ${fmtAmount(max, currency)} + IVA`
      : `${fmtAmount(min, currency)} + IVA`
    : PENDING_LABEL;

  // Clausula de absorcion: SOLO se renderiza si pricing.absorption.enabled.
  const absorption = pricing.absorption;
  const absorptionEnabled = absorption?.enabled === true;
  const installments = absorption?.installments ?? 1;

  const paymentForm =
    installments === 1
      ? "en una sola exhibicion"
      : installments === 3
        ? "pagadero en 3 cuotas mensuales iguales"
        : "pagadero en 5 cuotas mensuales iguales";

  const annualized = min ? min * 12 : null;
  const comp = annualized ? Math.round(annualized * 0.17) : null;
  const perInstallment =
    comp && installments > 1 ? Math.round(comp / installments) : null;

  return (
    <>
      <SectionTitle icon={SectionIcons.terms}>Condiciones comerciales</SectionTitle>
      <table>
        <thead>
          <tr>
            <th style={{ width: "20%" }}>Topico</th>
            <th style={{ width: "45%" }}>Detalle</th>
            <th style={{ width: "15%" }}>Inicio</th>
            <th style={{ width: "20%" }}>Notas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="bold">Duracion sugerida</div>
              <div className="text-xs text-muted">12 meses renovables</div>
            </td>
            <td>
              <ul>
                <li>Contratacion inicial de 12 meses por la criticidad del rol.</li>
                <li>
                  La continuidad puede extenderse segun performance y necesidad del
                  negocio.
                </li>
              </ul>
            </td>
            <td>
              <strong>Inmediato</strong>
            </td>
            <td>Recomendacion comercial</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Modalidad</div>
              <div className="text-xs text-muted">Full-time dedicado</div>
            </td>
            <td>
              <ul>
                <li>
                  Dedicacion mensual renovable bajo estructura de staff augmentation.
                </li>
                <li>
                  Esquema final de presencialidad: <Pending />.
                </li>
              </ul>
            </td>
            <td>
              <strong>Semana 1</strong>
            </td>
            <td>A validar con cliente</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Onboarding</div>
              <div className="text-xs text-muted">Primeros dias</div>
            </td>
            <td>
              <ul>
                <li>
                  Contexto de negocio, accesos, repositorios y alineacion con
                  stakeholders.
                </li>
                <li>Definicion de prioridades y forma de trabajo desde el arranque.</li>
              </ul>
            </td>
            <td>
              <strong>Semana 1</strong>
            </td>
            <td>Depende de accesos</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Facturacion</div>
              <div className="text-xs text-muted">Mensual</div>
            </td>
            <td>
              <ul>
                <li>Facturacion via Niuro Chile o Niuro Mexico segun corresponda.</li>
                <li>
                  Valor mensual segun perfil finalmente seleccionado. Display:{" "}
                  {pricingDisplay}.
                </li>
              </ul>
            </td>
            <td>
              <strong>Fin de mes</strong>
            </td>
            <td>Contrato corporativo</td>
          </tr>
        </tbody>
      </table>

      {absorptionEnabled ? (
        <div className="special-card">
          <div className="card-header">
            <div className="card-icon">{Icons.fileSign}</div>
            <h3>Clausula de incorporacion directa al payroll</h3>
          </div>
          <p>
            En caso de que el Cliente desee incorporar directamente al perfil provisto
            por Niuro a su plantilla (payroll), se requiere cumplir las siguientes
            condiciones de manera previa e ineludible:
          </p>
          <ul style={{ marginTop: "8px" }}>
            <li>
              <strong>(a)</strong> Haber completado un minimo de{" "}
              <strong>6 meses de servicio activo</strong> bajo el presente acuerdo.
            </li>
            <li>
              <strong>(b)</strong> Notificar a Niuro con al menos{" "}
              <strong>30 dias de anticipacion</strong> por escrito.
            </li>
            <li>
              <strong>(c)</strong> Pagar una compensacion equivalente al{" "}
              <strong>17% del valor anualizado del contrato vigente</strong> para ese
              perfil, calculado sobre la tarifa mensual al momento de la solicitud,{" "}
              {paymentForm}.
            </li>
            <li>
              <strong>(d)</strong> La incorporacion solo podra formalizarse una vez que
              Niuro haya recibido y confirmado el pago
              {installments > 1 ? " completo de las cuotas acordadas" : ""}. No hay
              posibilidad de transicion al payroll mientras la compensacion este
              pendiente.
            </li>
          </ul>
          <p style={{ marginTop: "8px" }}>
            Esta clausula aplica sin limite de tiempo mientras el perfil sea provisto por
            Niuro. No existe ningun periodo despues del cual la incorporacion directa sea
            posible sin compensacion.
          </p>
          {min && annualized && comp && (
            <div style={{ marginTop: "10px" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  marginBottom: "5px",
                  color: "#111827",
                }}
              >
                Ejemplo aplicado (base referencial {fmtAmount(min, currency)} / mes):
              </div>
              <ul>
                <li>Tarifa mensual referencial: {fmtAmount(min, currency)}</li>
                <li>Valor anualizado del contrato: {fmtAmount(annualized, currency)}</li>
                <li>
                  Compensacion por absorcion (17%):{" "}
                  <strong>{fmtAmount(comp, currency)}</strong>
                </li>
                <li>
                  Forma de pago:{" "}
                  <strong>
                    {installments === 1
                      ? "una sola exhibicion"
                      : `${installments} cuotas mensuales iguales de ${fmtAmount(perInstallment ?? 0, currency)}`}
                  </strong>
                </li>
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

/* ---------- SPRINT ---------- */
function SprintPricing({ proposal }: Props) {
  const pricing = proposal.pricing ?? { currency: "USD" };
  const currency = pricing.currency ?? "USD";
  const total = pricing.total;
  const startDate = pricing.startDate ? formatDateES(pricing.startDate) : PENDING_LABEL;
  const milestones: Milestone[] =
    pricing.milestones && pricing.milestones.length > 0
      ? pricing.milestones
      : [
          { date: null, amount: null, note: "Setup fee · 20%" },
          { date: null, amount: null, note: "Cuota 1" },
          { date: null, amount: null, note: "Cuota 2" },
          { date: null, amount: null, note: "Cuota final · entrega" },
        ];

  const pricingDisplay = total ? fmtAmount(total, currency) + " + IVA" : PENDING_LABEL;
  const duration = proposal.duration ?? PENDING_LABEL;

  return (
    <>
      <div className="pricing-box">
        <div>
          <div className="pricing-text">{"// inversion total del sprint"}</div>
          <div className="pricing-sub" style={{ fontSize: "10px" }}>
            {proposal.deliverablesShort ?? PENDING_LABEL + " (entregables incluidos)"}
          </div>
          <div className="pricing-hint" style={{ fontSize: "9px", marginTop: "2px" }}>
            Pagos por hitos:{" "}
            {milestones
              .map((m) => {
                const dt = m.date ? formatDateES(m.date) : PENDING_LABEL;
                const amt = m.amount ? fmtAmount(m.amount, currency) : PENDING_LABEL;
                return `${dt} (${amt})`;
              })
              .join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="pricing-price">{pricingDisplay}</div>
          <div className="pricing-iva">+ IVA si aplica</div>
        </div>
      </div>

      <SectionTitle icon={SectionIcons.terms}>Condiciones comerciales</SectionTitle>
      <table>
        <thead>
          <tr>
            <th style={{ width: "20%" }}>Topico</th>
            <th style={{ width: "45%" }}>Detalle</th>
            <th style={{ width: "15%" }}>Fechas</th>
            <th style={{ width: "20%" }}>Notas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="bold">Modelo</div>
              <div className="text-xs mt-1">Project Sprint</div>
            </td>
            <td>
              <ul>
                <li>Consultoria cerrada por entregables.</li>
                <li>Inversion total: {pricingDisplay}.</li>
              </ul>
            </td>
            <td>{duration}</td>
            <td>Precio Fijo</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Arranque</div>
              <div className="text-xs mt-1">Inicio Oficial</div>
            </td>
            <td>
              <ul>
                <li>Fecha confirmada de inicio de operaciones.</li>
                <li>Setup tecnico completo y kick-off.</li>
              </ul>
            </td>
            <td>{startDate}</td>
            <td>Kick-off</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Hitos de Pago</div>
              <div className="text-xs mt-1">Desglose</div>
            </td>
            <td>
              <ul>
                {milestones.map((m, i) => (
                  <li key={i}>
                    {m.date ? formatDateES(m.date) : PENDING_LABEL}:{" "}
                    {m.amount ? fmtAmount(m.amount, currency) : PENDING_LABEL} ({m.note}
                    ).
                  </li>
                ))}
              </ul>
            </td>
            <td>Mensual</td>
            <td>Transferencia</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Facturacion</div>
              <div className="text-xs mt-1">Niuro Chile / Mexico</div>
            </td>
            <td>
              <ul>
                <li>Operacion facturada desde Niuro Chile o Niuro Mexico.</li>
                <li>
                  Dirigida a la razon social del cliente confirmada en el contrato.
                </li>
              </ul>
            </td>
            <td>Segun hitos</td>
            <td>+ IVA si aplica</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Continuidad</div>
              <div className="text-xs mt-1">Transicion opcional</div>
            </td>
            <td>
              <ul>
                <li>Al finalizar el sprint, opcion de pasar a Staff Augmentation.</li>
                <li>Mismo equipo tecnico para mantenimiento continuo.</li>
              </ul>
            </td>
            <td>Post-Sprint</td>
            <td>Sin friccion</td>
          </tr>
          <tr>
            <td>
              <div className="bold">Confidencialidad</div>
              <div className="text-xs mt-1">NDA</div>
            </td>
            <td>
              <ul>
                <li>Firma de NDA con representante legal del cliente.</li>
                <li>Proteccion estricta de propiedad intelectual y datos.</li>
              </ul>
            </td>
            <td>Previo inicio</td>
            <td>Obligatorio</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export function PricingSection({ proposal }: Props) {
  return proposal.mode === "sprint" ? (
    <SprintPricing proposal={proposal} />
  ) : (
    <StaffPricing proposal={proposal} />
  );
}
