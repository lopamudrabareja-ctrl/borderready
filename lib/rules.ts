import { effectiveBooking } from "./booking";
import { MAX_KG_ANY_CARRIER, recommend, routeOptions } from "./carriers";
import { scanDescription } from "./prohibited";
import type { Booking, CheckResult, OverallStatus, Priority } from "./types";

export interface Classification { prohibited: boolean; category?: string; reason?: string }
/** Keyed by lowercase description. Missing key = LLM unavailable. */
export type Classifications = Map<string, Classification>;

const gbp = (n: number) => `£${(Math.round(n * 100) / 100).toLocaleString("en-GB")}`;
const num = (n: number) => String(Math.round(n * 100) / 100);

const pass = (ruleId: string, severity: CheckResult["severity"], message: string): CheckResult =>
  ({ ruleId, severity, status: "pass", message, fix: "" });
const fail = (ruleId: string, severity: CheckResult["severity"], message: string, fix: string, actions?: CheckResult["actions"]): CheckResult =>
  ({ ruleId, severity, status: "fail", message, fix, actions });
const cannot = (ruleId: string, severity: CheckResult["severity"], message: string, fix: string): CheckResult =>
  ({ ruleId, severity, status: "cannot-check", message, fix });

export function r01(b: Booking): CheckResult {
  if (!b.items.length) return cannot("R-01", "red", "No items to check HS codes on.", "Add the items in this booking.");
  const bad = b.items.filter((i) => !i.hsCode || !/^\d{6,}$/.test(i.hsCode));
  if (!bad.length) return pass("R-01", "red", "Every item has an HS code of at least 6 digits.");
  return fail("R-01", "red",
    `HS code missing or too short for: ${bad.map((i) => `${i.sku} (${i.hsCode ? `"${i.hsCode}" has ${i.hsCode.replace(/\D/g, "").length} digits` : "blank"})`).join(", ")}.`,
    "Look up the commodity code (at least 6 digits) for each item on the GOV.UK Trade Tariff, or ask your carrier or a customs agent.");
}

export function r02(b: Booking): CheckResult {
  if (b.declaredValue == null || !b.items.length) return cannot("R-02", "red", "Declared value or items missing.", "Enter the total declared value and the item prices.");
  const unpriced = b.items.filter((i) => i.quantity == null || i.unitPrice == null);
  if (unpriced.length) {
    return cannot("R-02", "red", `Quantity or unit price missing for ${unpriced.map((i) => i.description || i.sku).join(", ")}, so the total can't be checked yet.`,
      "Enter each item's quantity and unit price.");
  }
  const sum = b.items.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0);
  if (sum === 0 && b.declaredValue !== 0) {
    return fail("R-02", "red", `Declared value is ${gbp(b.declaredValue)} but the items add up to £0 (quantities or unit prices are missing or zero).`,
      "Enter each item's quantity and unit price so the total can be checked.");
  }
  const diff = b.declaredValue - sum;
  if (Math.abs(diff) <= 0.01 * sum + 1e-9) return pass("R-02", "red", `Declared value ${gbp(b.declaredValue)} matches items total ${gbp(sum)}.`);
  return fail("R-02", "red",
    `Declared value is ${gbp(b.declaredValue)} but quantity × unit price adds up to ${gbp(sum)} (difference ${gbp(Math.abs(diff))}, ${num((Math.abs(diff) / sum) * 100)}%).`,
    `Change the declared value to ${gbp(sum)}, or correct the quantities or unit prices. Declare the selling price of the goods; list freight and insurance separately.`);
}

export function r03(b: Booking): CheckResult {
  const rows = b.items.filter((i) => i.quantity != null && i.unitsPerCarton != null && i.cartons != null);
  if (!rows.length) return cannot("R-03", "red", "Not enough carton data to check quantities.", "Enter quantity, units per carton and cartons for each item.");
  const bad = rows.filter((i) => i.unitsPerCarton! * i.cartons! !== i.quantity);
  if (!bad.length) return pass("R-03", "red", "Units per carton × cartons equals quantity for every item.");
  return fail("R-03", "red",
    bad.map((i) => `${i.sku}: ${i.unitsPerCarton} units per carton × ${i.cartons} cartons = ${i.unitsPerCarton! * i.cartons!}, but quantity is ${i.quantity}`).join("; ") + ".",
    "Correct the quantity, units per carton or cartons so they agree.");
}

