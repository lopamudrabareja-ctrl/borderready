"use client";
import {
  ArrowRight, Ban, BadgeCheck, Boxes, Building2, Calendar, ChevronDown, CircleCheck, ListChecks, Lock, MapPin, Package,
  Truck, Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { summary } from "@/lib/booking";
import { BALANCED_WEIGHTS, recommend } from "@/lib/carriers";
import { GLOSSARY, nextSteps } from "@/lib/guidance";
import { chosenCarrier, isBlocking, overallStatus, runChecks, type Classifications } from "@/lib/rules";
import type { Booking, CarrierOption, CheckAction, CheckResult, OverallStatus, RateOption } from "@/lib/types";
import { CHECK_ICON, Card, Flash, STATUS, Term, fmtDate, gbp } from "./ui";

export interface Computed {
  checks: CheckResult[];
  status: OverallStatus;
  rec: ReturnType<typeof recommend>;
  selected: CarrierOption | null; // the carrier the booking will use; null while the priority's pick can't take the load
  chosen: RateOption | null; // the priority's pick from the full rate card (what R-05 checks)
}

export function compute(b: Booking, today: string, cls?: Classifications): Computed {
  const checks = runChecks(b, today, cls);
  const s = summary(b);
  const rec = recommend(b.destCountry, b.pallets, s.grossWeight, b.priority);
  const override = b.carrierOverride ? rec.options.find((o) => o.carrier === b.carrierOverride && o.feasible) : undefined;
  const chosen = chosenCarrier(b);
  const chosenOk = chosen ? rec.options.find((o) => o.carrier === chosen.carrier && o.feasible && o.cost != null) : undefined;
  return { checks, status: overallStatus(checks), rec, selected: override ?? chosenOk ?? null, chosen };
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
      <StatusHero booking={booking} c={c} />
      <ChecksPanel checks={c.checks} onAction={act} />
      <CarrierPanel booking={booking} c={c} onSelect={(carrier) => onChange({ ...booking, carrierOverride: carrier })} />
      <ShipmentCard booking={booking} />
      <NextSteps status={c.status} checks={c.checks} />
    </div>
  );
}

const RULE_NAMES: Record<string, string> = {
  "R-01": "HS code", "R-02": "Declared value", "R-03": "Units per carton", "R-04": "Carton total",
  "R-05": "Weight per pallet", "R-06": "Prohibited goods", "R-07": "Gross weight", "R-08": "Delivery appointment",
  "R-09": "Country of origin", "R-10": "Ready date",
};

const kindOf = (r: CheckResult) => (r.status === "pass" ? "pass" : r.status === "cannot-check" ? "unknown" : r.severity);
const SEGMENT: Record<string, string> = { pass: "bg-emerald-500", red: "bg-red-500", amber: "bg-amber-400", unknown: "bg-slate-200" };

