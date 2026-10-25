"use client";
import { useMemo, useRef, useState } from "react";
import { parseArrayBuffer } from "@/lib/excel";
import { scanDescription } from "@/lib/prohibited";
import type { Classifications } from "@/lib/rules";
import type { Booking, OverallStatus } from "@/lib/types";
import { compute, ResultView } from "./ResultView";
import { STATUS_STYLE, StatusPill, gbp, todayISO } from "./ui";

const SAMPLE_URL = "/samples/test_bookings.xlsx";
const MAX_BYTES = 5 * 1024 * 1024;

// today is read when a file loads (in the browser), never at build time, so R-10 always uses the real date
interface Loaded { name: string; original: Booking[]; bookings: Booking[]; warnings: string[]; today: string; cls: Classifications }

export function UploadPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<OverallStatus | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = (name: string, buf: ArrayBuffer) => {
    const r = parseArrayBuffer(new Uint8Array(buf));
    if (!r.bookings.length) {
      setData(null);
      setError(r.warnings[0] ?? "No bookings found in that file. Check it uses the template layout, with data from row 4.");
      return;
    }
    const onlyExample = r.bookings.length === 1 && r.bookings[0].id === "BK-001" && name !== "Sample data (planted mistakes)";
    setError(onlyExample ? "Only the template's example row (BK-001) was found. Add your bookings from row 4, or check this is the right file." : null);
    setFilter(null);
    setData({ name, original: r.bookings, bookings: r.bookings, warnings: r.warnings, today: todayISO(), cls: new Map() });
    classifyAmbiguous(r.bookings);
  };

  // Only descriptions the keyword fast path can't decide go to the LLM, in one batched call.
  const classifyAmbiguous = async (bookings: Booking[]) => {
    const ambiguous = [...new Set(bookings.flatMap((b) => b.items).filter((i) => scanDescription(i.description).kind === "ambiguous").map((i) => i.description))];
    if (!ambiguous.length) return;
    try {
      const res = await fetch("/api/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descriptions: ambiguous }) });
      const { classifications } = await res.json();
      if (classifications && Object.keys(classifications).length) {
        setData((d) => d && { ...d, cls: new Map([...d.cls, ...Object.entries(classifications)]) as Classifications });
      }
    } catch { /* keep the "check manually" flags */ }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { setError(`"${f.name}" isn't an Excel .xlsx file. Save it as .xlsx (Excel Workbook) and try again.`); return; }
    if (f.size > MAX_BYTES) { setError("That file is over 5 MB. The template only needs the Bookings and Items sheets."); return; }
    if (f.size === 0) { setError("That file is empty."); return; }
    setBusy(true);
    try { load(f.name, await f.arrayBuffer()); } finally { setBusy(false); }
  };

  const loadSample = async () => {
    setBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      load("Sample data (planted mistakes)", await res.arrayBuffer());
    } catch {
      setError("Could not load the sample data. Please try again.");
    } finally { setBusy(false); }
  };

  const computed = useMemo(() => data?.bookings.map((b) => compute(b, data.today, data.cls)) ?? [], [data]);
  const counts = computed.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});

  const update = (i: number, b: Booking) =>
    setData((d) => d && { ...d, bookings: d.bookings.map((x, j) => (j === i ? b : x)) });

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${drag ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-white"}`}
      >
        <p className="font-medium text-slate-900">Drop your Bookings + Items workbook here</p>
        <p className="mt-1 text-sm text-slate-600">Use the template layout: header row with “Booking ID”, data from row 4. Stays in your browser; nothing is uploaded.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => input.current?.click()} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            Choose .xlsx file
          </button>
          <button onClick={loadSample} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
            Load sample data
          </button>
          <a href={SAMPLE_URL} download="shipment_copilot_sample.xlsx" className="rounded-lg px-4 py-2 text-sm font-semibold text-sky-700 hover:underline">
            Download sample file
          </a>
        </div>
        <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Upload Excel workbook" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-900">{data.name}: {data.bookings.length} bookings</span>
            <button onClick={() => setFilter(null)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${filter ? "bg-white text-slate-700 ring-1 ring-slate-200" : "bg-slate-900 text-white"}`}>All</button>
            {(Object.keys(STATUS_STYLE) as OverallStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(filter === s ? null : s)} aria-pressed={filter === s}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${filter === s ? "ring-slate-900 " : "ring-transparent "}${STATUS_STYLE[s].pill}`}>
                {s}: {counts[s] ?? 0}
              </button>
            ))}
          </div>
          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Notes from reading the file</p>
              <ul className="mt-1 list-disc pl-5">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="space-y-3">
            {data.bookings.map((b, i) => filter && computed[i].status !== filter ? null : (
              <BookingCard key={b.id} booking={b} edited={b !== data.original[i]} today={data.today} cls={data.cls}
                onChange={(nb) => update(i, nb)} onReset={() => update(i, data.original[i])} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BookingCard({ booking, edited, today, cls, onChange, onReset }: {
  booking: Booking; edited: boolean; today: string; cls: Classifications; onChange: (b: Booking) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const c = useMemo(() => compute(booking, today, cls), [booking, today, cls]);
  const fails = c.checks.filter((r) => r.status !== "pass");
  const route = booking.originCity && booking.destCity ? `${booking.originCity} → ${booking.destCity}` : "Route incomplete";
  return (
    <article className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left">
        <span className="font-mono text-sm font-semibold text-slate-900">{booking.id}</span>
        <StatusPill status={c.status} />
        <span className="text-sm text-slate-600">{route}</span>
        <span className="text-sm text-slate-600">{c.selected ? `${c.selected.carrier} · ${gbp(c.selected.cost)}` : "No carrier"}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          {fails.length ? fails.map((r) => (
            <span key={r.ruleId} title={r.status === "cannot-check" ? "Can't check: details missing" : undefined}
              className={`rounded px-1.5 py-0.5 font-mono font-semibold ${r.status === "cannot-check" ? "bg-slate-100 text-slate-700" : r.severity === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
              {r.ruleId}{r.status === "cannot-check" ? "?" : ""}
            </span>
          )) : <span>All checks pass</span>}
          <span aria-hidden className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          {edited && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <span>You changed this booking here. The file itself is unchanged.</span>
              <button onClick={onReset} className="font-semibold underline">Reset</button>
            </div>
          )}
          <ResultView booking={booking} today={today} classifications={cls} onChange={onChange} />
        </div>
      )}
    </article>
  );
}