export function r04(b: Booking): CheckResult {
  if (b.cartons == null || !b.items.length) return cannot("R-04", "red", "Booking cartons or items missing.", "Enter the carton counts.");
  const sum = b.items.reduce((s, i) => s + (i.cartons ?? 0), 0);
  if (sum === b.cartons) return pass("R-04", "red", `Booking cartons (${b.cartons}) match the item total.`);
  return fail("R-04", "red", `Booking says ${b.cartons} cartons but the items add up to ${sum}.`, `Set booking cartons to ${sum}, or correct the item cartons.`);
}

/** Carrier the seller picked, else the one their priority would choose from the full route, ignoring weight. */
export function chosenCarrier(b: Booking) {
  if (!b.destCountry) return null;
  const override = b.carrierOverride && routeOptions(b.destCountry).find((o) => o.carrier === b.carrierOverride);
  if (override) return override;
  return recommend(b.destCountry, b.pallets && b.pallets > 0 ? b.pallets : 1, 0, b.priority ?? ("Balanced" as Priority)).recommended;
}

export function r05(b: Booking): CheckResult {
  if (!b.pallets || b.pallets <= 0 || b.grossWeight == null || !b.destCountry)
    return cannot("R-05", "red", "Pallets, gross weight or destination missing.", "Enter pallets (more than 0), gross weight and destination.");
  const chosen = chosenCarrier(b)!;
  const per = b.grossWeight / b.pallets;
  if (per <= chosen.maxKgPerPallet)
    return pass("R-05", "red", `${num(per)} kg per pallet is within ${chosen.carrier}'s limit of ${chosen.maxKgPerPallet} kg.`);
  const rec = recommend(b.destCountry, b.pallets, b.grossWeight, b.priority);
  if (!rec.recommended) {
    const need = Math.ceil(b.grossWeight / MAX_KG_ANY_CARRIER);
    return fail("R-05", "red", `${num(per)} kg per pallet is over every carrier's limit on this route (maximum ${MAX_KG_ANY_CARRIER} kg).`,
      `Use at least ${need} pallets for ${b.grossWeight} kg.`, [{ kind: "add-pallets", label: `Change to ${need} pallets`, pallets: need }]);
  }
  const alt = rec.recommended;
  const palletsNeeded = Math.ceil(b.grossWeight / chosen.maxKgPerPallet);
  return fail("R-05", "red",
    `${num(per)} kg per pallet is over ${chosen.carrier}'s limit of ${chosen.maxKgPerPallet} kg.`,
    `Either switch to ${alt.carrier} (${alt.service}) at ${gbp(alt.cost!)}, or use ${palletsNeeded} pallets so ${chosen.carrier} can take it.`,
    [
      { kind: "switch-carrier", label: `Switch to ${alt.carrier} (${gbp(alt.cost!)})`, carrier: alt.carrier },
      { kind: "add-pallets", label: `Use ${palletsNeeded} pallets with ${chosen.carrier}`, pallets: palletsNeeded },
    ]);
}

