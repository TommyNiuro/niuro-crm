/* JobDescriptionRenderer: componente puro (sin estado, sin fetch).
 *
 * Renderiza una Descripción de Cargo ya parseada, en flujo natural (máx 3
 * páginas), con el diseño v2 (cards blancas + sombras + acentos navy, ver
 * jd-template.css). Lo usan la página print (PDF) y el preview del detalle.
 *
 * REGLA DURA: el análisis de viabilidad (Frankenstein) es interno. Este
 * componente NUNCA lo renderiza.
 *
 * Las prosas (pitch/about/roleObjective/whyCompany/conditionsClosing) pueden
 * traer <strong> de la IA: se renderizan con boldHtml (allowlist estricta, solo
 * <strong>/<em>) para permitir las negritas puntuales sin abrir XSS.
 *
 * No importa @/lib/job-descriptions (server-only). Se tipa con @/types.
 */
import type {
  JobDescriptionClient,
  JobDescriptionConditions,
  JobDescriptionProfile,
  JobDescriptionSuccessIndicator,
  JobDescriptionOnboarding,
} from "@/types";
import { NiuroLogo } from "@/components/proposals/NiuroLogo";

import "./jd-template.css";

export interface JdRenderData {
  client: JobDescriptionClient | null;
  roleTitle: string | null;
  pitch: string | null;
  conditions: JobDescriptionConditions | null;
  about: string | null;
  roleObjective: string | null;
  responsibilities: string[] | null;
  profile: JobDescriptionProfile | null;
  powerSkills: string[] | null;
  notLookingFor: string[] | null;
  whyCompany: string | null;
  conditionsClosing: string | null;
  benefits: string | null;
  startDate: string | null;
  successIndicators: JobDescriptionSuccessIndicator[] | null;
  onboarding: JobDescriptionOnboarding | null;
}

const PENDING = "(por confirmar)";

/* Allowlist estricta: escapa todo y restaura solo <strong>/<em>. Evita que un
 * output raro de la IA inyecte HTML arbitrario al usar dangerouslySetInnerHTML. */
function boldHtml(text: string): { __html: string } {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withTags = esc
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>")
    .replace(/&lt;em&gt;/g, "<em>")
    .replace(/&lt;\/em&gt;/g, "</em>");
  return { __html: withTags };
}

