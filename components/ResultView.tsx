"use client";
import {
  ArrowRight, Ban, BadgeCheck, Boxes, Building2, Calendar, Check, ChevronDown, CircleCheck, Copy, ListChecks, Lock, Mail,
  MapPin, Package, Route, Truck, Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { summary } from "@/lib/booking";
import { BALANCED_WEIGHTS, recommend } from "@/lib/carriers";
import { CALAIS, CITIES, DOVER, MAP_H, MAP_W, OUTLINES, project, toPath, type LatLon } from "@/lib/geo";
import { GLOSSARY, nextSteps } from "@/lib/guidance";
import { addDays, buildNotice, langFor, LANGS, type Lang } from "@/lib/notice";
import { chosenCarrier, isBlocking, overallStatus, runChecks, type Classifications } from "@/lib/rules";
import type { Booking, CarrierOption, CheckAction, CheckResult, OverallStatus, RateOption } from "@/lib/types";
import { CHECK_ICON, Card, Flash, PillTabs, SEVERITY, STATUS, SeverityTag, Term, fmtDate, gbp } from "./ui";

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

type View = "overview" | "checks" | "details" | "notice";

export function ResultView({ booking, today, classifications, onChange }: Props) {
  const c = useMemo(() => compute(booking, today, classifications), [booking, today, classifications]);
  const [view, setView] = useState<View>("overview");
  const act = (a: CheckAction) => {
    if (a.kind === "switch-carrier") onChange({ ...booking, carrierOverride: a.carrier });
    if (a.kind === "add-pallets") onChange({ ...booking, pallets: a.pallets ?? booking.pallets });
  };
  const issues = c.checks.filter((r) => r.status !== "pass").length;
  return (
    <div className="space-y-4">
      <StatusHero booking={booking} c={c} onOpenNotice={() => setView("notice")} />
      <PillTabs label="Booking sections" value={view} onChange={setView} tabs={[
        { id: "overview", label: "Overview" },
        { id: "checks", label: "All checks", badge: issues },
        { id: "details", label: "Shipment details" },
        { id: "notice", label: "Receiver notice" },
      ]} />
      {view === "overview" && (
        <div className="space-y-4">
          <FixList checks={c.checks} onAction={act} onSeeAll={() => setView("checks")} />
          <CarrierPanel booking={booking} c={c} onSelect={(carrier) => onChange({ ...booking, carrierOverride: carrier })} />
          <RouteMap booking={booking} carrier={c.selected} />
        </div>
      )}
      {view === "checks" && <ChecksPanel checks={c.checks} onAction={act} />}
      {view === "details" && (
        <div className="space-y-4">
          <ShipmentCard booking={booking} />
          <NextSteps status={c.status} checks={c.checks} />
        </div>
      )}
      {view === "notice" && <NoticeCard booking={booking} c={c} />}
    </div>
  );
}

const RULE_NAMES: Record<string, string> = {
  "R-01": "HS code", "R-02": "Declared value", "R-03": "Units per carton", "R-04": "Carton total",
  "R-05": "Weight per pallet", "R-06": "Banned goods", "R-07": "Gross weight", "R-08": "Delivery appointment",
  "R-09": "Country of origin", "R-10": "Ready date",
};

const kindOf = (r: CheckResult) => (r.status === "pass" ? "pass" : r.status === "cannot-check" ? "unknown" : r.severity);
const SEGMENT: Record<string, string> = { pass: "bg-lime-500", red: "bg-red-500", amber: "bg-amber-400", unknown: "bg-slate-200" };

function blockReason(c: Computed) {
  const reds = c.checks.filter((r) => isBlocking(r, "red"));
  if (reds.length) return `Fix or complete ${reds.length} "must fix" ${reds.length === 1 ? "check" : "checks"} first (${reds.map((r) => r.ruleId).join(", ")})`;
  return !c.selected ? "No carrier can take this load yet" : null;
}

/** The verdict at a glance: status, a 10-segment checks bar, the chosen carrier and the confirm action. */
export function StatusHero({ booking, c, onOpenNotice }: { booking: Booking; c: Computed; onOpenNotice: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const s = STATUS[c.status];
  const Icon = s.icon;
  const passed = c.checks.filter((r) => r.status === "pass").length;
  const blocked = blockReason(c);
  const sum = summary(booking);
  const overLimit = !c.selected && c.chosen && sum.weightPerPallet != null && sum.weightPerPallet > c.chosen.maxKgPerPallet ? c.chosen : null;

  if (confirmed && !blocked && c.selected) {
    return (
      <section className="rise rounded-2xl border border-lime-300 bg-gradient-to-br from-lime-50 to-white p-5 shadow-sm" role="status">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-forest-700" aria-hidden />
          <div className="min-w-0 text-sm text-slate-700">
            <p className="text-base font-semibold text-forest-950">Booking confirmed <span className="font-normal text-slate-600">(demo)</span></p>
            <p className="mt-1.5">
              {sum.route} · {sum.cartons} cartons on {sum.pallets} pallets ({sum.grossWeight} kg) · <b className="text-forest-950">{c.selected.carrier}</b> {c.selected.service.toLowerCase()} · <b className="tnum text-forest-950">{gbp(c.selected.cost)}</b> · about {c.selected.days} days · ready {fmtDate(sum.readyDate)}
            </p>
            <p className="mt-2 text-slate-600">Next: the carrier confirms a collection slot, you send the commercial invoice with the goods, and the export declaration is made before they leave the UK. Send the receiver the delivery notice so they know exactly what to count.</p>
            {c.status === "Can dispatch after review" && <p className="mt-2 font-medium text-amber-800">Some &quot;check before shipping&quot; items are still open. Look at them before collection.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onOpenNotice} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-800">
                <Mail className="h-3.5 w-3.5" aria-hidden />Open receiver notice
              </button>
              <button onClick={() => setConfirmed(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">Edit booking</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,40,30,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3" role="status">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.soft}`}>
            <Icon className={`h-6 w-6 ${s.tone}`} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight text-forest-950"><Flash value={c.status}>{c.status}</Flash></div>
            <div className="text-sm text-slate-600 tnum">{passed} of 10 checks passed</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button disabled={!!blocked} onClick={() => setConfirmed(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-forest-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none">
            {blocked ? <Lock className="h-4 w-4" aria-hidden /> : <CircleCheck className="h-4 w-4 text-lime-400" aria-hidden />}
            Confirm booking
          </button>
          {blocked && <span className="max-w-64 text-right text-xs text-slate-600">{blocked}</span>}
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
        <Stat label="Arrives" value={c.selected && sum.readyDate ? fmtDate(addDays(sum.readyDate, c.selected.days)) : c.selected ? `${c.selected.days} days` : "—"} sub={c.selected ? `${c.selected.days} days · ${c.selected.onTime}% on time` : ""} />
        <Stat label="Weight / pallet" value={<Flash value={sum.weightPerPallet}>{sum.weightPerPallet != null ? `${sum.weightPerPallet} kg` : "—"}</Flash>} sub={(c.selected ?? c.chosen) ? `limit ${(c.selected ?? c.chosen)!.maxKgPerPallet} kg` : ""} />
      </dl>
    </section>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2.5 ${alert ? "bg-red-50" : "bg-slate-50"}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className={`mt-0.5 truncate text-[15px] font-semibold tnum ${alert ? "text-red-700" : "text-forest-950"}`}>{value}</dd>
      {sub && <dd className={`truncate text-xs tnum ${alert ? "text-red-700" : "text-slate-600"}`}>{sub}</dd>}
    </div>
  );
}

const GROUPS: { kind: "red" | "amber" | "unknown"; title: string; hint: string; tone: string; iconTone: string }[] = [
  { kind: "red", title: SEVERITY.red.label, hint: SEVERITY.red.hint, tone: "border-red-100 bg-red-50/60", iconTone: "text-red-600" },
  { kind: "amber", title: SEVERITY.amber.label, hint: SEVERITY.amber.hint, tone: "border-amber-100 bg-amber-50/60", iconTone: "text-amber-500" },
  { kind: "unknown", title: "Waiting for details", hint: "Can't run yet", tone: "border-slate-200 bg-slate-50", iconTone: "text-slate-500" },
];

function CheckItem({ r, group, onAction }: { r: CheckResult; group: (typeof GROUPS)[number]; onAction: (a: CheckAction) => void }) {
  const Icon = CHECK_ICON[group.kind];
  return (
    <li className={`rise rounded-xl border px-4 py-3 ${group.tone}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${group.iconTone}`} aria-label={group.title} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-forest-950">{RULE_NAMES[r.ruleId]}</span>
            <span className="font-mono text-[11px] text-slate-600">{r.ruleId}</span>
            {r.status === "fail" && <SeverityTag severity={r.severity} />}
          </div>
          <p className="mt-0.5 text-slate-700"><Flash value={r.message}>{r.message}</Flash></p>
          {r.fix && group.kind !== "unknown" && (
            <p className="mt-2 flex gap-1.5 text-slate-600"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span><span className="font-medium text-slate-800">Fix: </span>{r.fix}</span></p>
          )}
          {r.status === "fail" && r.actions && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.actions.map((a, i) => (
                <button key={a.label} onClick={() => onAction(a)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${i === 0 ? "bg-forest-900 text-white hover:bg-forest-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Overview: only what needs action, most serious first. */
function FixList({ checks, onAction, onSeeAll }: { checks: CheckResult[]; onAction: (a: CheckAction) => void; onSeeAll: () => void }) {
  const fails = GROUPS.slice(0, 2).flatMap((g) => checks.filter((r) => kindOf(r) === g.kind).map((r) => ({ r, g })));
  const waiting = checks.filter((r) => r.status === "cannot-check").length;
  const passed = checks.filter((r) => r.status === "pass").length;
  if (!fails.length) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-lime-200 bg-lime-50/70 px-5 py-4 text-sm">
        <CircleCheck className="h-5 w-5 text-forest-700" aria-hidden />
        <span className="font-medium text-forest-950">{waiting ? `Nothing to fix so far. ${waiting} ${waiting === 1 ? "check is" : "checks are"} waiting for details.` : "Nothing to fix. All 10 checks pass."}</span>
        <button onClick={onSeeAll} className="ml-auto text-xs font-semibold text-forest-700 hover:underline">See all checks</button>
      </div>
    );
  }
  return (
    <Card title="What to fix" icon={ListChecks} aside={<button onClick={onSeeAll} className="text-xs font-semibold text-forest-700 hover:underline">All checks ({passed}/10 passed)</button>}>
      <ul className="space-y-2">{fails.map(({ r, g }) => <CheckItem key={r.ruleId} r={r} group={g} onAction={onAction} />)}</ul>
      {waiting > 0 && <p className="mt-3 text-xs text-slate-600">{waiting} more {waiting === 1 ? "check is" : "checks are"} waiting for details.</p>}
    </Card>
  );
}

export function ChecksPanel({ checks, onAction }: { checks: CheckResult[]; onAction: (a: CheckAction) => void }) {
  const passed = checks.filter((r) => r.status === "pass").sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return (
    <Card title="All 10 checks" icon={ListChecks} aside={<span className="text-xs text-slate-600 tnum">{passed.length}/10 passed</span>}>
      <div className="space-y-5">
        {GROUPS.map((g) => {
          const items = checks.filter((r) => kindOf(r) === g.kind).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
          if (!items.length) return null;
          return (
            <div key={g.kind}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{g.title} · {items.length} <span className="font-normal normal-case tracking-normal">· {g.hint}</span></h3>
              <ul className="space-y-2">{items.map((r) => <CheckItem key={r.ruleId} r={r} group={g} onAction={onAction} />)}</ul>
            </div>
          );
        })}
        {passed.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Passed · {passed.length}</h3>
            <ul className="space-y-1.5">
              {passed.map((r) => (
                <li key={r.ruleId} className="flex items-start gap-2 text-sm text-slate-700">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" aria-hidden />
                  <span><span className="font-medium text-forest-950">{RULE_NAMES[r.ruleId]}</span> <span className="font-mono text-[11px] text-slate-600">{r.ruleId}</span> · {r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-600">
          <b className="text-slate-800">Must fix</b> = rulebook severity Red: the booking can&apos;t be confirmed until it passes. <b className="text-slate-800">Check before shipping</b> = Amber: you can still ship, but it may cause delays.
        </p>
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
        ? <button onClick={() => onSelect(null)} className="text-xs font-semibold text-forest-700 hover:underline">Use recommended</button>
        : booking.priority ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Priority: {booking.priority}</span> : null
    }>
      {rec.reason && <p className="mb-4 text-sm text-slate-700"><Flash value={rec.reason}>{rec.reason}</Flash></p>}
      {s.weightPerPallet != null && rec.options.length > 0 && <LoadGauge perPallet={s.weightPerPallet} options={rec.options} limit={(selected ?? c.chosen)?.maxKgPerPallet} />}
      <ul className="grid gap-3 sm:grid-cols-3">
        {rec.options.map((o) => {
          const isSel = selected?.carrier === o.carrier;
          const isRec = rec.recommended?.carrier === o.carrier;
          return (
            <li key={o.carrier}>
              <button disabled={!o.feasible || o.cost == null} onClick={() => onSelect(isRec ? null : o.carrier)} aria-pressed={isSel}
                className={`relative h-full w-full rounded-xl border p-4 text-left transition ${
                  !o.feasible ? "cursor-not-allowed border-dashed border-slate-300 bg-slate-50 text-slate-600"
                  : isSel ? "border-forest-700 bg-lime-50/60 ring-2 ring-lime-400/50" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-semibold ${o.feasible ? "text-forest-950" : ""}`}>{o.carrier}</div>
                    <div className="text-xs">{o.service}</div>
                  </div>
                  {isRec && <span className="rounded-md bg-lime-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest-950">Best</span>}
                  {isSel && !isRec && <span className="rounded-md bg-forest-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Selected</span>}
                  {!o.feasible && <Ban className="h-4 w-4 text-slate-500" aria-hidden />}
                </div>
                <div className={`mt-3 text-2xl font-semibold tracking-tight tnum ${o.feasible ? "text-forest-950" : "line-through decoration-slate-300"}`}>
                  <Flash value={o.cost}>{o.cost != null ? gbp(o.cost) : gbp(o.price)}</Flash>
                  <span className="ml-1 text-xs font-normal text-slate-600">{o.cost != null ? "total" : "/pallet"}</span>
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
        <p className="mt-3 text-xs text-slate-600">
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
        <span className={`font-semibold tnum ${over ? "text-red-700" : "text-forest-950"}`}><Flash value={perPallet}>{perPallet} kg</Flash></span>
      </div>
      <div className="relative h-2.5 rounded-full bg-slate-200">
        <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${over ? "bg-red-500" : "bg-lime-500"}`} style={{ width: pct(perPallet) }} />
        {limits.map((o) => <span key={o.carrier} className="absolute -top-1 h-[18px] w-0.5 rounded bg-forest-800" style={{ left: pct(o.maxKgPerPallet) }} aria-hidden />)}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] font-medium text-slate-600 tnum">
        {limits.map((o) => (
          <span key={o.carrier} className={`absolute -translate-x-1/2 whitespace-nowrap ${perPallet > o.maxKgPerPallet ? "text-red-700" : ""}`} style={{ left: pct(o.maxKgPerPallet) }}>
            {o.carrier.replace("Carrier ", "")} · {o.maxKgPerPallet}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Schematic map of the lane: UK origin, the Dover–Calais crossing, the destination city. */
function RouteMap({ booking, carrier }: { booking: Booking; carrier: CarrierOption | null }) {
  const origin = booking.originCity ? CITIES[booking.originCity] : null;
  const dest = booking.destCity ? CITIES[booking.destCity] : null;
  const pts: LatLon[] = [origin, origin && dest ? DOVER : null, origin && dest ? CALAIS : null, dest].filter(Boolean) as LatLon[];
  const xy = pts.map(project);
  // zoom the window onto the route
  const W = 300, H = 190;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const cx = xy.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : MAP_W * 0.4;
  const cy = xy.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : MAP_H * 0.35;
  const spanX = xy.length ? Math.max(...xs) - Math.min(...xs) : W;
  const spanY = xy.length ? Math.max(...ys) - Math.min(...ys) : H;
  const scale = Math.max(1, (spanX + 150) / W, (spanY + 110) / H);
  const vw = W * scale, vh = H * scale;
  const vx = Math.min(Math.max(cx - vw / 2, 0), MAP_W - vw), vy = Math.min(Math.max(cy - vh / 2, 0), MAP_H - vh);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  const r = 3.2 * scale;

  return (
    <Card title="Route" icon={Route} aside={booking.destCountry ? <span className="text-xs text-slate-600">Road freight via Dover–Calais</span> : null}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="overflow-hidden rounded-xl bg-sky-50 ring-1 ring-slate-200">
          <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="block h-auto w-full" role="img"
            aria-label={origin && dest ? `Map of the route from ${booking.originCity} to ${booking.destCity} via Dover and Calais` : "Map of the UK and the destination countries"}>
            {Object.entries(OUTLINES).map(([country, outline]) => {
              const active = country === "United Kingdom" || country === booking.destCountry;
              return <path key={country} d={toPath(outline)} strokeWidth={0.8 * scale} strokeLinejoin="round"
                className={active ? "fill-lime-100 stroke-lime-600" : "fill-white stroke-slate-300"} />;
            })}
            {Object.entries(CITIES).map(([name, ll]) => {
              if (name === booking.originCity || name === booking.destCity) return null;
              const [x, y] = project(ll);
              return <circle key={name} cx={x} cy={y} r={1.6 * scale} className="fill-slate-400" />;
            })}
            {xy.length > 1 && (
              <>
                <path d={line} fill="none" strokeWidth={2.4 * scale} strokeLinecap="round" strokeLinejoin="round" className="stroke-forest-800" />
                <path d={line} fill="none" strokeWidth={2.4 * scale} strokeLinecap="round" strokeDasharray={`${4 * scale} ${6 * scale}`} className="route-dash stroke-lime-300" />
              </>
            )}
            {([[booking.originCity, origin], [booking.destCity, dest]] as [string | null, LatLon | null][]).map(([name, ll]) => {
              if (!ll || !name) return null;
              const [x, y] = project(ll);
              return (
                <g key={name}>
                  <circle cx={x} cy={y} r={r * 1.9} className="fill-lime-400/40" />
                  <circle cx={x} cy={y} r={r} strokeWidth={1.2 * scale} className="fill-forest-900 stroke-white" />
                  <text x={x} y={y - r * 2.6} textAnchor="middle" fontSize={10 * scale} fontWeight={600} strokeWidth={3 * scale} paintOrder="stroke" className="fill-forest-950 stroke-white">{name}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <dl className="grid content-start gap-3 text-sm">
          <RouteFact label="From" value={booking.originCity ? `${booking.originCity}, UK` : null} />
          <RouteFact label="Crossing" value={origin && dest ? "Dover → Calais" : null} />
          <RouteFact label="To" value={booking.destCity ? `${booking.destCity}, ${booking.destCountry}` : null} />
          <RouteFact label="Transit" value={carrier ? `${carrier.days} days with ${carrier.carrier}` : null} />
        </dl>
      </div>
    </Card>
  );
}

function RouteFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={`font-medium ${value ? "text-forest-950" : "text-slate-500"}`}><Flash value={value}>{value ?? "Not given"}</Flash></dd>
    </div>
  );
}

export function ShipmentCard({ booking }: { booking: Booking }) {
  const s = summary(booking);
  const DestIcon = booking.destType === "Warehouse" ? Warehouse : Building2;
  return (
    <Card title="Shipment" icon={Package} aside={<span className="font-mono text-xs text-slate-600">{booking.id}{booking.sellerName ? ` · ${booking.sellerName}` : ""}</span>}>
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
            <thead className="text-[11px] uppercase tracking-wide text-slate-600">
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
                  <td className="py-2 pr-3"><div className="font-medium text-forest-950">{i.description || "—"}</div><div className="font-mono text-[10px] text-slate-600">{i.sku}</div></td>
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
      <div className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-600 ${right ? "justify-end" : ""}`}>
        <MapPin className="h-3 w-3" aria-hidden />{label}
      </div>
      <div className={`truncate text-lg font-semibold tracking-tight ${city ? "text-forest-950" : "text-slate-500"}`}><Flash value={city}>{city ?? "City?"}</Flash></div>
      <div className="truncate text-xs text-slate-600">{country ?? "—"}</div>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon?: typeof Calendar; label: React.ReactNode; value: React.ReactNode | null }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-slate-600">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}{label}</dt>
      <dd className={`mt-0.5 truncate font-medium tnum ${value == null ? "text-slate-500" : "text-forest-950"}`}><Flash value={value}>{value ?? "Not given"}</Flash></dd>
    </div>
  );
}

export function NextSteps({ status, checks }: { status: OverallStatus; checks: CheckResult[] }) {
  return (
    <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,30,0.05)]" open>
      <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm font-semibold text-forest-950">
        <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-slate-500" aria-hidden />Before you ship</span>
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="space-y-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
        {nextSteps(status, checks).map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-100 text-[11px] font-semibold text-forest-800 tnum">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Advance notice for the receiving site, in the destination's language. */
function NoticeCard({ booking, c }: { booking: Booking; c: Computed }) {
  const [lang, setLang] = useState<Lang>(() => langFor(booking.destCountry));
  const [copied, setCopied] = useState(false);
  const blocked = blockReason(c);
  if (blocked || !c.selected) {
    return (
      <Card title="Receiver notice" icon={Mail}>
        <div className="flex items-start gap-3 text-sm text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p>The delivery notice for the receiver is ready once every &quot;must fix&quot; check passes and a carrier is chosen. <span className="text-slate-600">({blocked})</span></p>
        </div>
      </Card>
    );
  }
  const n = buildNotice(booking, c.selected, lang);
  const copy = async () => {
    try { await navigator.clipboard.writeText(n.text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <Card title="Receiver notice" icon={Mail} aside={
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-800">
        {copied ? <Check className="h-3.5 w-3.5 text-lime-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copied" : "Copy text"}
      </button>
    }>
      <p className="mb-3 text-sm text-slate-700">Send this to the receiving site so they know exactly what&apos;s coming and can count it on arrival. Language follows the destination; switch if needed.</p>
      <PillTabs label="Notice language" value={lang} onChange={setLang} tabs={LANGS.map((l) => ({ id: l.id, label: l.label }))} />
      <article lang={lang} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-lg font-semibold tracking-tight text-forest-950">{n.title}</h3>
        <p className="mt-1 text-sm text-slate-700">{n.intro}</p>
        {n.appointmentWarning && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{n.fields.at(-1)![0]}: {n.fields.at(-1)![1]}</p>}
        <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {n.fields.map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-slate-600">{k}</dt><dd className="font-medium text-forest-950 tnum">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm tnum">
            <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">{n.contentsLabel}</caption>
            <thead className="text-xs text-slate-600"><tr>{n.itemHead.map((h, i) => <th key={h} className={`py-1.5 pr-3 font-medium ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{n.items.map((row) => (
              <tr key={row[0]} className="border-t border-slate-200">{row.map((cell, i) => <td key={i} className={`py-1.5 pr-3 ${i === 0 ? "font-mono text-xs" : ""} ${i > 1 ? "text-right" : ""}`}>{cell}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </article>
    </Card>
  );
}
