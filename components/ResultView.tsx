"use client";
import { useMemo, useState } from "react";
import { summary } from "@/lib/booking";
import { BALANCED_WEIGHTS, recommend } from "@/lib/carriers";
import { GLOSSARY, nextSteps } from "@/lib/guidance";
import { isBlocking, overallStatus, runChecks, type Classifications } from "@/lib/rules";
import type { Booking, CarrierOption, CheckAction, CheckResult, OverallStatus } from "@/lib/types";
import { Flash, Section, STATUS_STYLE, Term, fmtDate, gbp } from "./ui";

export interface Computed {
  checks: CheckResult[];
  status: OverallStatus;
  rec: ReturnType<typeof recommend>;
  selected: CarrierOption | null;
}

export function compute(b: Booking, today: string, cls?: Classifications): Computed {
  const checks = runChecks(b, today, cls);
  const s = summary(b);
  const rec = recommend(b.destCountry, b.pallets, s.grossWeight, b.priority);
  const override = b.carrierOverride ? rec.options.find((o) => o.carrier === b.carrierOverride && o.feasible) : undefined;
  return { checks, status: overallStatus(checks), rec, selected: override ?? rec.recommended };
}

interface Props {
  booking: Booking;
  today: string;
  classifications?: Classifications;
  onChange: (b: Booking) => void;
}

export function ResultView({ booking, today, classifications, onChange }: Props) {
  const c = useMemo(() => compute(booking, today, classifications), [booking, today, classifications]);
  const act = (a: CheckAction) => {
    if (a.kind === "switch-carrier") onChange({ ...booking, carrierOverride: a.carrier });
    if (a.kind === "add-pallets") onChange({ ...booking, pallets: a.pallets ?? booking.pallets });
  };
  return (
    <div className="space-y-4">
      <StatusBanner status={c.status} checks={c.checks} />
      <BookingSummary booking={booking} />
      <ChecksPanel checks={c.checks} onAction={act} />
      <CarrierPanel booking={booking} c={c} onSelect={(carrier) => onChange({ ...booking, carrierOverride: carrier })} />
      <NextSteps status={c.status} checks={c.checks} />
      <ConfirmBooking booking={booking} c={c} />
    </div>
  );
}

export function StatusBanner({ status, checks }: { status: OverallStatus; checks: CheckResult[] }) {
  const red = checks.filter((r) => r.status === "fail" && r.severity === "red").length;
  const amber = checks.filter((r) => r.status === "fail" && r.severity === "amber").length;
  const unknown = checks.filter((r) => r.status === "cannot-check").length;
  const s = STATUS_STYLE[status];
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${s.box}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
        <Flash value={status}>{status}</Flash>
      </div>
      <div className="text-sm">
        {red} red · {amber} amber · {checks.filter((r) => r.status === "pass").length} passed
        {unknown > 0 && ` · ${unknown} can't check yet`}
      </div>
    </div>
  );
}

