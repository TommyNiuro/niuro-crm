"use client";

/* Editor de contenido in-place de una propuesta YA generada. Permite tocar a
 * mano el texto (summary, contexto, cards, roadmap, equipo, riesgos) SIN
 * regenerar con IA. Persiste por PUT /api/proposals/[id] (que acepta los campos
 * JSON como objeto). Las listas de strings (dataPoints, activities,
 * responsibilities) se editan como textarea, una por linea.
 *
 * Permite agregar y quitar items de cada lista (cards, roadmap, equipo,
 * riesgos), de modo que una seccion que la IA dejo vacia se puede poblar a mano
 * sin tener que Regenerar. Cubre los gaps A.4 y M4 del audit. */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ProposalCard,
  ProposalCards,
  ProposalContext,
  ProposalRoadmapPhase,
  ProposalRisk,
} from "@/types";
// El equipo se edita con el shape de RENDER (TeamMember), mas rico que el
// persistido ProposalTeamMember: incluye los campos sprint (name/email/
// participation/participationNote) y acepta responsibilities como string.
import type { TeamMember } from "./render-types";

export interface EditableProposal {
  id?: string;
  /** Modo de la propuesta: condiciona los campos editables del equipo. */
  mode?: string | null;
  summary?: string | null;
  context?: ProposalContext | null;
  cards?: ProposalCards | null;
  roadmap?: ProposalRoadmapPhase[] | null;
  team?: TeamMember[] | null;
  risks?: ProposalRisk[] | null;
}

/* Key estable local. Cada item editable lleva un _key (crypto.randomUUID) SOLO
 * en memoria, para usarlo como React key con add/remove sin colisiones de
 * indice. Se STRIPEA antes de guardar (PUT) para no persistirlo en la DB. Estos
 * tipos locales extienden los globales con _key; no tocamos src/types. */
type Keyed<T> = T & { _key: string };
type KeyedCard = Keyed<ProposalCard>;
type KeyedPhase = Keyed<ProposalRoadmapPhase>;
type KeyedMember = Keyed<TeamMember>;
type KeyedRisk = Keyed<ProposalRisk>;
interface KeyedCards {
  objective: KeyedCard[];
  scope: KeyedCard[];
  governance: KeyedCard[];
}

const withKey = <T,>(item: T): Keyed<T> => ({ ...item, _key: crypto.randomUUID() });
// Quita _key de un item para el payload del PUT (no se persiste en la DB).
const stripKey = <T extends { _key: string }>(item: T): Omit<T, "_key"> => {
  const { _key, ...rest } = item;
  void _key;
  return rest;
};

