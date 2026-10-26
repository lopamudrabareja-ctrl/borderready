"use client";
import {
  ArrowRight, Ban, BadgeCheck, Boxes, Building2, Calculator, Calendar, Check, ChevronDown, CircleCheck, CircleX, Copy, ListChecks, Lock, Mail,
  MapPin, Package, Pencil, Route, TriangleAlert, Truck, Warehouse, XCircle,
} from "lucide-react";
import { useImperativeHandle, useMemo, useState, type Ref } from "react";
import { summary } from "@/lib/booking";
import { workings } from "@/lib/calc";
import { BALANCED_WEIGHTS, recommend } from "@/lib/carriers";
import { decide, type Decision } from "@/lib/confirm";
import { CALAIS, CITIES, DOVER, MAP_H, MAP_W, OUTLINES, project, toPath, type LatLon } from "@/lib/geo";
import { GLOSSARY, nextSteps } from "@/lib/guidance";
import { addDays, buildNotice } from "@/lib/notice";
import { editCutoff, loadSounds } from "@/lib/orders";
import { chosenCarrier, isBlocking, overallStatus, runChecks, type Classifications } from "@/lib/rules";
import { playAlert } from "@/lib/sound";
import type { Booking, CarrierOption, CheckAction, CheckResult, OverallStatus, RateOption } from "@/lib/types";
import { BookingEditor } from "./BookingEditor";
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

/** Lets the chat confirm by message ("confirm booking") through the same flow as the button. */
export interface ResultHandle { attemptConfirm: (force?: boolean) => Decision & { orderId?: string } }

export interface OrderInfo { id: string; state: "editable" | "locked" | "cancelled" }

interface Props {
  booking: Booking;
  today: string;
  classifications?: Classifications;
  onChange: (b: Booking) => void;
  /** New bookings: save the confirmed booking and return its order number (existingId when re-confirming). */
  onConfirmed?: (b: Booking, carrier: CarrierOption, warnings: number, existingId?: string) => string;
  /** Saved orders: show the order banner; edits must pass the must-fix checks before onChange saves them. */
  order?: OrderInfo;
  onCancelOrder?: () => void;
  /** Already saved as an order (e.g. a spreadsheet booking confirmed earlier): open as confirmed. */
  saved?: { id: string; booking: Booking };
  ref?: Ref<ResultHandle>;
}

type View = "overview" | "checks" | "calc" | "details" | "notice";

