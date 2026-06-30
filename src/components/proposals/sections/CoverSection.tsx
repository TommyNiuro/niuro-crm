/* Cover header (logo cliente + logo Niuro + titulo del rol/sprint + fecha).
 * Avatar circular con color hash + inicial cuando no hay logoSrc, eyebrow
 * JetBrains Mono, titulo Fraunces, fecha mono.
 */
import type { ProposalRenderData } from "../render-types";
import { NiuroLogo } from "../NiuroLogo";
import { PENDING_LABEL } from "../utils";
import { Pending } from "../Pending";

type Props = { proposal: ProposalRenderData };

/* Hash deterministico nombre -> HSL navy/cobalt-aware. */
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 38%, 28%)`;
}

function ClientLogo({ client }: { client: ProposalRenderData["client"] }) {
  const name = client?.name?.trim();
  if (client?.logoSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={client.logoSrc}
        alt={name ?? "Cliente"}
        className="logo-client"
        style={{ height: "56px", width: "auto", objectFit: "contain" }}
      />
    );
  }
  if (name) {
    const initial =
      client?.initial?.trim()?.charAt(0)?.toUpperCase() ??
      name.charAt(0).toUpperCase();
    const bg = client?.logoColor ?? hashColor(name);
    return (
      <div className="logo-client-avatar" style={{ background: bg }} aria-label={name}>
        {initial}
      </div>
    );
  }
  return (
    <div className="logo-client">
      <div className="placeholder">Logo cliente</div>
    </div>
  );
}

export function CoverSection({ proposal }: Props) {
  const { mode, client, role, duration, date } = proposal;
  const industry = client?.industry;
  const country = client?.country;
  const clientName = client?.name;

  const eyebrowLabel = mode === "sprint" ? "Project Sprint" : "Staff Augmentation";

  const subParts = [
    industry,
    country,
    mode === "sprint" ? duration : null,
  ].filter((s): s is string => Boolean(s && s.trim()));

  return (
    <>
      <div className="header">
        <ClientLogo client={client} />
        <NiuroLogo />
      </div>
      <div className="doc-title">
        <div className="eyebrow">
          Propuesta comercial · {eyebrowLabel}
          {date ? ` · ${date}` : ""}
        </div>
        <h1 className="doc-title-name">
          {mode === "sprint" ? (
            <>
              Sprint <em>para {clientName ?? <Pending />}</em>
            </>
          ) : role ? (
            <>
              {role}
              <br />
              <em>para {clientName ?? PENDING_LABEL}</em>
            </>
          ) : (
            <>
              Una propuesta hecha <em>para {clientName ?? PENDING_LABEL}</em>
            </>
          )}
        </h1>
        {subParts.length > 0 && <div className="sub">{subParts.join(" · ")}</div>}
      </div>
    </>
  );
}
