"use client";

import { cn } from "@/lib/utils";
import { avatarColor, initials, STAGE_CFG, CHANNEL_CFG } from "@/lib/crm-ui";

/* ---------------- Avatar ---------------- */
export function Avatar({
  name,
  size = 36,
  online = false,
  country = null,
}: {
  name: string;
  size?: number;
  online?: boolean;
  country?: string | null;
}) {
  const [bg] = avatarColor(name);
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: bg + "22",
        border: `1.5px solid ${bg}44`,
        color: bg,
        fontSize: size * 0.34,
      }}
    >
      {initials(name)}
      {online && (
        <span
          className="absolute rounded-full"
          style={{
            width: 9,
            height: 9,
            bottom: 0,
            right: 0,
            background: "var(--positive)",
            border: "2px solid var(--background)",
          }}
        />
      )}
      {country && (
        <span
          className="absolute rounded-sm px-0.5 leading-none"
          style={{ bottom: 0, left: 0, fontSize: 8, background: "var(--surface-2)", color: "var(--muted-foreground)" }}
        >
          {country}
        </span>
      )}
    </div>
  );
}

/* ---------------- StagePill ---------------- */
export function StagePill({ stage, small = false }: { stage: string; small?: boolean }) {
  const cfg = STAGE_CFG[stage] || { text: "var(--muted-foreground)", bg: "var(--surface-2)" };
  return (
    <span
      className="inline-flex items-center font-semibold whitespace-nowrap rounded"
      style={{
        background: cfg.bg,
        color: cfg.text,
        fontSize: small ? 9 : 10,
        padding: small ? "1px 6px" : "2px 8px",
      }}
    >
      {stage}
    </span>
  );
}

/* ---------------- ChannelIcon ---------------- */
export function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  const cfg = CHANNEL_CFG[channel];
  if (!cfg) return null;
  return (
    <span
      title={cfg.label}
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: cfg.color }}
    />
  );
}

/* ---------------- Tag ---------------- */
const TAG_TONES: Record<string, { c: string; b: string }> = {
  hot: { c: "var(--destructive)", b: "var(--destructive-dim)" },
  vip: { c: "var(--warning)", b: "var(--warning-dim)" },
  enterprise: { c: "var(--info)", b: "var(--info-dim)" },
  default: { c: "var(--muted-foreground)", b: "var(--surface-2)" },
};
export function Tag({ label }: { label: string }) {
  const tone = TAG_TONES[label.toLowerCase()] || TAG_TONES.default;
  return (
    <span
      className="inline-flex items-center rounded font-medium"
      style={{ color: tone.c, background: tone.b, fontSize: 10, padding: "2px 7px" }}
    >
      {label}
    </span>
  );
}

/* ---------------- MetricCard ---------------- */
export function MetricCard({
  label,
  value,
  change,
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex-1 min-w-[140px] rounded-xl border border-border bg-card p-5 transition-colors",
        onClick && "cursor-pointer hover:border-primary"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="text-[26px] font-bold tabular-nums mt-1 leading-none">{value}</div>
      {change !== undefined && (
        <div
          className="text-[11px] mt-1"
          style={{ color: change >= 0 ? "var(--primary)" : "var(--destructive)" }}
        >
          {change >= 0 ? "+" : ""}
          {change}%
        </div>
      )}
    </div>
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({ active, onChange, "aria-label": ariaLabel }: { active: boolean; onChange?: (v: boolean) => void; "aria-label"?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!active)}
      aria-label={ariaLabel}
      className="relative rounded-full transition-colors cursor-pointer shrink-0"
      style={{ width: 40, height: 22, padding: 2, background: active ? "var(--primary)" : "var(--surface-3)" }}
      aria-pressed={active}
    >
      <span
        className="block rounded-full bg-white transition-transform"
        style={{ width: 18, height: 18, transform: active ? "translateX(18px)" : "translateX(0)" }}
      />
    </button>
  );
}
