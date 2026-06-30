/* Equipo propuesto. Dos formatos segun mode:
 *  - staff-aug: tabla 3 cols (Rol | Responsabilidades | Valor mensual)
 *  - sprint:    tabla 3 cols (Rol/Perfil | Responsabilidades | Participacion)
 */
import type { ProposalRenderData, TeamMember } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { defaultTeamStaff, defaultTeamSprint } from "../defaults";

type Props = { proposal: ProposalRenderData };

function StaffRow({ t }: { t: TeamMember }) {
  const responsibilities = Array.isArray(t.responsibilities)
    ? t.responsibilities
    : [t.responsibilities];
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
          {t.valueMain ?? ""}
        </div>
        {t.valueMainNote && <div className="text-xs text-muted">{t.valueMainNote}</div>}
        {t.valueAlt && (
          <>
            <div style={{ margin: "6px 0", borderTop: "1px solid var(--bord-soft)" }} />
            <div className="bold" style={{ color: "var(--cobalt)", fontSize: "13px" }}>
              {t.valueAlt}
            </div>
            {t.valueAltNote && (
              <div className="text-xs text-muted">{t.valueAltNote}</div>
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
            isSprint ? <SprintRow key={i} t={t} /> : <StaffRow key={i} t={t} />,
          )}
        </tbody>
      </table>
    </>
  );
}
