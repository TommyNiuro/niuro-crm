"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Avatar } from "@/components/ds";
import { STAGE_CFG } from "@/lib/crm-ui";
import { FieldValue } from "./FieldValue";
import type { ColumnDef, RecordRow, SelectOption } from "./types";
import { cn } from "@/lib/utils";

export interface CardCfg {
  primaryKey: string;
  hasAvatar: boolean;
  subtitleKey?: string;
  cardFields: string[];
  columns: ColumnDef[];
}

interface Props {
  rows: RecordRow[];
  groupKey: string;
  groups: SelectOption[];
  card: CardCfg;
  onMove: (id: string, group: string) => void | Promise<void>;
  onOpen: (row: RecordRow) => void;
}

export function RecordBoard({ rows, groupKey, groups, card, onMove, onOpen }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    if (!target) return;
    const row = rows.find((r) => r.id === id);
    if (row && String(row[groupKey]) !== target) onMove(id, target);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-4 h-full min-w-max">
          {groups.map((g) => {
            const items = rows.filter((r) => String(r[groupKey] ?? "") === g.value);
            return <Column key={g.value} group={g} count={items.length} items={items} card={card} onOpen={onOpen} />;
          })}
        </div>
      </div>
    </DndContext>
  );
}

function Column({
  group,
  count,
  items,
  card,
  onOpen,
}: {
  group: SelectOption;
  count: number;
  items: RecordRow[];
  card: CardCfg;
  onOpen: (row: RecordRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.value });
  const cfg = STAGE_CFG[group.value];
  const color = group.color ?? cfg?.text ?? "var(--meta)";
  return (
    <div className="flex flex-col w-[270px] shrink-0 h-full">
      <div className="flex items-center gap-2 px-1.5 pb-2 shrink-0">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-foreground">{group.label}</span>
        <span className="text-[11px] text-meta tabular-nums">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-soft bg-surface-2 p-2 space-y-2 transition-colors",
          isOver && "border-primary bg-accent-dim"
        )}
      >
        {items.map((row) => (
          <Card key={row.id} row={row} card={card} onOpen={onOpen} />
        ))}
        {items.length === 0 && <div className="text-[11px] text-meta text-center py-6">Vacío</div>}
      </div>
    </div>
  );
}

function Card({ row, card, onOpen }: { row: RecordRow; card: CardCfg; onOpen: (row: RecordRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  const title = String(row[card.primaryKey] ?? "—");
  const footFields = card.cardFields
    .map((k) => card.columns.find((c) => c.key === k))
    .filter((c): c is ColumnDef => !!c && row[c.key] != null && row[c.key] !== "");

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onOpen(row)}
      className={cn(
        "rounded-md border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing hover:border-meta transition-colors",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-center gap-2">
        {card.hasAvatar ? (
          <Avatar name={title} size={24} online={Boolean(row.online)} country={(row.country as string) ?? null} />
        ) : (
          <span className="h-6 w-6 shrink-0 rounded bg-surface-3 flex items-center justify-center text-[11px] font-semibold text-meta">
            {title.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium truncate">{title}</div>
          {card.subtitleKey && row[card.subtitleKey] ? (
            <div className="text-[11px] text-meta truncate">{String(row[card.subtitleKey])}</div>
          ) : null}
        </div>
      </div>
      {footFields.length > 0 && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border-soft text-[11px]">
          {footFields.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 text-muted-foreground">
              <FieldValue col={c} value={row[c.key]} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