/** The verdict at a glance: status, a 10-segment checks bar, the chosen carrier and the confirm action. */
export function StatusHero({ booking, c }: { booking: Booking; c: Computed }) {
  const [confirmed, setConfirmed] = useState(false);
  const s = STATUS[c.status];
  const Icon = s.icon;
  const passed = c.checks.filter((r) => r.status === "pass").length;
  const reds = c.checks.filter((r) => isBlocking(r, "red"));
  const blocked = reds.length
    ? `Fix or complete ${reds.length} red ${reds.length === 1 ? "check" : "checks"} first`
    : !c.selected ? "No carrier can take this load yet" : null;
  const sum = summary(booking);
  const overLimit = !c.selected && c.chosen && sum.weightPerPallet != null && sum.weightPerPallet > c.chosen.maxKgPerPallet ? c.chosen : null;

  if (confirmed && !blocked && c.selected) {
    return (
      <section className="rise rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm" role="status">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 text-sm text-slate-700">
            <p className="text-base font-semibold text-slate-900">Booking confirmed <span className="font-normal text-slate-500">(demo)</span></p>
            <p className="mt-1.5">
              {sum.route} · {sum.cartons} cartons on {sum.pallets} pallets ({sum.grossWeight} kg) · <b className="text-slate-900">{c.selected.carrier}</b> {c.selected.service.toLowerCase()} · <b className="tnum text-slate-900">{gbp(c.selected.cost)}</b> · about {c.selected.days} days · ready {fmtDate(sum.readyDate)}
            </p>
            <p className="mt-2 text-slate-600">Next: the carrier confirms a collection slot, you send the commercial invoice with the goods, and the export declaration is made before they leave the UK.</p>
            {c.status === "Can dispatch after review" && <p className="mt-2 font-medium text-amber-800">Amber items are still open. Review them before collection.</p>}
            <button onClick={() => setConfirmed(false)} className="mt-3 text-xs font-semibold text-slate-700 underline underline-offset-2">Edit booking</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3" role="status">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.soft}`}>
            <Icon className={`h-6 w-6 ${s.tone}`} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight text-slate-900"><Flash value={c.status}>{c.status}</Flash></div>
            <div className="text-sm text-slate-500 tnum">{passed} of 10 checks passed</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            disabled={!!blocked}
            onClick={() => setConfirmed(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none"
          >
            {blocked ? <Lock className="h-4 w-4" aria-hidden /> : <CircleCheck className="h-4 w-4" aria-hidden />}
            Confirm booking
          </button>
          {blocked && <span className="max-w-60 text-right text-xs text-slate-500">{blocked}{reds.length ? ` (${reds.map((r) => r.ruleId).join(", ")})` : ""}</span>}
        </div>
      </div>

      <div className="mt-4 flex gap-1" aria-label="Checks overview">
        {[...c.checks].sort((a, b) => a.ruleId.localeCompare(b.ruleId)).map((r) => (
          <span key={r.ruleId} title={`${r.ruleId} ${RULE_NAMES[r.ruleId]}: ${r.status}`} className={`h-1.5 flex-1 rounded-full transition-colors ${SEGMENT[kindOf(r)]}`} />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Carrier" value={c.selected?.carrier ?? overLimit?.carrier ?? "—"} alert={!!overLimit}
          sub={c.selected ? c.selected.service : overLimit ? `over its ${overLimit.maxKgPerPallet} kg limit` : c.rec.minPalletsNeeded ? "none can take the load" : "needs pallets and weight"} />
        <Stat label="Total cost" value={<Flash value={c.selected?.cost}>{c.selected ? gbp(c.selected.cost) : "—"}</Flash>} sub={c.selected ? `${gbp(c.selected.price)} × ${booking.pallets} pallets` : ""} />
        <Stat label="Transit" value={c.selected ? `${c.selected.days} days` : "—"} sub={c.selected ? `${c.selected.onTime}% on time` : ""} />
        <Stat label="Weight / pallet" value={<Flash value={sum.weightPerPallet}>{sum.weightPerPallet != null ? `${sum.weightPerPallet} kg` : "—"}</Flash>} sub={c.selected ? `limit ${c.selected.maxKgPerPallet} kg` : ""} />
      </dl>
    </section>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2.5 ${alert ? "bg-red-50" : "bg-slate-50"}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className={`mt-0.5 truncate text-[15px] font-semibold tnum ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</dd>
      {sub && <dd className={`truncate text-xs tnum ${alert ? "text-red-700" : "text-slate-600"}`}>{sub}</dd>}
    </div>
  );
}

const GROUPS: { kind: "red" | "amber" | "unknown"; title: string; tone: string; iconTone: string }[] = [
  { kind: "red", title: "Needs fixing", tone: "border-red-100 bg-red-50/60", iconTone: "text-red-600" },
  { kind: "amber", title: "Review before dispatch", tone: "border-amber-100 bg-amber-50/60", iconTone: "text-amber-500" },
  { kind: "unknown", title: "Waiting for details", tone: "border-slate-200 bg-slate-50", iconTone: "text-slate-500" },
];

export function ChecksPanel({ checks, onAction }: { checks: CheckResult[]; onAction: (a: CheckAction) => void }) {
  const passed = checks.filter((r) => r.status === "pass").sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return (
    <Card title="Pre-flight checks" icon={ListChecks} aside={<span className="text-xs text-slate-500 tnum">{passed.length}/10 passed</span>}>
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const items = checks.filter((r) => kindOf(r) === g.kind).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
          if (!items.length) return null;
          const Icon = CHECK_ICON[g.kind];
          return (
            <div key={g.kind}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title} · {items.length}</h3>
              <ul className="space-y-2">
                {items.map((r) => (
                  <li key={r.ruleId} className={`rise rounded-xl border px-4 py-3 ${g.tone}`}>
                    <div className="flex gap-3">
                      <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${g.iconTone}`} aria-label={g.title} />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold text-slate-900">{RULE_NAMES[r.ruleId]}</span>
                          <span className="font-mono text-[11px] text-slate-500">{r.ruleId}</span>
                        </div>
                        <p className="mt-0.5 text-slate-700"><Flash value={r.message}>{r.message}</Flash></p>
                        {r.fix && g.kind !== "unknown" && (
                          <p className="mt-2 flex gap-1.5 text-slate-600"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><span className="font-medium text-slate-800">Fix: </span>{r.fix}</span></p>
                        )}
                        {r.status === "fail" && r.actions && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {r.actions.map((a, i) => (
                              <button key={a.label} onClick={() => onAction(a)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${i === 0 ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}>
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {passed.length > 0 && (
          <details className="group" open={passed.length === 10}>
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800">
              <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden /> Passed · {passed.length}
            </summary>
            <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {passed.map((r) => (
                <li key={r.ruleId} className="flex items-start gap-2 text-sm text-slate-600" title={r.message}>
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  <span><span className="font-medium text-slate-800">{RULE_NAMES[r.ruleId]}</span> <span className="font-mono text-[11px] text-slate-500">{r.ruleId}</span></span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

export function CarrierPanel({ booking, c, onSelect }: { booking: Booking; c: Computed; onSelect: (carrier: string | null) => void }) {
  const { rec, selected } = c;
  const isBalanced = (booking.priority ?? "Balanced") === "Balanced";
  const s = summary(booking);
  return (
    <Card title="Carrier" icon={Truck} aside={
      selected && rec.recommended && selected.carrier !== rec.recommended.carrier
        ? <button onClick={() => onSelect(null)} className="text-xs font-semibold text-teal-700 hover:underline">Use recommended</button>
        : booking.priority ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Priority: {booking.priority}</span> : null
    }>
      {rec.reason && <p className="mb-4 text-sm text-slate-600"><Flash value={rec.reason}>{rec.reason}</Flash></p>}
      {s.weightPerPallet != null && rec.options.length > 0 && <LoadGauge perPallet={s.weightPerPallet} options={rec.options} limit={(selected ?? c.chosen)?.maxKgPerPallet} />}
      <ul className="grid gap-3 sm:grid-cols-3">
        {rec.options.map((o) => {
          const isSel = selected?.carrier === o.carrier;
          const isRec = rec.recommended?.carrier === o.carrier;
          return (
            <li key={o.carrier}>
              <button disabled={!o.feasible || o.cost == null} onClick={() => onSelect(isRec ? null : o.carrier)} aria-pressed={isSel}
                className={`relative h-full w-full rounded-xl border p-4 text-left transition ${
                  !o.feasible ? "cursor-not-allowed border-dashed border-slate-300 bg-slate-50 text-slate-500"
                  : isSel ? "border-teal-600 bg-teal-50/40 ring-2 ring-teal-600/20" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-semibold ${o.feasible ? "text-slate-900" : ""}`}>{o.carrier}</div>
                    <div className="text-xs">{o.service}</div>
                  </div>
                  {isRec && <span className="rounded-md bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Best</span>}
                  {isSel && !isRec && <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Selected</span>}
                  {!o.feasible && <Ban className="h-4 w-4 text-slate-500" aria-hidden />}
                </div>
                <div className={`mt-3 text-2xl font-semibold tracking-tight tnum ${o.feasible ? "text-slate-900" : "line-through decoration-slate-300"}`}>
                  <Flash value={o.cost}>{o.cost != null ? gbp(o.cost) : gbp(o.price)}</Flash>
                  <span className="ml-1 text-xs font-normal text-slate-500">{o.cost != null ? "total" : "/pallet"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tnum">
                  <span>{o.days} days</span><span>{o.onTime}% on time</span><span>≤ {o.maxKgPerPallet} kg/pallet</span>
                </div>
                {isBalanced && o.balancedScore != null && <div className="mt-1 text-xs tnum">Score {o.balancedScore.toFixed(3)}</div>}
                {!o.feasible && <div className="mt-2 text-xs font-medium text-slate-700">{o.excludedReason}</div>}
              </button>
            </li>
          );
        })}
      </ul>
      {isBalanced && rec.recommended && (
        <p className="mt-3 text-xs text-slate-500">
          Balanced score = {BALANCED_WEIGHTS.price} × cheapest price ÷ price + {BALANCED_WEIGHTS.days} × fewest days ÷ days + {BALANCED_WEIGHTS.reliability} × on-time ÷ best on-time, across carriers that can take the load.
        </p>
      )}
    </Card>
  );
}

/** Weight per pallet against every carrier's limit, so it's obvious why a carrier is out. */
function LoadGauge({ perPallet, options, limit }: { perPallet: number; options: CarrierOption[]; limit?: number }) {
  const limits = [...options].sort((a, b) => a.maxKgPerPallet - b.maxKgPerPallet);
  const max = Math.max(800, perPallet * 1.1, ...limits.map((o) => o.maxKgPerPallet * 1.07));
  const pct = (kg: number) => `${Math.min(100, (kg / max) * 100)}%`;
  // red when over the limit of the carrier in use (or the priority's pick), or over every carrier's limit
  const over = limit != null ? perPallet > limit : !options.some((o) => o.feasible);
  return (
    <div className="mb-5 rounded-xl bg-slate-50 px-4 pb-3 pt-3.5">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-700">Load per pallet</span>
        <span className={`font-semibold tnum ${over ? "text-red-700" : "text-slate-900"}`}><Flash value={perPallet}>{perPallet} kg</Flash></span>
      </div>
      <div className="relative h-2.5 rounded-full bg-slate-200">
        <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${over ? "bg-red-500" : "bg-teal-600"}`} style={{ width: pct(perPallet) }} />
        {limits.map((o) => (
          <span key={o.carrier} className="absolute -top-1 h-[18px] w-0.5 rounded bg-slate-500" style={{ left: pct(o.maxKgPerPallet) }} aria-hidden />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] font-medium text-slate-500 tnum">
        {limits.map((o) => (
          <span key={o.carrier} className={`absolute -translate-x-1/2 whitespace-nowrap ${perPallet > o.maxKgPerPallet ? "text-red-700" : ""}`} style={{ left: pct(o.maxKgPerPallet) }}>
            {o.carrier.replace("Carrier ", "")} · {o.maxKgPerPallet}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ShipmentCard({ booking }: { booking: Booking }) {
  const s = summary(booking);
  const DestIcon = booking.destType === "Warehouse" ? Warehouse : Building2;
  return (
    <Card title="Shipment" icon={Package} aside={<span className="font-mono text-xs text-slate-500">{booking.id}{booking.sellerName ? ` · ${booking.sellerName}` : ""}</span>}>
      <div className="flex items-center gap-3">
        <Place label="From" city={booking.originCity} country="United Kingdom" />
        <div className="relative flex flex-1 items-center" aria-hidden>
          <span className="h-px flex-1 border-t-2 border-dashed border-slate-300" />
          <Truck className="mx-2 h-4 w-4 text-slate-500" />
          <span className="h-px flex-1 border-t-2 border-dashed border-slate-300" />
        </div>
        <Place label="To" city={booking.destCity} country={booking.destCountry} right />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Field icon={DestIcon} label="Delivering to" value={s.destType} />
        <Field icon={Calendar} label="Ready to ship" value={s.readyDate ? fmtDate(s.readyDate) : null} />
        <Field icon={Boxes} label={<><Term label="Pallets" tip={GLOSSARY.pallet} /> · <Term label="cartons" tip={GLOSSARY.carton} /></>} value={s.pallets != null || s.cartons != null ? `${s.pallets ?? "—"} · ${s.cartons ?? "—"}` : null} />
        <Field label="Gross weight" value={s.grossWeight != null ? `${s.grossWeight} kg` : null} />
        <Field label="Declared value" value={s.declaredValue != null ? gbp(s.declaredValue) : null} />
        <Field label="Appointment" value={booking.destType === "Warehouse" ? booking.appointmentBooked ?? null : "Not needed"} />
      </dl>
      {booking.items.length > 0 && (
        <div className="-mx-5 mt-5 overflow-x-auto border-t border-slate-100 px-5 pt-4">
          <table className="w-full min-w-[560px] text-left text-xs tnum">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="pb-2 pr-3 font-medium"><Term label="HS code" tip={GLOSSARY.hsCode} /></th>
                <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                <th className="pb-2 pr-3 text-right font-medium">Unit price</th>
                <th className="pb-2 pr-3 text-right font-medium">Per carton</th>
                <th className="pb-2 pr-3 text-right font-medium">Cartons</th>
                <th className="pb-2 pr-3 text-right font-medium">Unit kg</th>
                <th className="pb-2 font-medium">Origin</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {booking.items.map((i) => (
                <tr key={i.sku} className="border-t border-slate-100">
                  <td className="py-2 pr-3"><div className="font-medium text-slate-900">{i.description || "—"}</div><div className="font-mono text-[10px] text-slate-500">{i.sku}</div></td>
                  <td className="py-2 pr-3 font-mono">{i.hsCode ?? <Missing tone="red" />}</td>
                  <td className="py-2 pr-3 text-right"><Flash value={i.quantity}>{i.quantity ?? "—"}</Flash></td>
                  <td className="py-2 pr-3 text-right"><Flash value={i.unitPrice}>{i.unitPrice != null ? gbp(i.unitPrice) : "—"}</Flash></td>
                  <td className="py-2 pr-3 text-right">{i.unitsPerCarton ?? "—"}</td>
                  <td className="py-2 pr-3 text-right"><Flash value={i.cartons}>{i.cartons ?? "—"}</Flash></td>
                  <td className="py-2 pr-3 text-right">{i.unitWeight ?? "—"}</td>
                  <td className="py-2">{i.countryOfOrigin ?? <Missing tone="amber" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Missing({ tone }: { tone: "red" | "amber" }) {
  return <span className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold ${tone === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>missing</span>;
}

function Place({ label, city, country, right }: { label: string; city: string | null; country: string | null; right?: boolean }) {
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 ${right ? "justify-end" : ""}`}>
        <MapPin className="h-3 w-3" aria-hidden />{label}
      </div>
      <div className={`truncate text-lg font-semibold tracking-tight ${city ? "text-slate-900" : "text-slate-300"}`}><Flash value={city}>{city ?? "City?"}</Flash></div>
      <div className="truncate text-xs text-slate-500">{country ?? "—"}</div>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon?: typeof Calendar; label: React.ReactNode; value: React.ReactNode | null }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-slate-500">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}{label}</dt>
      <dd className={`mt-0.5 truncate font-medium tnum ${value == null ? "text-slate-300" : "text-slate-900"}`}><Flash value={value}>{value ?? "Not given"}</Flash></dd>
    </div>
  );
}

export function NextSteps({ status, checks }: { status: OverallStatus; checks: CheckResult[] }) {
  return (
    <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]" open={status === "Ready to dispatch"}>
      <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm font-semibold text-slate-900">
        <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-slate-500" aria-hidden />Before you ship</span>
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="space-y-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
        {nextSteps(status, checks).map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 tnum">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
