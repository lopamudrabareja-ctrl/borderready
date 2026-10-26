"use client";
import { CircleCheck, CircleHelp, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OverallStatus } from "@/lib/types";

/** Re-renders its children with a short yellow flash whenever `value` changes. */
export function Flash({ value, children }: { value: unknown; children: React.ReactNode }) {
  const key = JSON.stringify(value);
  const first = useRef(key);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (key !== first.current) {
      first.current = key;
      setN((x) => x + 1);
    }
  }, [key]);
  return <span key={n} className={n ? "flash" : undefined}>{children}</span>;
}

/** A word with a plain-English explanation on hover or keyboard focus. */
export function Term({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="group relative inline-block">
      <span tabIndex={0} className="cursor-help rounded-sm underline decoration-slate-300 decoration-dotted underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-lime-500">
        {label}
      </span>
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-1.5 w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {tip}
      </span>
    </span>
  );
}

export const STATUS: Record<OverallStatus, { icon: LucideIcon; tone: string; soft: string; text: string; ring: string; dot: string; short: string }> = {
  "Not ready to dispatch": { icon: CircleX, tone: "text-red-600", soft: "bg-red-50", text: "text-red-800", ring: "ring-red-200", dot: "bg-red-500", short: "Not ready" },
  "Can dispatch after review": { icon: TriangleAlert, tone: "text-amber-500", soft: "bg-amber-50", text: "text-amber-900", ring: "ring-amber-200", dot: "bg-amber-500", short: "Review" },
  "Ready to dispatch": { icon: CircleCheck, tone: "text-emerald-600", soft: "bg-emerald-50", text: "text-emerald-800", ring: "ring-emerald-200", dot: "bg-emerald-500", short: "Ready" },
};

export function StatusPill({ status, short }: { status: OverallStatus; short?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.soft} ${s.text} ${s.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {short ? s.short : status}
    </span>
  );
}

export const CHECK_ICON = { red: CircleX, amber: TriangleAlert, unknown: CircleHelp, pass: CircleCheck };

/** Plain-English severity names; the rulebook's Red / Amber stays visible as a small tag. */
export const SEVERITY = {
  red: { label: "Must fix", hint: "Blocks the booking", tag: "Red", tagCls: "bg-red-600 text-white" },
  amber: { label: "Check before shipping", hint: "You can still ship", tag: "Amber", tagCls: "bg-amber-400 text-amber-950" },
} as const;

export function SeverityTag({ severity }: { severity: "red" | "amber" }) {
  const s = SEVERITY[severity];
  return <span className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${s.tagCls}`} title={`Rulebook severity: ${s.tag}`}>{s.tag}</span>;
}

/** Pill-shaped tab switcher. */
export function PillTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            value === t.id ? "bg-forest-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}>
          {t.label}
          {t.badge ? <span className={`rounded-full px-1.5 text-[11px] font-semibold tnum ${value === t.id ? "bg-lime-400 text-forest-950" : "bg-slate-100 text-slate-700"}`}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, icon: Icon, aside, children, className = "" }: {
  title?: React.ReactNode; icon?: LucideIcon; aside?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,30,0.05)] ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden />}
            {title}
          </h2>
          {aside}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const gbp = (n: number | null | undefined) =>
  n == null ? "—" : `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

export const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
