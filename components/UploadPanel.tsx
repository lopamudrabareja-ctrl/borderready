"use client";
import { ArrowRight, ChevronRight, Download, FileSpreadsheet, Info, RotateCcw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { parseArrayBuffer } from "@/lib/excel";
import { scanDescription } from "@/lib/prohibited";
import type { Classifications } from "@/lib/rules";
import type { Booking, OverallStatus } from "@/lib/types";
import { compute, ResultView } from "./ResultView";
import { STATUS, StatusPill, gbp, todayISO } from "./ui";

const SAMPLE_URL = "/samples/test_bookings.xlsx";
const SAMPLE_NAME = "Sample data (planted mistakes)";
const MAX_BYTES = 5 * 1024 * 1024;

// today is read when a file loads (in the browser), never at build time, so R-10 always uses the real date
interface Loaded { name: string; original: Booking[]; bookings: Booking[]; warnings: string[]; today: string; cls: Classifications }

export function UploadPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<OverallStatus | null>(null);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLDivElement>(null);

  const load = (name: string, buf: ArrayBuffer) => {
    const r = parseArrayBuffer(new Uint8Array(buf));
    if (!r.bookings.length) {
      setData(null);
      setError(r.warnings[0] ?? "No bookings found in that file. Check it uses the template layout, with data from row 4.");
      return;
    }
    const onlyExample = r.bookings.length === 1 && r.bookings[0].id === "BK-001" && name !== SAMPLE_NAME;
    setError(onlyExample ? "Only the template's example row (BK-001) was found. Add your bookings from row 4, or check this is the right file." : null);
    setFilter(null);
    setSelected(0);
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
      load(SAMPLE_NAME, await res.arrayBuffer());
    } catch {
      setError("Could not load the sample data. Please try again.");
    } finally { setBusy(false); }
  };

  const computed = useMemo(() => data?.bookings.map((b) => compute(b, data.today, data.cls)) ?? [], [data]);
  const counts = computed.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});
  const visible = data ? data.bookings.map((b, i) => ({ b, i })).filter(({ i }) => !filter || computed[i].status === filter) : [];
  const current = data && (visible.find((v) => v.i === selected) ?? visible[0]);

  const update = (i: number, b: Booking) => setData((d) => d && { ...d, bookings: d.bookings.map((x, j) => (j === i ? b : x)) });
  const pick = (i: number) => {
    setSelected(i);
    if (window.matchMedia("(max-width: 1279px)").matches) setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const pickFile = () => input.current?.click();
  const fileInput = (
    <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Upload Excel workbook"
      onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
  );

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          className={`rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center transition ${drag ? "border-lime-500 bg-lime-50/60" : "border-slate-300"}`}
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-900 text-lime-400 shadow-sm">
            <FileSpreadsheet className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-forest-950">Check a bookings spreadsheet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Drop an .xlsx file with <b className="font-medium text-slate-800">Bookings</b> and <b className="font-medium text-slate-800">Items</b> sheets in the template layout. Every booking gets all 10 checks and a carrier recommendation.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={loadSample} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-forest-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-forest-800 disabled:opacity-60">
              Load sample data <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button onClick={pickFile} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60">
              <Upload className="h-4 w-4" aria-hidden /> Choose file
            </button>
          </div>
          <a href={SAMPLE_URL} download="shipment_copilot_sample.xlsx" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-forest-700 hover:underline">
            <Download className="h-3.5 w-3.5" aria-hidden /> Download the sample file to see the layout
          </a>
          <p className="mt-4 text-[11px] text-slate-500">Read in your browser. Nothing is uploaded.</p>
          {fileInput}
        </div>
        {error && <ErrorBox text={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-forest-950">{data.name}</div>
            <div className="text-xs text-slate-600 tnum">{data.bookings.length} bookings checked</div>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <a href={SAMPLE_URL} download="shipment_copilot_sample.xlsx" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-900">
            <Download className="h-3.5 w-3.5" aria-hidden /> Sample file
          </a>
          <button onClick={pickFile} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" aria-hidden /> Upload another
          </button>
        </div>
        {fileInput}
      </div>

      {error && <ErrorBox text={error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="All bookings" value={data.bookings.length} active={!filter} onClick={() => setFilter(null)} />
        {(Object.keys(STATUS) as OverallStatus[]).map((s) => (
          <Tile key={s} label={s} value={counts[s] ?? 0} status={s} active={filter === s} onClick={() => setFilter(filter === s ? null : s)} />
        ))}
      </div>

      {data.warnings.length > 0 && (
        <details className="group rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Info className="h-4 w-4 text-amber-600" aria-hidden />
            {data.warnings.length} {data.warnings.length === 1 ? "note" : "notes"} from reading the file
            <ChevronRight className="ml-auto h-4 w-4 transition group-open:rotate-90" aria-hidden />
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-6 text-amber-900">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <nav aria-label="Bookings" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          {visible.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No bookings with this status.</p>}
          <ul className="divide-y divide-slate-100">
            {visible.map(({ b, i }) => {
              const c = computed[i];
              const issues = c.checks.filter((r) => r.status !== "pass");
              const active = current?.i === i;
              return (
                <li key={b.id}>
                  <button onClick={() => pick(i)} aria-current={active}
                    className={`relative flex w-full flex-col gap-1.5 px-4 py-3 text-left transition ${active ? "bg-lime-50" : "hover:bg-slate-50"}`}>
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-lime-500" aria-hidden />}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-forest-950">{b.id}</span>
                      {b !== data.original[i] && <span className="rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-800">edited</span>}
                      <span className="ml-auto"><StatusPill status={c.status} short /></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="truncate">{b.originCity ?? "?"} → {b.destCity ?? "?"}</span>
                      <span className="ml-auto shrink-0 tnum">{c.selected ? `${c.selected.carrier.replace("Carrier ", "")} · ${gbp(c.selected.cost)}` : c.rec.recommended ? "carrier needs a fix" : "no carrier"}</span>
                    </div>
                    {issues.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {issues.map((r) => (
                          <span key={r.ruleId} className={`rounded px-1.5 py-px font-mono text-[10px] font-semibold ${
                            r.status === "cannot-check" ? "bg-slate-100 text-slate-600" : r.severity === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                          }`}>{r.ruleId}{r.status === "cannot-check" ? "?" : ""}</span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div ref={detail} className="scroll-mt-24">
          {current && (
            <div key={current.b.id} className="space-y-3">
              {current.b !== data.original[current.i] && (
                <div className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-900 ring-1 ring-sky-100">
                  <span>You changed this booking here. The file itself is unchanged.</span>
                  <button onClick={() => update(current.i, data.original[current.i])} className="inline-flex items-center gap-1 font-semibold hover:underline">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset
                  </button>
                </div>
              )}
              <ResultView booking={current.b} today={data.today} classifications={data.cls} onChange={(nb) => update(current.i, nb)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, status, active, onClick }: { label: string; value: number; status?: OverallStatus; active: boolean; onClick: () => void }) {
  const s = status ? STATUS[status] : null;
  const Icon = s?.icon;
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`rounded-2xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${active ? "border-forest-900 ring-1 ring-forest-900" : "border-slate-200/80 hover:border-slate-300"}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {Icon && <Icon className={`h-3.5 w-3.5 ${s!.tone}`} aria-hidden />}
        {s ? <><span className="truncate sm:hidden">{s.short}</span><span className="hidden truncate sm:inline">{label}</span></> : <span className="truncate">{label}</span>}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-forest-950 tnum">{value}</div>
    </button>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{text}</div>;
}