type Props = {
  proposal: EditableProposal;
  onSaved: (updated: unknown) => void;
  onCancel: () => void;
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground";
const areaCls = inputCls + " resize-y min-h-[64px]";
const labelCls = "block text-[12px] font-medium text-muted-foreground mb-1";

function lines(arr: string[] | string | undefined | null): string {
  // Sprint guarda responsibilities como string (parrafo); staff como string[].
  if (typeof arr === "string") return arr;
  return (arr ?? []).join("\n");
}
function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline cursor-pointer"
    >
      <Plus className="h-3.5 w-3.5" /> Agregar
    </button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute top-2 right-2 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function EmptyHint() {
  return (
    <p className="text-[12px] text-muted-foreground italic">
      Sin items. Usa Agregar para poblar esta seccion a mano.
    </p>
  );
}

export function ProposalContentEditor({ proposal, onSaved, onCancel }: Props) {
  const [saving, setSaving] = useState(false);

  // Estado editable inicializado desde la propuesta (defaults seguros si null).
  const [summary, setSummary] = useState(proposal.summary ?? "");
  const [paragraph, setParagraph] = useState(proposal.context?.paragraph ?? "");
  const [dataPoints, setDataPoints] = useState(lines(proposal.context?.dataPoints));
  // Hidratamos cada item con un _key estable al inicializar desde la propuesta.
  const [cards, setCards] = useState<KeyedCards>({
    objective: (proposal.cards?.objective ?? []).map(withKey),
    scope: (proposal.cards?.scope ?? []).map(withKey),
    governance: (proposal.cards?.governance ?? []).map(withKey),
  });
  const [roadmap, setRoadmap] = useState<KeyedPhase[]>((proposal.roadmap ?? []).map(withKey));
  const [team, setTeam] = useState<KeyedMember[]>((proposal.team ?? []).map(withKey));
  const [risks, setRisks] = useState<KeyedRisk[]>((proposal.risks ?? []).map(withKey));

  const setCard = (
    group: keyof ProposalCards,
    i: number,
    patch: Partial<ProposalCard>,
  ) =>
    setCards((c) => ({
      ...c,
      [group]: c[group].map((card, idx) => (idx === i ? { ...card, ...patch } : card)),
    }));

  const setPhase = (i: number, patch: Partial<ProposalRoadmapPhase>) =>
    setRoadmap((r) => r.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const setMember = (i: number, patch: Partial<TeamMember>) =>
    setTeam((t) => t.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const setRisk = (i: number, patch: Partial<ProposalRisk>) =>
    setRisks((r) => r.map((rk, idx) => (idx === i ? { ...rk, ...patch } : rk)));

  // Add / remove de items por lista: una seccion vacia se puede poblar a mano.
  // Al CREAR un item le adjuntamos un _key estable (withKey).
  const addCard = (group: keyof ProposalCards) =>
    setCards((c) => ({ ...c, [group]: [...c[group], withKey({ title: "", body: "" })] }));
  const removeCard = (group: keyof ProposalCards, i: number) =>
    setCards((c) => ({ ...c, [group]: c[group].filter((_, idx) => idx !== i) }));

  const addPhase = () =>
    setRoadmap((r) => [
      ...r,
      withKey({ period: "", label: "", focus: "", activities: [], milestone: "" }),
    ]);
  const removePhase = (i: number) =>
    setRoadmap((r) => r.filter((_, idx) => idx !== i));

  // Modo de la propuesta: sprint expone name/email/participation; staff usa
  // stack/modality/responsibilities[]. Espeja los dos formatos de TeamSection.
  const isSprintTeam = proposal.mode === "sprint";
  const addMember = () =>
    setTeam((t) => [
      ...t,
      withKey(
        isSprintTeam
          ? {
              role: "",
              name: "",
              email: "",
              responsibilities: "",
              participation: "",
              participationNote: "",
            }
          : { role: "", stack: "", modality: "", responsibilities: [] },
      ),
    ]);
  const removeMember = (i: number) =>
    setTeam((t) => t.filter((_, idx) => idx !== i));

  const addRisk = () => setRisks((r) => [...r, withKey({ title: "", body: "" })]);
  const removeRisk = (i: number) => setRisks((r) => r.filter((_, idx) => idx !== i));

  async function save() {
    if (!proposal.id || saving) return;
    setSaving(true);
    try {
      // Strip _key de cada item antes de persistir: es solo una key de React en
      // memoria, no debe escribirse en la DB.
      const cleanCards = {
        objective: cards.objective.map(stripKey),
        scope: cards.scope.map(stripKey),
        governance: cards.governance.map(stripKey),
      };
      const payload = {
        summary,
        context: { paragraph, dataPoints: toLines(dataPoints) },
        // Preservar claves extra del objeto cards original (ej. badges, que
        // toRenderData lee de cards.badges): el editor solo gestiona
        // objective/scope/governance, pero el PUT pisa la columna cards entera.
        cards: { ...((proposal.cards ?? {}) as Record<string, unknown>), ...cleanCards },
        roadmap: roadmap.map(stripKey),
        team: team.map(stripKey),
        risks: risks.map(stripKey),
      };
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo guardar el contenido");
      toast.success("Contenido actualizado");
      onSaved(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const cardGroup = (group: keyof ProposalCards, label: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{label}</h3>
        <AddButton onClick={() => addCard(group)} />
      </div>
      {cards[group].length === 0 && <EmptyHint />}
      {cards[group].map((card, i) => (
        <div key={card._key} className="rounded-xl border border-border p-3 space-y-2 relative">
          <input
            value={card.title}
            onChange={(e) => setCard(group, i, { title: e.target.value })}
            className={inputCls}
            placeholder="Titulo"
            aria-label={`Titulo de la card (${label})`}
          />
          <textarea
            value={card.body}
            onChange={(e) => setCard(group, i, { body: e.target.value })}
            className={areaCls}
            placeholder="Cuerpo (acepta <strong> para enfasis)"
            aria-label={`Cuerpo de la card (${label})`}
          />
          <RemoveButton onClick={() => removeCard(group, i)} label="Quitar card" />
        </div>
      ))}
    </section>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur py-2 -mx-2 px-2 z-10 border-b border-border">
        <div>
          <h2 className="text-[15px] font-semibold">Editar contenido</h2>
          <p className="text-[12px] text-muted-foreground">
            Ajusta el texto a mano. No regenera con IA, guarda la misma propuesta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Guardar
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <label className={labelCls}>Resumen ejecutivo</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={areaCls + " min-h-[120px]"}
          placeholder="Resumen (acepta <strong>)"
          aria-label="Resumen ejecutivo"
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">Contexto del cliente</h3>
        <label className={labelCls}>Parrafo de contexto</label>
        <textarea
          value={paragraph}
          onChange={(e) => setParagraph(e.target.value)}
          className={areaCls}
          placeholder="Narrativa de negocio"
          aria-label="Parrafo de contexto del cliente"
        />
        <label className={labelCls}>Datos clave (uno por linea)</label>
        <textarea
          value={dataPoints}
          onChange={(e) => setDataPoints(e.target.value)}
          className={areaCls}
          placeholder="<strong>Industria:</strong> ..."
          aria-label="Datos clave del contexto (uno por linea)"
        />
      </section>

      {cardGroup("objective", "Objetivos")}
      {cardGroup("scope", "Alcance")}
      {cardGroup("governance", "Governance")}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Roadmap</h3>
          <AddButton onClick={addPhase} />
        </div>
        {roadmap.length === 0 && <EmptyHint />}
        {roadmap.map((p, i) => (
          <div key={p._key} className="rounded-xl border border-border p-3 space-y-2 relative">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={p.period}
                onChange={(e) => setPhase(i, { period: e.target.value })}
                className={inputCls}
                placeholder="Periodo (ej. Semanas 1-2)"
                aria-label="Periodo de la fase"
              />
              <input
                value={p.label}
                onChange={(e) => setPhase(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Etiqueta"
                aria-label="Etiqueta de la fase"
              />
            </div>
            <input
              value={p.focus}
              onChange={(e) => setPhase(i, { focus: e.target.value })}
              className={inputCls}
              placeholder="Foco"
              aria-label="Foco de la fase"
            />
            <textarea
              value={lines(p.activities)}
              onChange={(e) => setPhase(i, { activities: toLines(e.target.value) })}
              className={areaCls}
              placeholder="Actividades (una por linea)"
              aria-label="Actividades de la fase (una por linea)"
            />
            <input
              value={p.milestone}
              onChange={(e) => setPhase(i, { milestone: e.target.value })}
              className={inputCls}
              placeholder="Milestone"
              aria-label="Milestone de la fase"
            />
            <RemoveButton onClick={() => removePhase(i)} label="Quitar fase" />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">
            {isSprintTeam ? "Equipo del Sprint" : "Equipo"}
          </h3>
          <AddButton onClick={addMember} />
        </div>
        {team.length === 0 && <EmptyHint />}
        {team.map((m, i) =>
          isSprintTeam ? (
            // Shape sprint: Rol/Perfil + Nombre/Email + Participacion, espeja SprintRow.
            <div key={m._key} className="rounded-xl border border-border p-3 space-y-2 relative">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={m.role ?? ""}
                  onChange={(e) => setMember(i, { role: e.target.value })}
                  className={inputCls}
                  placeholder="Rol / Perfil"
                  aria-label="Rol o perfil del integrante"
                />
                <input
                  value={m.name ?? ""}
                  onChange={(e) => setMember(i, { name: e.target.value })}
                  className={inputCls}
                  placeholder="Nombre (opcional)"
                  aria-label="Nombre del integrante"
                />
                <input
                  value={m.email ?? ""}
                  onChange={(e) => setMember(i, { email: e.target.value })}
                  className={inputCls}
                  placeholder="Email (opcional)"
                  aria-label="Email del integrante"
                />
              </div>
              <textarea
                value={lines(m.responsibilities)}
                onChange={(e) => setMember(i, { responsibilities: e.target.value })}
                className={areaCls}
                placeholder="Responsabilidades (parrafo)"
                aria-label="Responsabilidades del integrante"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={m.participation ?? ""}
                  onChange={(e) => setMember(i, { participation: e.target.value })}
                  className={inputCls}
                  placeholder="Participacion (ej. Core Tech)"
                  aria-label="Participacion del integrante"
                />
                <input
                  value={m.participationNote ?? ""}
                  onChange={(e) => setMember(i, { participationNote: e.target.value })}
                  className={inputCls}
                  placeholder="Nota de participacion (opcional)"
                  aria-label="Nota de participacion del integrante"
                />
              </div>
              <RemoveButton onClick={() => removeMember(i)} label="Quitar integrante" />
            </div>
          ) : (
            // Shape staff: Rol + Stack + Modalidad + responsabilidades (una por linea).
            <div key={m._key} className="rounded-xl border border-border p-3 space-y-2 relative">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={m.role ?? ""}
                  onChange={(e) => setMember(i, { role: e.target.value })}
                  className={inputCls}
                  placeholder="Rol"
                  aria-label="Rol del integrante"
                />
                <input
                  value={m.stack ?? ""}
                  onChange={(e) => setMember(i, { stack: e.target.value })}
                  className={inputCls}
                  placeholder="Stack"
                  aria-label="Stack del integrante"
                />
                <input
                  value={m.modality ?? ""}
                  onChange={(e) => setMember(i, { modality: e.target.value })}
                  className={inputCls}
                  placeholder="Modalidad"
                  aria-label="Modalidad del integrante"
                />
              </div>
              <textarea
                value={lines(m.responsibilities)}
                onChange={(e) => setMember(i, { responsibilities: toLines(e.target.value) })}
                className={areaCls}
                placeholder="Responsabilidades (una por linea)"
                aria-label="Responsabilidades del integrante (una por linea)"
              />
              <RemoveButton onClick={() => removeMember(i)} label="Quitar integrante" />
            </div>
          ),
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Riesgos</h3>
          <AddButton onClick={addRisk} />
        </div>
        {risks.length === 0 && <EmptyHint />}
        {risks.map((r, i) => (
          <div key={r._key} className="rounded-xl border border-border p-3 space-y-2 relative">
            <input
              value={r.title}
              onChange={(e) => setRisk(i, { title: e.target.value })}
              className={inputCls}
              placeholder="Titulo del riesgo"
              aria-label="Titulo del riesgo"
            />
            <textarea
              value={r.body}
              onChange={(e) => setRisk(i, { body: e.target.value })}
              className={areaCls}
              placeholder="Mitigacion: ..."
              aria-label="Mitigacion del riesgo"
            />
            <RemoveButton onClick={() => removeRisk(i)} label="Quitar riesgo" />
          </div>
        ))}
      </section>
    </div>
  );
}
