/* Equipo propuesto. Dos formatos segun mode:
 *  - staff-aug: tabla 3 cols (Rol | Responsabilidades | Valor mensual)
 *  - sprint:    tabla 3 cols (Rol/Perfil | Responsabilidades | Participacion)
 */
import type { ProposalRenderData, TeamMember } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { defaultTeamStaff, defaultTeamSprint } from "../defaults";
import { fmtAmount, PENDING_LABEL } from "../utils";

type Props = { proposal: ProposalRenderData };

/* Valor mensual del miembro. La IA NO genera value* por miembro (su schema es
 * role/stack/modality/responsibilities), asi que sin este derive la columna
 * "Valor mensual" salia SIEMPRE vacia en propuestas generadas. Prioridad:
 * valueMain explicito del miembro (ediciones manuales / datos migrados) y, si
 * no hay, el pricing global de la propuesta (base referencial + "hasta X" si
 * hay rango, mismo formato que los PDF de referencia). */
function staffValue(t: TeamMember, pricing: ProposalRenderData["pricing"]) {
  if (t.valueMain) {
    return { main: t.valueMain, mainNote: t.valueMainNote, alt: t.valueAlt, altNote: t.valueAltNote };
  }
  const currency = pricing?.currency ?? "USD";
  const min = pricing?.monthlyMin;
  const max = pricing?.monthlyMax;
  if (!min) return { main: PENDING_LABEL as string, mainNote: undefined, alt: undefined, altNote: undefined };
  if (max && max > min) {
    return {
      main: `${fmtAmount(min, currency)} + IVA`,
      mainNote: "/ mes (base referencial)",
      alt: `Hasta ${fmtAmount(max, currency)} + IVA`,
      altNote: "/ mes (segun perfil final)",
    };
  }
  return { main: `${fmtAmount(min, currency)} + IVA`, mainNote: "/ mes", alt: undefined, altNote: undefined };
}

function StaffRow({ t, pricing }: { t: TeamMember; pricing: ProposalRenderData["pricing"] }) {
  const responsibilities = Array.isArray(t.responsibilities)
    ? t.responsibilities
    : [t.responsibilities];
  const value = staffValue(t, pricing);
  return (
    <tr>
      <td>
        <div className="bold">{t.role}</div>
        {t.stack && <div className="text-xs text-muted mt-1">{t.stack}</div>}
        {t.modality && <div className="text-xs text-muted mt-1">{t.modality}</div>}
        <span className="tag-pill mt-1">Rol critico</span>
      </td>
      <td>
        <ul>
          {responsibilities.slice(0, 4).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </td>
      <td>
        <div className="bold" style={{ color: "var(--cobalt)", fontSize: "13px" }}>
          {value.main}
        </div>
        {value.mainNote && <div className="text-xs text-muted">{value.mainNote}</div>}
        {value.alt && (
          <>
            <div style={{ margin: "6px 0", borderTop: "1px solid var(--bord-soft)" }} />
            <div className="bold" style={{ color: "var(--cobalt)", fontSize: "13px" }}>
              {value.alt}
            </div>
            {value.altNote && (
              <div className="text-xs text-muted">{value.altNote}</div>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function SprintRow({ t }: { t: TeamMember }) {
  const responsibilitiesText = Array.isArray(t.responsibilities)
    ? t.responsibilities.join(" ")
    : t.responsibilities;
  return (
    <tr>
      <td>
        <div className="bold">{t.name ?? t.role}</div>
        {t.email && <div className="text-xs text-muted mt-1">{t.email}</div>}
        <span className="tag-pill mt-1">{t.role}</span>
      </td>
      <td>{responsibilitiesText}</td>
      <td>
        <div className="bold" style={{ color: "#4b5563" }}>
          {t.participation ?? ""}
        </div>
        {t.participationNote && (
          <div className="text-xs text-muted mt-1">{t.participationNote}</div>
        )}
      </td>
    </tr>
  );
}

export function TeamSection({ proposal }: Props) {
  const team =
    proposal.team && proposal.team.length > 0
      ? proposal.team
      : proposal.mode === "sprint"
        ? defaultTeamSprint()
        : defaultTeamStaff(proposal);

  const isSprint = proposal.mode === "sprint";

  return (
    <>
      <SectionTitle icon={SectionIcons.team}>
        {isSprint ? "Equipo del Sprint" : "Equipo propuesto"}
      </SectionTitle>
      <table>
        <thead>
          <tr>
            {isSprint ? (
              <>
                <th style={{ width: "25%" }}>Rol / Perfil</th>
                <th style={{ width: "55%" }}>Responsabilidades</th>
                <th style={{ width: "20%" }}>Participacion</th>
              </>
            ) : (
              <>
                <th style={{ width: "30%" }}>Rol</th>
                <th style={{ width: "50%" }}>Responsabilidades</th>
                <th style={{ width: "20%" }}>Valor mensual</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {team.map((t, i) =>
            isSprint ? (
              <SprintRow key={i} t={t} />
            ) : (
              <StaffRow key={i} t={t} pricing={proposal.pricing} />
            ),
          )}
        </tbody>
      </table>
    </>
  );
}
