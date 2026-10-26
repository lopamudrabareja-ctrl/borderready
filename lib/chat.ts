// One chat turn: apply the extracted patch, recompute everything, and build the reply from the results.
import { applyPatch, missingFields, summary, type Missing } from "./booking";
import { recommend } from "./carriers";
import type { Extraction } from "./extraction";
import { runChecks, type Classification } from "./rules";
import type { Booking, CheckResult } from "./types";
import { DESTINATIONS, ORIGIN_CITIES } from "./types";

export interface ChatMeta {
  asked: Record<string, number>; // missing-field key -> times asked (max 2)
  unknown: string[]; // keys the user said they don't know, e.g. "MUG-1.hsCode"
  classifications: Record<string, Classification>;
}

export const emptyMeta = (): ChatMeta => ({ asked: {}, unknown: [], classifications: {} });

const keyOf = (m: Missing) => (m.sku ? `${m.sku}.${m.field}` : m.field);
const MAX_ASKS = 2;

export interface TurnResult { booking: Booking; meta: ChatMeta; reply: string }

export function runTurn(prev: Booking, meta: ChatMeta, ex: Extraction, today: string): TurnResult {
  const booking = applyPatch(prev, ex.patch);
  const next: ChatMeta = {
    asked: { ...meta.asked },
    unknown: [...meta.unknown],
    classifications: { ...meta.classifications, ...ex.classifications },
  };
  for (const u of ex.unknown) {
    const targets = u.sku ? booking.items.filter((i) => i.sku === u.sku) : booking.items.slice(-1);
    for (const i of targets) next.unknown.push(`${i.sku}.${u.field}`);
  }

  const cls = new Map(Object.entries(next.classifications));
  const before = runChecks(prev, today, cls);
  const after = runChecks(booking, today, cls);
  const parts: string[] = [];

  const understood = describeChanges(prev, booking);
  if (understood.length) parts.push(`Got it: ${understood.join(", ")}.`);
  else if (!ex.unknown.length && !ex.unsupported.length) parts.push("I couldn't find any shipment details in that message.");

  if (ex.unknown.length) {
    parts.push(`No problem, I've left ${ex.unknown.map((u) => (u.field === "hsCode" ? "the HS code" : "the country of origin")).join(" and ")} blank. The checks will flag it with how to fix it.`);
  }
  if (ex.unsupported.length) {
    parts.push(`Sorry, I can't book ${ex.unsupported.join(" or ")}. Supported routes are from ${ORIGIN_CITIES.join(", ")} to ${Object.entries(DESTINATIONS).map(([c, cities]) => `${cities.join("/")} (${c})`).join(", ")}.`);
  }

  const recalc = recalculation(prev, booking, before, after);
  if (recalc) parts.push(recalc);

  const missing = missingFields(booking).filter((m) => !next.unknown.includes(keyOf(m)) && (next.asked[keyOf(m)] ?? 0) < MAX_ASKS);

  // Warn about new red failures, except a blank HS code we're about to ask for anyway.
  const askingHs = (sku: string) => missing.some((m) => m.sku === sku && m.field === "hsCode");
  const reds = after.filter((r) => r.status === "fail" && r.severity === "red");
  const newlyFailing = reds.filter((r) => before.find((x) => x.ruleId === r.ruleId)?.status !== "fail");
  for (const r of newlyFailing) {
    if (recalc?.includes(r.ruleId)) continue;
    if (r.ruleId === "R-01" && booking.items.filter((i) => !i.hsCode || !/^\d{6,}$/.test(i.hsCode)).every((i) => !i.hsCode && askingHs(i.sku))) continue;
    parts.push(`Must fix (${r.ruleId}): ${r.message} ${r.fix}`);
  }
  if (missing.length) {
    for (const m of missing) next.asked[keyOf(m)] = (next.asked[keyOf(m)] ?? 0) + 1;
    const ship = missing.filter((m) => m.group === "shipment").map((m) => m.label);
    const byItem = new Map<string, string[]>();
    for (const m of missing.filter((x) => x.group === "item")) byItem.set(m.itemName!, [...(byItem.get(m.itemName!) ?? []), m.label]);
    const items = [...byItem].map(([name, labels]) => `${name}: ${labels.join(", ")}`);
    const lines = ["To finish the booking I still need:"];
    if (ship.length) lines.push(`• Shipment: ${ship.join("; ")}`);
    if (items.length) lines.push(`• Items: ${items.join("; ")}`);
    parts.push(lines.join("\n"));
  } else {
    const status = after.some((r) => r.status !== "pass" && r.severity === "red") ? "not ready to dispatch yet"
      : after.some((r) => r.status !== "pass") ? "ready to dispatch once you've looked at the warnings (check before shipping)" : "ready to dispatch";
    parts.push(`That's everything I need. The booking is ${status}.`);
  }
  return { booking, meta: next, reply: parts.join("\n\n") };
}

