/* Grid 2 columnas de cards. Replica .grid-2 + .card de proposal-template.css.
 * Usado por Objectives (2x2), Scope (2x3) y Governance (2x2).
 * Para Risks usar RisksSection (variante .special-card).
 *
 * Marca el <p> con data-wc-warn cuando body > 32 palabras (fondo amber suave
 * via CSS).
 */
import type { Card } from "../render-types";
import { iconFor } from "../icons";
import { countWords } from "../utils";
import { sanitizeInlineHtml } from "../format";

type Props = {
  cards: Card[];
  /** Catalogo de iconos a usar (objective | scope | governance). */
  iconSet: "objective" | "scope" | "governance";
};

export function CardGrid({ cards, iconSet }: Props) {
  return (
    <div className="grid-2">
      {cards.map((c, i) => {
        const wc = countWords(c.body);
        const warn = wc > 32 ? "1" : undefined;
        return (
          <div key={i} className="card">
            <div className="card-header">
              <div className="card-icon">{iconFor(iconSet, i)}</div>
              <h3 dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(c.title) }} />
            </div>
            <p
              data-wc-warn={warn}
              data-wc={wc}
              dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(c.body) }}
            />
            {c.pill && <span className="tag-pill">{c.pill}</span>}
          </div>
        );
      })}
    </div>
  );
}