export function r06(b: Booking, cls: Classifications = new Map()): CheckResult {
  if (!b.items.length) return cannot("R-06", "red", "No items to screen.", "Add the items in this booking.");
  const hits: string[] = [];
  const notes: string[] = [];
  for (const i of b.items) {
    const s = scanDescription(i.description);
    if (s.kind === "prohibited") hits.push(`${i.sku} "${i.description}" matched "${s.phrase}" (${s.category})`);
    else if (s.kind === "ambiguous") {
      const c = cls.get(i.description.trim().toLowerCase());
      if (!c) hits.push(`${i.sku} "${i.description}" may contain a battery or pressurised contents (matched "${s.phrase}") - check manually`);
      else if (c.prohibited) hits.push(`${i.sku} "${i.description}" flagged as ${c.category ?? "prohibited"}: ${(c.reason ?? "").replace(/\.+$/, "")}`.trim());
    } else if (s.kind === "perfume-check") notes.push(`${i.sku} contains perfume - confirm it is not alcohol-based or flammable`);
  }
  if (!hits.length) return pass("R-06", "red", `No lithium batteries, aerosols or flammable liquids found.${notes.length ? " Note: " + notes.join("; ") + "." : ""}`);
  return fail("R-06", "red", `Possible prohibited goods: ${hits.join("; ")}.`,
    "Remove these items from the shipment, or confirm in writing that they are not prohibited and ship them under dangerous-goods rules outside this tool.");
}

export function r07(b: Booking): CheckResult {
  const rows = b.items.filter((i) => i.unitWeight != null && i.quantity != null);
  if (b.grossWeight == null || !rows.length) return cannot("R-07", "amber", "Gross weight or unit weights missing.", "Enter the gross weight and each item's unit weight.");
  const products = rows.reduce((s, i) => s + i.unitWeight! * i.quantity!, 0);
  if (b.grossWeight + 1e-9 >= products) return pass("R-07", "amber", `Gross weight ${num(b.grossWeight)} kg is at least the products' weight of ${num(products)} kg.`);
  return fail("R-07", "amber", `Gross weight is ${num(b.grossWeight)} kg but the products alone weigh ${num(products)} kg.`,
    `Gross weight must include packaging: raise it to at least ${num(products)} kg, or check the unit weights.`);
}

export function r08(b: Booking): CheckResult {
  if (!b.destType) return cannot("R-08", "amber", "Destination type missing.", "Enter Warehouse or Business address.");
  if (b.destType !== "Warehouse") return pass("R-08", "amber", "No delivery appointment is needed for this destination type.");
  if (b.appointmentBooked === "Yes") return pass("R-08", "amber", "Warehouse delivery appointment is booked.");
  return fail("R-08", "amber", "Delivering to a warehouse but no delivery appointment is booked.", "Book a delivery slot with the warehouse and set the appointment to Yes.");
}

export function r09(b: Booking): CheckResult {
  if (!b.items.length) return cannot("R-09", "amber", "No items to check.", "Add the items in this booking.");
  const bad = b.items.filter((i) => !i.countryOfOrigin);
  if (!bad.length) return pass("R-09", "amber", "Every item has a country of origin.");
  return fail("R-09", "amber", `Country of origin missing for: ${bad.map((i) => i.sku).join(", ")}.`, "Enter where each of these items was made. Your buyer may need proof of origin to get reduced or zero duty.");
}

export function r10(b: Booking, today: string): CheckResult {
  if (!b.readyDate) return cannot("R-10", "amber", "Ready-to-ship date missing.", "Enter the ready-to-ship date.");
  if (b.readyDate >= today) return pass("R-10", "amber", `Ready date ${b.readyDate} is today or later.`);
  return fail("R-10", "amber", `Ready date ${b.readyDate} is in the past (today is ${today}).`, "Choose today or a future date.");
}

export function runChecks(raw: Booking, today: string, cls: Classifications = new Map()): CheckResult[] {
  const b = effectiveBooking(raw);
  return [r01(b), r02(b), r03(b), r04(b), r05(b), r06(b, cls), r07(b), r08(b), r09(b), r10(b, today)];
}

/** A check that cannot run is treated like a failure of its severity: missing data is never "ready". */
export const isBlocking = (r: CheckResult, severity: CheckResult["severity"]) => r.severity === severity && r.status !== "pass";

export function overallStatus(results: CheckResult[]): OverallStatus {
  if (results.some((r) => isBlocking(r, "red"))) return "Not ready to dispatch";
  if (results.some((r) => isBlocking(r, "amber"))) return "Can dispatch after review";
  return "Ready to dispatch";
}