export function ResultView({ booking, today, classifications, onChange, onConfirmed, order, onCancelOrder, saved, ref }: Props) {
  const c = useMemo(() => compute(booking, today, classifications), [booking, today, classifications]);
  const [view, setView] = useState<View>("overview");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [alert, setAlert] = useState<Decision | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string; snapshot: string } | null>(() =>
    saved ? { id: saved.id, snapshot: JSON.stringify({ ...saved.booking, id: booking.id }) } : null);
  const [notified, setNotified] = useState(false);
  const snapshot = JSON.stringify(booking);
  // a confirmation stands only for the booking as it was confirmed; any later change needs confirming again
  const confirmedNow = order ? order.state !== "cancelled" : !!confirmed && confirmed.snapshot === snapshot;
  const changedSinceConfirm = !order && !!confirmed && confirmed.snapshot !== snapshot;

  const act = (a: CheckAction) => {
    if (a.kind === "switch-carrier") onChange({ ...booking, carrierOverride: a.carrier });
    if (a.kind === "add-pallets") onChange({ ...booking, pallets: a.pallets ?? booking.pallets });
  };

  const attemptConfirm = (force = false): Decision & { orderId?: string } => {
    const d = decide(c.checks, c.selected, force);
    const sounds = loadSounds();
    if (d.kind === "blocked") { if (sounds) playAlert("red"); setAlert(d); setView("overview"); setEditing(false); return d; }
    if (d.kind === "warn") { if (sounds) playAlert("amber"); setAlert(d); return d; }
    const warnings = c.checks.filter((r) => isBlocking(r, "amber")).length;
    const id = onConfirmed?.(booking, c.selected!, warnings, confirmed?.id) ?? confirmed?.id ?? "DEMO";
    setConfirmed({ id, snapshot });
    setAlert(null);
    return { ...d, orderId: id };
  };
  useImperativeHandle(ref, () => ({ attemptConfirm }));

  const saveEdit = (b: Booking) => {
    if (order) {
      // a saved order must stay bookable: no must-fix items after the change
      const nc = compute(b, today, classifications);
      const d = decide(nc.checks, nc.selected, true);
      if (d.kind === "blocked") {
        if (loadSounds()) playAlert("red");
        setEditError(d.message);
        return;
      }
    }
    setEditError(null);
    setEditing(false);
    setAlert(null);
    onChange(b);
  };

  const issues = c.checks.filter((r) => r.status !== "pass").length;
  const readOnly = order ? order.state !== "editable" : false;
  return (
    <div className="space-y-4">
      {order && <OrderBanner booking={booking} order={order} />}
      <StatusHero booking={booking} c={c} confirmed={confirmedNow} confirmedId={order?.id ?? confirmed?.id} changedSinceConfirm={changedSinceConfirm}
        notified={notified} alert={alert} isOrder={!!order} readOnly={readOnly} editing={editing}
        onConfirm={() => attemptConfirm(false)} onForce={() => attemptConfirm(true)} onDismissAlert={() => setAlert(null)}
        onEdit={() => { setEditing(true); setEditError(null); }} onCancelOrder={onCancelOrder} onOpenNotice={() => setView("notice")} />
      {editing ? (
        <>
          {editError && <div role="alert" className="whitespace-pre-line rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">{editError}</div>}
          <BookingEditor booking={booking} today={today} onSave={saveEdit} onCancel={() => { setEditing(false); setEditError(null); }} saveLabel={order ? "Save changes to order" : "Save changes"} />
        </>
      ) : (
        <>
          <PillTabs label="Booking sections" value={view} onChange={setView} tabs={[
            { id: "overview", label: "Overview" },
            { id: "checks", label: "All checks", badge: issues },
            { id: "calc", label: "Calculator" },
            { id: "details", label: "Shipment details" },
            { id: "notice", label: "Receiver notice" },
          ]} />
          {view === "overview" && (
            <div className="space-y-4">
              <FixList checks={c.checks} onAction={readOnly ? () => {} : act} onSeeAll={() => setView("checks")} />
              <CarrierPanel booking={booking} c={c} onSelect={(carrier) => !readOnly && onChange({ ...booking, carrierOverride: carrier })} />
              <RouteMap booking={booking} carrier={c.selected} />
            </div>
          )}
          {view === "checks" && <ChecksPanel checks={c.checks} onAction={readOnly ? () => {} : act} />}
          {view === "calc" && <CalculatorPanel booking={booking} />}
          {view === "details" && (
            <div className="space-y-4">
              <ShipmentCard booking={booking} />
              <NextSteps status={c.status} checks={c.checks} />
            </div>
          )}
          {view === "notice" && <NoticeCard booking={booking} c={c} confirmed={confirmedNow} onCopied={() => setNotified(true)} />}
        </>
      )}
    </div>
  );
}

