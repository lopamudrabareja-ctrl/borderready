"use client";
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
      <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm">
        {label}
      </span>
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 w-64 rounded-md bg-slate-900 px-3 py-2 text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {tip}
      </span>
    </span>
  );
}

export const STATUS_STYLE: Record<OverallStatus, { box: string; pill: string; dot: string }> = {
  "Not ready to dispatch": { box: "bg-red-50 border-red-200 text-red-900", pill: "bg-red-100 text-red-800", dot: "bg-red-500" },
  "Can dispatch after review": { box: "bg-amber-50 border-amber-200 text-amber-900", pill: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  "Ready to dispatch": { box: "bg-emerald-50 border-emerald-200 text-emerald-900", pill: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
};

export function StatusPill({ status }: { status: OverallStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {status}
    </span>
  );
}

export function Section({ title, children, aside }: { title: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {aside}
      </div>
      {children}
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
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};