/* Prosa que puede venir en varios párrafos (doble salto de línea) con <strong>. */
function Prose({ text }: { text: string }) {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return null;
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={boldHtml(p)} />
      ))}
    </>
  );
}

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 42%, 30%)`;
}

function ClientMark({ client }: { client: JobDescriptionClient | null }) {
  const name = client?.name?.trim();
  if (client?.logoSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={client.logoSrc} alt={name ?? "Cliente"} className="jd-client-logo" />;
  }
  if (name) {
    const initial =
      client?.initial?.trim()?.charAt(0)?.toUpperCase() ?? name.charAt(0).toUpperCase();
    return (
      <div
        className="jd-client-avatar"
        style={{ background: client?.logoColor ?? hashColor(name) }}
        aria-label={name}
      >
        {initial}
      </div>
    );
  }
  return null;
}

function conditionCells(c: JobDescriptionConditions | null): { label: string; value: string }[] {
  if (!c) return [];
  const map: [keyof JobDescriptionConditions, string][] = [
    ["location", "Ubicación"],
    ["compensation", "Compensación"],
    ["dedication", "Dedicación"],
    ["modality", "Modalidad"],
    ["reportsTo", "Reporta a"],
    ["teamSize", "Equipo"],
  ];
  return map
    .filter(([k]) => c[k] && String(c[k]).trim())
    .map(([k, label]) => ({ label, value: String(c[k]) }));
}

export function JobDescriptionRenderer({ jd }: { jd: JdRenderData }) {
  const companyName = jd.client?.name?.trim() || "Empresa";
  const cells = conditionCells(jd.conditions);
  const responsibilities = jd.responsibilities?.filter((r) => r.trim()) ?? [];
  const powerSkills = jd.powerSkills?.filter((s) => s.trim()) ?? [];
  const notLookingFor = jd.notLookingFor?.filter((s) => s.trim()) ?? [];
  const stackMust = jd.profile?.stackMust?.filter((s) => s.trim()) ?? [];
  const stackNice = jd.profile?.stackNice?.filter((s) => s.trim()) ?? [];
  const indicators = jd.successIndicators?.filter((i) => i.axis?.trim() || i.meaning?.trim()) ?? [];
  const onboarding = jd.onboarding;

  // Condiciones como líneas etiquetadas (estilo CER): reusa la data de conditions
  // + inicio + beneficios. Solo las que tienen valor real.
  const condLines: { label: string; value: string }[] = [
    { label: "Compensación", value: jd.conditions?.compensation ?? "" },
    { label: "Modalidad", value: jd.conditions?.modality ?? "" },
    { label: "Dedicación", value: jd.conditions?.dedication ?? "" },
    { label: "Inicio", value: jd.startDate ?? "" },
    { label: "Beneficios", value: jd.benefits ?? "" },
  ].filter((c) => c.value.trim());

  return (
    <div className="jd-doc">
      {/* Portada / encabezado */}
      <div className="jd-head">
        <div className="jd-logos">
          <ClientMark client={jd.client} />
          <NiuroLogo />
        </div>
        <div className="eyebrow">Descripción de cargo</div>
        <h1 className="role-title">{jd.roleTitle?.trim() || PENDING}</h1>
        <div className="company-name">{companyName}</div>
      </div>

      {/* Pitch (gancho) */}
      {jd.pitch?.trim() && <p className="pitch" dangerouslySetInnerHTML={boldHtml(jd.pitch)} />}

      {/* Condiciones como cards */}
      {cells.length > 0 && (
        <div className="cond-cards">
          {cells.map((c) => (
            <div className="cond-card" key={c.label}>
              <div className="label">{c.label}</div>
              <div className="value">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sobre la empresa */}
      {jd.about?.trim() && (
        <div className="section keep">
          <h2>Sobre {companyName}</h2>
          <Prose text={jd.about} />
        </div>
      )}

      {/* El rol / objetivo */}
      {jd.roleObjective?.trim() && (
        <div className="section keep">
          <h2>El rol</h2>
          <Prose text={jd.roleObjective} />
        </div>
      )}

      {/* Indicadores de éxito (cards numeradas) */}
      {indicators.length > 0 && (
        <div className="section keep">
          <h2>Indicadores de éxito</h2>
          <div className="indicators">
            {indicators.map((ind, i) => (
              <div className="ind-card" key={i}>
                <span className="ind-num">{i + 1}</span>
                <div>
                  <div className="ind-axis">{ind.axis || `Eje ${i + 1}`}</div>
                  <div className="ind-meaning">{ind.meaning}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responsabilidades */}
      {responsibilities.length > 0 && (
        <div className="section">
          <h2>Responsabilidades</h2>
          <ul>
            {responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Perfil que buscamos */}
      {(jd.profile?.experience?.trim() || stackMust.length > 0 || stackNice.length > 0) && (
        <div className="section">
          <h2>Perfil que buscamos</h2>
          {jd.profile?.experience?.trim() && (
            <>
              <div className="subhead">Experiencia</div>
              <p>{jd.profile.experience}</p>
            </>
          )}
          {stackMust.length > 0 && (
            <>
              <div className="subhead">Stack indispensable</div>
              <div className="chips">
                {stackMust.map((s, i) => (
                  <span className="chip" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
          {stackNice.length > 0 && (
            <div className="keep">
              <div className="subhead">Deseable (no excluyente)</div>
              <div className="chips">
                {stackNice.map((s, i) => (
                  <span className="chip nice" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Power skills */}
      {powerSkills.length > 0 && (
        <div className="section">
          <h2>Power skills</h2>
          <ul className={powerSkills.every((s) => s.length < 60) ? "cols" : undefined}>
            {powerSkills.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Qué NO buscamos */}
      {notLookingFor.length > 0 && (
        <div className="section no-block">
          <h2>Qué no buscamos</h2>
          <ul>
            {notLookingFor.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Por qué [empresa] (panel destacado) */}
      {jd.whyCompany?.trim() && (
        <div className="section why-panel keep">
          <h2>Por qué {companyName}</h2>
          <Prose text={jd.whyCompany} />
        </div>
      )}

      {/* Onboarding 30/60/90 (opcional) */}
      {onboarding && (onboarding.d30 || onboarding.d60 || onboarding.d90) && (
        <div className="section keep">
          <h2>Onboarding 30 / 60 / 90</h2>
          <table className="jd-table">
            <thead>
              <tr>
                <th>Primeros 30 días</th>
                <th>60 días</th>
                <th>90 días</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{onboarding.d30 || PENDING}</td>
                <td>{onboarding.d60 || PENDING}</td>
                <td>{onboarding.d90 || PENDING}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Condiciones (labels en negrita) + línea contractual Niuro (texto fijo) */}
      <div className="section keep">
        <h2>Condiciones</h2>
        {condLines.length > 0 ? (
          <div className="cond-lines">
            {condLines.map((c) => (
              <p key={c.label}>
                <strong>{c.label}:</strong> {c.value}
              </p>
            ))}
          </div>
        ) : jd.conditionsClosing?.trim() ? (
          <Prose text={jd.conditionsClosing} />
        ) : (
          <p className="muted">{PENDING}</p>
        )}
        <div className="niuro-line">
          Contrato y relación laboral gestionados por <strong>Niuro</strong>. El talento se integra
          100% al equipo de {companyName}. Niuro gestiona contrato, nómina, vacaciones y compliance.
        </div>
      </div>
    </div>
  );
}