function OrderBanner({ booking, order }: { booking: Booking; order: OrderInfo }) {
  const cutoff = editCutoff(booking);
  const tone = order.state === "editable" ? "border-lime-300 bg-lime-50 text-forest-950" : order.state === "locked" ? "border-slate-300 bg-slate-100 text-slate-800" : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${tone}`}>
      <span className="font-mono font-semibold">{order.id}</span>
      <span>·</span>
      {order.state === "editable" && <span><b>You can still edit this order</b>{cutoff ? ` until the end of ${fmtDate(cutoff)} (the day before collection).` : "."}</span>}
      {order.state === "locked" && <span><Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden /><b>Locked.</b> The edit deadline ({cutoff ? fmtDate(cutoff) : "—"}) has passed. Contact the carrier to change it.</span>}
      {order.state === "cancelled" && <span><b>Cancelled.</b> Kept here for your records.</span>}
    </div>
  );
}

const RULE_NAMES: Record<string, string> = {
  "R-01": "HS code", "R-02": "Declared value", "R-03": "Units per carton", "R-04": "Carton total",
  "R-05": "Weight per pallet", "R-06": "Banned goods", "R-07": "Gross weight", "R-08": "Delivery appointment",
  "R-09": "Country of origin", "R-10": "Ready date",
};

const kindOf = (r: CheckResult) => (r.status === "pass" ? "pass" : r.status === "cannot-check" ? "unknown" : r.severity);
const ARC: Record<string, string> = { pass: "stroke-lime-500", red: "stroke-red-500", amber: "stroke-amber-400", unknown: "stroke-slate-200" };

/** Half-circle gauge with one segment per rule, coloured by its result. */
function ChecksGauge({ checks, passed }: { checks: CheckResult[]; passed: number }) {
  const sorted = [...checks].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const cx = 60, cy = 60, r = 46, gap = 3, step = 180 / sorted.length;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)].map((n) => n.toFixed(2)).join(",");
  return (
    <svg viewBox="0 0 120 68" className="h-[68px] w-[120px] shrink-0" role="img" aria-label={`${passed} of 10 checks passed`}>
      {sorted.map((ck, i) => {
        const a1 = 180 - i * step - gap / 2, a2 = 180 - (i + 1) * step + gap / 2;
        return (
          <path key={ck.ruleId} d={`M${pt(a1)} A${r},${r} 0 0 1 ${pt(a2)}`} fill="none" strokeWidth={11} className={`transition-colors ${ARC[kindOf(ck)]}`}>
            <title>{`${ck.ruleId} ${RULE_NAMES[ck.ruleId]}: ${ck.status}`}</title>
          </path>
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-forest-950 tnum" fontSize="20" fontWeight="700">{passed}<tspan className="fill-slate-500" fontSize="12" fontWeight="600">/10</tspan></text>
    </svg>
  );
}

/** Where the seller is in the booking journey; each step is derived from the booking, not stored. */
function Progress({ c, confirmed, notified }: { c: Computed; confirmed: boolean; notified: boolean }) {
  const steps = [
    { label: "Details", full: "All details given", done: c.checks.every((r) => r.status !== "cannot-check") },
    { label: "No must-fix", full: "No must-fix issues", done: !c.checks.some((r) => isBlocking(r, "red")) },
    { label: "Carrier", full: "Carrier chosen", done: !!c.selected },
    { label: "Confirmed", full: "Booking confirmed", done: confirmed },
    { label: "Receiver told", full: "Receiver notice copied", done: confirmed && notified },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="mt-5 flex items-start border-t border-slate-100 pt-4" aria-label="Booking progress">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-1 flex-col items-center text-center" title={s.full} aria-current={i === current ? "step" : undefined}>
          {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${steps[i - 1].done && s.done ? "bg-lime-500" : "bg-slate-200"}`} aria-hidden />}
          <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tnum ring-4 ring-white ${
            s.done ? "bg-lime-500 text-forest-950" : i === current ? "bg-forest-900 text-white" : "bg-slate-100 text-slate-500"
          }`}>
            {s.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={`mt-1.5 text-[11px] leading-tight ${s.done ? "font-medium text-forest-950" : i === current ? "font-semibold text-forest-950" : "text-slate-500"}`}>
            {s.label}<span className="sr-only">{s.done ? " (done)" : i === current ? " (next)" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The verdict at a glance: checks gauge, status, key numbers, progress and the confirm action. */
export function StatusHero({ booking, c, confirmed, confirmedId, changedSinceConfirm, notified, alert, isOrder, readOnly, editing,
  onConfirm, onForce, onDismissAlert, onEdit, onCancelOrder, onOpenNotice }: {
  booking: Booking; c: Computed; confirmed: boolean; confirmedId?: string; changedSinceConfirm: boolean; notified: boolean; alert: Decision | null;
  isOrder: boolean; readOnly: boolean; editing: boolean;
  onConfirm: () => void; onForce: () => void; onDismissAlert: () => void; onEdit: () => void; onCancelOrder?: () => void; onOpenNotice: () => void;
}) {
  const s = STATUS[c.status];
  const Icon = s.icon;
  const passed = c.checks.filter((r) => r.status === "pass").length;
  const reds = c.checks.filter((r) => isBlocking(r, "red")).length;
  const ambers = c.checks.filter((r) => isBlocking(r, "amber")).length;
  const sum = summary(booking);
  const overLimit = !c.selected && c.chosen && sum.weightPerPallet != null && sum.weightPerPallet > c.chosen.maxKgPerPallet ? c.chosen : null;
  const banned = c.checks.find((r) => r.ruleId === "R-06" && r.status === "fail");

  if (confirmed && !isOrder && !editing) {
    const cutoff = editCutoff(booking);
    return (
      <section className="rise rounded-2xl border border-lime-300 bg-gradient-to-br from-lime-50 to-white p-5 shadow-sm" role="status">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-forest-700" aria-hidden />
          <div className="min-w-0 text-sm text-slate-700">
            <p className="text-base font-semibold text-forest-950">Booking confirmed · <span className="font-mono">{confirmedId}</span></p>
            <p className="mt-1.5">
              {sum.route} · {sum.cartons} cartons on {sum.pallets} pallets ({sum.grossWeight} kg) · <b className="text-forest-950">{c.selected?.carrier}</b> {c.selected?.service.toLowerCase()} · <b className="tnum text-forest-950">{gbp(c.selected?.cost)}</b> · about {c.selected?.days} days · ready {fmtDate(sum.readyDate)}
            </p>
            <p className="mt-2 text-slate-600">Saved to <b className="text-forest-950">My orders</b>{cutoff ? `. You can edit it there until the end of ${fmtDate(cutoff)}` : ""}. Next: the carrier confirms a collection slot, you send the commercial invoice with the goods, and the export declaration is made before they leave the UK.</p>
            {c.status === "Can dispatch after review" && <p className="mt-2 font-medium text-amber-800">Booked with open warnings. Look at them before collection.</p>}
            <Progress c={c} confirmed={confirmed} notified={notified} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onOpenNotice} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-800">
                <Mail className="h-3.5 w-3.5" aria-hidden />Open receiver notice
              </button>
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                <Pencil className="h-3.5 w-3.5" aria-hidden />Edit booking
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[0_1px_2px_rgba(16,40,30,0.05),0_8px_24px_-12px_rgba(16,40,30,0.12)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4" role="status">
          <ChecksGauge checks={c.checks} passed={passed} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-forest-950">
              <Icon className={`h-5 w-5 shrink-0 ${s.tone}`} aria-hidden /><Flash value={c.status}>{c.status}</Flash>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${reds ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}><CircleX className="h-3 w-3" aria-hidden />{reds} must fix</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${ambers ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600"}`}><TriangleAlert className="h-3 w-3" aria-hidden />{ambers} warning{ambers === 1 ? "" : "s"}</span>
              <span className="text-slate-600 tnum">{passed}/10 passed</span>
            </div>
          </div>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
              <Pencil className="h-4 w-4" aria-hidden />{isOrder ? "Edit order" : "Edit details"}
            </button>
            {isOrder ? (
              onCancelOrder && <button onClick={onCancelOrder} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"><XCircle className="h-4 w-4" aria-hidden />Cancel order</button>
            ) : (
              <button onClick={onConfirm}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${reds || !c.selected ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-forest-900 text-white hover:bg-forest-800"}`}>
                {reds || !c.selected ? <Lock className="h-4 w-4" aria-hidden /> : <CircleCheck className="h-4 w-4 text-lime-400" aria-hidden />}
                {changedSinceConfirm ? "Confirm changes" : "Confirm booking"}
              </button>
            )}
          </div>
        )}
      </div>

      {banned && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div><b>Prohibited goods: this shipment can&apos;t go as booked.</b> {banned.message}</div>
        </div>
      )}

      {alert && alert.kind !== "ok" && (
        <div role="alert" className={`shake mt-4 rounded-xl border-l-4 px-4 py-3 text-sm ${alert.kind === "blocked" ? "border-red-600 bg-red-50 text-red-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}>
          <div className="flex items-start gap-2.5">
            {alert.kind === "blocked" ? <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{alert.kind === "blocked" ? "Can't confirm yet: fix the must-fix items first" : "Warnings are still open"}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {alert.issues.map((r) => <li key={r.ruleId}><b>{RULE_NAMES[r.ruleId]}</b> ({r.ruleId}): {r.status === "cannot-check" ? "details missing" : r.message}</li>)}
                {alert.kind === "blocked" && !alert.issues.length && <li>No carrier on this route can take the weight per pallet.</li>}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.kind === "warn" && (
                  <button onClick={onForce} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-400">Confirm anyway</button>
                )}
                <button onClick={onDismissAlert} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                  {alert.kind === "blocked" ? "OK, show me the fixes" : "Review first"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {changedSinceConfirm && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-100">You changed this booking after confirming {confirmedId}. Confirm again to update the saved order.</p>}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Carrier" value={c.selected?.carrier ?? overLimit?.carrier ?? "—"} alert={!!overLimit}
          sub={c.selected ? c.selected.service : overLimit ? `over its ${overLimit.maxKgPerPallet} kg limit` : c.rec.minPalletsNeeded ? "none can take the load" : "needs pallets and weight"} />
        <Stat label="Total cost" value={<Flash value={c.selected?.cost}>{c.selected ? gbp(c.selected.cost) : "—"}</Flash>} sub={c.selected ? `${gbp(c.selected.price)} × ${booking.pallets} pallets` : ""} />
        <Stat label="Arrives" value={c.selected && sum.readyDate ? fmtDate(addDays(sum.readyDate, c.selected.days)) : c.selected ? `${c.selected.days} days` : "—"} sub={c.selected ? `${c.selected.days} days · ${c.selected.onTime}% on time` : ""} />
        <Stat label="Weight / pallet" value={<Flash value={sum.weightPerPallet}>{sum.weightPerPallet != null ? `${sum.weightPerPallet} kg` : "—"}</Flash>} sub={(c.selected ?? c.chosen) ? `limit ${(c.selected ?? c.chosen)!.maxKgPerPallet} kg` : ""} />
      </dl>
      <Progress c={c} confirmed={confirmed} notified={notified} />
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
  { kind: "red", title: SEVERITY.red.label, hint: SEVERITY.red.hint, tone: "border-red-200 border-l-red-600 bg-red-50/70", iconTone: "text-red-600" },
  { kind: "amber", title: SEVERITY.amber.label, hint: SEVERITY.amber.hint, tone: "border-amber-200 border-l-amber-400 bg-amber-50/70", iconTone: "text-amber-500" },
  { kind: "unknown", title: "Waiting for details", hint: "Can't run yet", tone: "border-slate-200 border-l-slate-300 bg-slate-50", iconTone: "text-slate-500" },
];

function CheckItem({ r, group, onAction }: { r: CheckResult; group: (typeof GROUPS)[number]; onAction: (a: CheckAction) => void }) {
  const Icon = CHECK_ICON[group.kind];
  return (
    <li className={`rise rounded-xl border border-l-4 px-4 py-3 ${group.tone}`}>
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
          <b className="text-red-700">Must fix</b> = rulebook severity Red, a serious problem: the booking can&apos;t be confirmed until it passes. <b className="text-amber-800">Warning</b> = Amber: you can still ship, but it may cause delays or a refused delivery.
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

/** Advance notice for the receiving site: what's coming and what to count. */
function NoticeCard({ booking, c, confirmed, onCopied }: { booking: Booking; c: Computed; confirmed: boolean; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  const blocked = c.checks.some((r) => isBlocking(r, "red")) || !c.selected;
  if (blocked || !c.selected) {
    return (
      <Card title="Receiver notice" icon={Mail}>
        <div className="flex items-start gap-3 text-sm text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p>The delivery notice for the receiver is ready once every &quot;must fix&quot; check passes and a carrier is chosen.</p>
        </div>
      </Card>
    );
  }
  const n = buildNotice(booking, c.selected);
  const copy = async () => {
    try { await navigator.clipboard.writeText(n.text); setCopied(true); onCopied(); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <Card title="Receiver notice" icon={Mail} aside={
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-800">
        {copied ? <Check className="h-3.5 w-3.5 text-lime-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copied" : "Copy text"}
      </button>
    }>
      <p className="mb-3 text-sm text-slate-700">Send this to the receiving site so they know exactly what&apos;s coming and can count it on arrival.{!confirmed && " Confirm the booking first, then send it."}</p>
      <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-lg font-semibold tracking-tight text-forest-950">{n.title}</h3>
        <p className="mt-1 text-sm text-slate-700">{n.intro}</p>
        {n.appointmentWarning && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200">Delivery appointment: not booked yet. Please arrange a delivery slot.</p>}
        <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {n.fields.map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-slate-600">{k}</dt><dd className="font-medium text-forest-950 tnum">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm tnum">
            <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Contents</caption>
            <thead className="text-xs text-slate-600"><tr>{["SKU", "Description", "Units", "Cartons"].map((h, i) => <th key={h} className={`py-1.5 pr-3 font-medium ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{n.items.map((row) => (
              <tr key={row[0]} className="border-t border-slate-200">{row.map((cell, i) => <td key={i} className={`py-1.5 pr-3 ${i === 0 ? "font-mono text-xs" : ""} ${i > 1 ? "text-right" : ""}`}>{cell}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </article>
    </Card>
  );
}

/** Every rule's arithmetic, shown step by step. Same fixed formulas as the checks: the AI never calculates. */
function CalculatorPanel({ booking }: { booking: Booking }) {
  const ws = workings(booking);
  const tone = { pass: "bg-lime-100 text-forest-800", fail: "bg-red-600 text-white", "cannot-check": "bg-slate-100 text-slate-600" } as const;
  return (
    <Card title="Calculator" icon={Calculator} aside={<span className="text-xs text-slate-600">Fixed formulas from the rulebook</span>}>
      <p className="mb-4 text-sm text-slate-700">Every number behind the checks and the carrier price, worked out with the case&apos;s formulas. The AI only reads your messages; it never does this maths.</p>
      <ul className="space-y-3">
        {ws.map((w) => (
          <li key={w.ruleId} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-forest-950">{w.title}</span>
              {w.ruleId.startsWith("R-") && <span className="font-mono text-[11px] text-slate-600">{w.ruleId}</span>}
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${tone[w.verdict]}`}>
                {w.verdict === "pass" ? (w.ruleId === "Cost" ? "Best price" : "Pass") : w.verdict === "fail" ? "Fail" : "Waiting"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{w.formula}</p>
            {w.steps.length > 0 && (
              <ol className="mt-2 space-y-0.5 rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-slate-200">
                {w.steps.map((st) => <li key={st}>{st}</li>)}
              </ol>
            )}
            <p className="mt-2 text-sm font-semibold text-forest-950 tnum">{w.result}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