export function BookingSummary({ booking }: { booking: Booking }) {
  const s = summary(booking);
  const rows: [React.ReactNode, React.ReactNode, unknown][] = [
    ["Route", s.route ?? "—", s.route],
    ["Destination type", s.destType ?? "—", s.destType],
    [<Term key="p" label="Pallets" tip={GLOSSARY.pallet} />, s.pallets ?? "—", s.pallets],
    [<Term key="c" label="Cartons" tip={GLOSSARY.carton} />, s.cartons ?? "—", s.cartons],
    ["Gross weight", s.grossWeight != null ? `${s.grossWeight} kg` : "—", s.grossWeight],
    ["Weight per pallet", s.weightPerPallet != null ? `${s.weightPerPallet} kg` : "—", s.weightPerPallet],
    ["Declared value", gbp(s.declaredValue), s.declaredValue],
    ["Ready to ship", fmtDate(s.readyDate), s.readyDate],
    ["Priority", s.priority ?? "—", s.priority],
  ];
  return (
    <Section title="Booking summary" aside={<span className="text-xs text-slate-500">{booking.id}{booking.sellerName ? ` · ${booking.sellerName}` : ""}</span>}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {rows.map(([k, v, raw], i) => (
          <div key={i} className={i === 0 ? "col-span-2 sm:col-span-1" : "min-w-0"}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="font-medium text-slate-900"><Flash value={raw}>{v}</Flash></dd>
          </div>
        ))}
      </dl>
      {booking.items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-2 font-medium">SKU</th>
                <th className="py-1 pr-2 font-medium">Description</th>
                <th className="py-1 pr-2 font-medium"><Term label="HS code" tip={GLOSSARY.hsCode} /></th>
                <th className="py-1 pr-2 text-right font-medium">Qty</th>
                <th className="py-1 pr-2 text-right font-medium">Unit £</th>
                <th className="py-1 pr-2 text-right font-medium">Cartons</th>
                <th className="py-1 font-medium">Origin</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {booking.items.map((i) => (
                <tr key={i.sku} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-mono">{i.sku}</td>
                  <td className="py-1 pr-2">{i.description || "—"}</td>
                  <td className="py-1 pr-2 font-mono">{i.hsCode ?? <span className="text-red-700">blank</span>}</td>
                  <td className="py-1 pr-2 text-right"><Flash value={i.quantity}>{i.quantity ?? "—"}</Flash></td>
                  <td className="py-1 pr-2 text-right"><Flash value={i.unitPrice}>{i.unitPrice ?? "—"}</Flash></td>
                  <td className="py-1 pr-2 text-right">{i.cartons ?? "—"}</td>
                  <td className="py-1">{i.countryOfOrigin ?? <span className="text-amber-800">blank</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const ICON: Record<string, { sym: string; cls: string; label: string }> = {
  pass: { sym: "✓", cls: "bg-emerald-100 text-emerald-800", label: "Passed" },
  red: { sym: "!", cls: "bg-red-100 text-red-800", label: "Red: must fix" },
  amber: { sym: "!", cls: "bg-amber-100 text-amber-900", label: "Amber: review" },
  "cannot-check": { sym: "?", cls: "bg-slate-100 text-slate-700", label: "Cannot check yet" },
};

const RULE_NAMES: Record<string, string> = {
  "R-01": "HS code", "R-02": "Declared value", "R-03": "Units per carton", "R-04": "Carton total",
  "R-05": "Weight per pallet", "R-06": "Prohibited goods", "R-07": "Gross weight", "R-08": "Delivery appointment",
  "R-09": "Country of origin", "R-10": "Ready date",
};

export function ChecksPanel({ checks, onAction }: { checks: CheckResult[]; onAction: (a: CheckAction) => void }) {
  const order = (r: CheckResult) => (r.status === "fail" ? (r.severity === "red" ? 0 : 1) : r.status === "cannot-check" ? 2 : 3);
  const sorted = [...checks].sort((a, b) => order(a) - order(b) || a.ruleId.localeCompare(b.ruleId));
  return (
    <Section title="Pre-flight checks">
      <ul className="divide-y divide-slate-100">
        {sorted.map((r) => {
          const ic = ICON[r.status === "fail" ? r.severity : r.status];
          return (
            <li key={r.ruleId} className="flex gap-3 py-2.5">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ic.cls}`} title={ic.label} aria-label={ic.label}>
                {ic.sym}
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium text-slate-900">
                  <span className="mr-1.5 font-mono text-xs text-slate-500">{r.ruleId}</span>
                  {RULE_NAMES[r.ruleId]}
                  {r.status === "fail" && (
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.severity === "red" ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>{r.severity}</span>
                  )}
                </div>
                <p className="text-slate-700"><Flash value={r.message}>{r.message}</Flash></p>
                {r.status !== "pass" && r.fix && <p className="mt-1 text-slate-600"><span className="font-medium text-slate-800">Fix: </span>{r.fix}</p>}
                {r.status === "fail" && r.actions && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.actions.map((a) => (
                      <button key={a.label} onClick={() => onAction(a)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-500">
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function CarrierPanel({ booking, c, onSelect }: { booking: Booking; c: Computed; onSelect: (carrier: string | null) => void }) {
  const { rec, selected } = c;
  const isBalanced = (booking.priority ?? "Balanced") === "Balanced";
  return (
    <Section title="Carrier" aside={selected && rec.recommended && selected.carrier !== rec.recommended.carrier ? (
      <button onClick={() => onSelect(null)} className="text-xs font-medium text-sky-700 hover:underline">Use recommended</button>
    ) : null}>
      {rec.reason && <p className="mb-3 text-sm text-slate-700"><Flash value={rec.reason}>{rec.reason}</Flash></p>}
      <ul className="grid gap-2 sm:grid-cols-3">
        {rec.options.map((o) => {
          const isSel = selected?.carrier === o.carrier;
          const isRec = rec.recommended?.carrier === o.carrier;
          return (
            <li key={o.carrier}>
              <button
                disabled={!o.feasible || o.cost == null}
                onClick={() => onSelect(isRec ? null : o.carrier)}
                aria-pressed={isSel}
                className={`h-full w-full rounded-lg border p-3 text-left text-sm transition ${
                  !o.feasible ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500"
                  : isSel ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold">{o.carrier}</span>
                  {isRec && <span className="rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Recommended</span>}
                  {isSel && !isRec && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Selected</span>}
                </div>
                <div className="text-xs">{o.service}</div>
                <div className="mt-2 text-lg font-semibold"><Flash value={o.cost}>{o.cost != null ? gbp(o.cost) : `${gbp(o.price)}/pallet`}</Flash></div>
                <div className="text-xs">{o.days} days · {o.onTime}% on time · max {o.maxKgPerPallet} kg/pallet</div>
                {isBalanced && o.balancedScore != null && <div className="mt-1 text-xs">Balanced score <span className="font-mono">{o.balancedScore.toFixed(3)}</span></div>}
                {!o.feasible && <div className="mt-2 text-xs font-medium text-slate-700">Excluded: {o.excludedReason}</div>}
              </button>
            </li>
          );
        })}
      </ul>
      {isBalanced && rec.recommended && (
        <p className="mt-2 text-xs text-slate-500">
          Balanced score = {BALANCED_WEIGHTS.price} × (cheapest price ÷ price) + {BALANCED_WEIGHTS.days} × (fewest days ÷ days) + {BALANCED_WEIGHTS.reliability} × (on-time ÷ best on-time), across carriers that can take the load.
        </p>
      )}
    </Section>
  );
}

export function NextSteps({ status, checks }: { status: OverallStatus; checks: CheckResult[] }) {
  return (
    <Section title="Next steps">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {nextSteps(status, checks).map((s) => <li key={s}>{s}</li>)}
      </ol>
    </Section>
  );
}

export function ConfirmBooking({ booking, c }: { booking: Booking; c: Computed }) {
  const [confirmed, setConfirmed] = useState(false);
  const reds = c.checks.filter((r) => isBlocking(r, "red"));
  const blocked = reds.length
    ? `Fix or complete ${reds.length} red ${reds.length === 1 ? "check" : "checks"} first (${reds.map((r) => r.ruleId).join(", ")}).`
    : !c.selected ? "No carrier can take this shipment yet." : null;
  const s = summary(booking);
  if (confirmed && !blocked && c.selected) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950" role="status">
        <p className="font-semibold">Booking {booking.id} confirmed (demo)</p>
        <p className="mt-1">
          {s.route}. {s.cartons} cartons on {s.pallets} pallets ({s.grossWeight} kg) with {c.selected.carrier} {c.selected.service.toLowerCase()} for {gbp(c.selected.cost)}, about {c.selected.days} days in transit, ready on {fmtDate(s.readyDate)}.
        </p>
        <p className="mt-1">What happens next: the carrier confirms a collection slot, you send the commercial invoice with the goods, and the export declaration is made before the goods leave the UK.</p>
        {c.status === "Can dispatch after review" && <p className="mt-1 font-medium">Amber items are still open: review them before collection.</p>}
        <button onClick={() => setConfirmed(false)} className="mt-2 text-xs font-medium underline">Edit booking</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={!!blocked}
        onClick={() => setConfirmed(true)}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        Confirm booking
      </button>
      {blocked && <span className="text-sm text-slate-600">{blocked}</span>}
    </div>
  );
}