const LABELS: [keyof Booking, string, (v: unknown, b: Booking) => string][] = [
  ["originCity", "from", (v) => String(v)],
  ["destCity", "to", (v, b) => `${v}${b.destCountry ? ` (${b.destCountry})` : ""}`],
  ["destType", "delivering to a", (v) => String(v).toLowerCase()],
  ["readyDate", "ready on", (v) => { const [y, m, d] = String(v).split("-"); return `${d}-${m}-${y}`; }],
  ["priority", "priority", (v) => String(v)],
  ["pallets", "pallets", (v) => String(v)],
  ["cartons", "cartons", (v) => String(v)],
  ["declaredValue", "declared value", (v) => `£${Number(v).toLocaleString("en-GB")}`],
  ["grossWeight", "gross weight", (v) => `${v} kg`],
  ["appointmentBooked", "delivery appointment booked", (v) => String(v).toLowerCase()],
];

function describeChanges(a: Booking, b: Booking): string[] {
  const out: string[] = [];
  for (const [k, label, fmt] of LABELS) {
    if (b[k] != null && a[k] !== b[k]) out.push(a[k] != null ? `${label} changed to ${fmt(b[k], b)}` : `${label} ${fmt(b[k], b)}`);
  }
  for (const i of b.items) {
    const old = a.items.find((x) => x.sku === i.sku);
    const bits: string[] = [];
    const f = (k: keyof typeof i, text: (v: unknown) => string) => { if (i[k] != null && i[k] !== old?.[k]) bits.push(text(i[k])); };
    f("quantity", (v) => `${v} units`);
    f("cartons", (v) => `${v} cartons`);
    f("unitsPerCarton", (v) => `${v} per carton`);
    f("unitPrice", (v) => `£${v} each`);
    f("unitWeight", (v) => `${v} kg each`);
    f("hsCode", (v) => `HS ${v}`);
    f("countryOfOrigin", (v) => `made in ${v}`);
    if (bits.length || !old) out.push(`${i.description || i.sku}${bits.length ? ` (${bits.join(", ")})` : ""}`);
  }
  for (const i of a.items) if (!b.items.some((x) => x.sku === i.sku)) out.push(`removed ${i.description || i.sku}`);
  return out;
}

const statusWord = (r?: CheckResult) => (r?.status === "pass" ? "passes" : r?.status === "fail" ? "fails" : "can't be checked yet");

/** When numbers that drive the weight check or carrier change, say what was recalculated. */
function recalculation(a: Booking, b: Booking, before: CheckResult[], after: CheckResult[]): string | null {
  const sa = summary(a), sb = summary(b);
  const changed = sa.pallets !== sb.pallets || sa.grossWeight !== sb.grossWeight || a.destCountry !== b.destCountry || a.priority !== b.priority;
  const hadEnough = sa.pallets && sa.grossWeight != null && a.destCountry;
  if (!changed || !hadEnough || !sb.weightPerPallet) return null;
  const r05 = after.find((r) => r.ruleId === "R-05");
  const rec = recommend(b.destCountry, b.pallets, sb.grossWeight, b.priority);
  const lead = sa.pallets !== sb.pallets ? `Pallets are now ${sb.pallets}, so` : sa.grossWeight !== sb.grossWeight ? `Gross weight is now ${sb.grossWeight} kg, so` : "Recalculated:";
  const flip = before.find((r) => r.ruleId === "R-05")?.status !== r05?.status ? " now" : "";
  let s = `${lead} weight per pallet is ${sb.weightPerPallet} kg and the weight check (R-05)${flip} ${statusWord(r05)}.`;
  if (r05?.status === "fail") s += ` ${r05.fix}`;
  s += rec.recommended ? ` Recommended carrier: ${rec.recommended.carrier} at £${rec.totalCost?.toLocaleString("en-GB")}, ${rec.recommended.days} days.` : ` ${rec.reason}`;
  return s;
}
