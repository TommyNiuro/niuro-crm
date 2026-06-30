/* Roadmap como <table>. 4 tramos: tramo | enfoque | actividades | hitos.
 * Headers en parchment, body en paper.
 */
import type { ProposalRenderData } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { defaultRoadmapStaff, defaultRoadmapSprint } from "../defaults";

type Props = { proposal: ProposalRenderData };

export function RoadmapSection({ proposal }: Props) {
  const rows =
    proposal.roadmap && proposal.roadmap.length > 0
      ? proposal.roadmap
      : proposal.mode === "sprint"
        ? defaultRoadmapSprint()
        : defaultRoadmapStaff();

  const title =
    proposal.mode === "sprint"
      ? "Roadmap de Ejecucion (Plan 30/60/90 dias)"
      : "Roadmap de Ejecucion (30 / 60 / 90 dias)";

  const lastColLabel = proposal.mode === "sprint" ? "Entregables" : "Hitos";

  return (
    <>
      <SectionTitle icon={SectionIcons.roadmap}>{title}</SectionTitle>
      <table>
        <thead>
          <tr>
            <th style={{ width: "15%" }}>Tramo</th>
            <th style={{ width: "22%" }}>Enfoque</th>
            <th style={{ width: "43%" }}>Actividades clave</th>
            <th style={{ width: "20%" }}>{lastColLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <div className="bold">{r.period}</div>
                <div className="text-xs text-muted">{r.label}</div>
              </td>
              <td>{r.focus}</td>
              <td>
                <ul>
                  {(proposal.mode === "sprint"
                    ? r.activities
                    : r.activities.slice(0, 2)
                  ).map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
              </td>
              <td>
                <div className="tag-pill">{r.milestone}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
