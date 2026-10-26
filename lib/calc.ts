// The calculator: every number the rules use, worked out step by step with the case's fixed formulas.
// It shares the formulas with lib/rules.ts and lib/carriers.ts (tests check they always agree), so the
// AI never does any of this arithmetic.
import { effectiveBooking } from "./booking";
import { BALANCED_WEIGHTS, MAX_KG_ANY_CARRIER, recommend } from "./carriers";
import { chosenCarrier } from "./rules";
import type { Booking } from "./types";

export interface Working {
  ruleId: string;
  title: string;
  formula: string;
  steps: string[]; // the numbers plugged in
  result: string;
  verdict: "pass" | "fail" | "cannot-check";
}

const n = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-GB");
const gbp = (v: number) => `£${n(v)}`;
const missing = (ruleId: string, title: string, formula: string, what: string): Working =>
  ({ ruleId, title, formula, steps: [], result: `Can't calculate yet: ${what} missing`, verdict: "cannot-check" });

export function workings(raw: Booking): Working[] {
  const b = effectiveBooking(raw);
  const out: Working[] = [];

  // R-02 declared value vs items
  {
    const f = "Σ (quantity × unit price) must be within 1% of the declared value";
    const priced = b.items.filter((i) => i.quantity != null && i.unitPrice != null);
    if (b.declaredValue == null || !b.items.length || priced.length < b.items.length) out.push(missing("R-02", "Declared value", f, "quantities, unit prices or the declared value"));
    else {
      const lines = priced.map((i) => `${i.sku}: ${n(i.quantity!)} × ${gbp(i.unitPrice!)} = ${gbp(i.quantity! * i.unitPrice!)}`);
      const sum = priced.reduce((t, i) => t + i.quantity! * i.unitPrice!, 0);
      const diff = Math.abs(b.declaredValue - sum);
      const pct = sum ? (diff / sum) * 100 : diff ? Infinity : 0;
      out.push({
        ruleId: "R-02", title: "Declared value", formula: f,
        steps: [...lines, `Items total = ${gbp(sum)}`, `Declared = ${gbp(b.declaredValue)}`, `Difference = ${gbp(diff)}${Number.isFinite(pct) ? ` = ${n(pct)}% of the items total` : ""}`],
        result: Number.isFinite(pct) && pct <= 1 + 1e-9 ? `${n(pct)}% ≤ 1% allowed` : `${Number.isFinite(pct) ? `${n(pct)}%` : "items total is £0"} > 1% allowed`,
        verdict: Number.isFinite(pct) && pct <= 1 + 1e-9 ? "pass" : "fail",
      });
    }
  }

  // R-03 units per carton × cartons = quantity
  {
    const f = "For each item: units per carton × cartons = quantity";
    const rows = b.items.filter((i) => i.quantity != null && i.unitsPerCarton != null && i.cartons != null);
    if (!rows.length) out.push(missing("R-03", "Units per carton", f, "quantity, units per carton or cartons"));
    else {
      const bad = rows.filter((i) => i.unitsPerCarton! * i.cartons! !== i.quantity);
      out.push({
        ruleId: "R-03", title: "Units per carton", formula: f,
        steps: rows.map((i) => `${i.sku}: ${n(i.unitsPerCarton!)} × ${n(i.cartons!)} = ${n(i.unitsPerCarton! * i.cartons!)} ${i.unitsPerCarton! * i.cartons! === i.quantity ? "=" : "≠"} ${n(i.quantity!)} units`),
        result: bad.length ? `${bad.length} item${bad.length > 1 ? "s" : ""} don't add up` : "Every item adds up",
        verdict: bad.length ? "fail" : "pass",
      });
    }
  }

  // R-04 booking cartons = sum of item cartons
  {
    const f = "Booking cartons = Σ item cartons";
    if (b.cartons == null || !b.items.length) out.push(missing("R-04", "Carton total", f, "carton counts"));
    else {
      const sum = b.items.reduce((t, i) => t + (i.cartons ?? 0), 0);
      out.push({
        ruleId: "R-04", title: "Carton total", formula: f,
        steps: [`Items: ${b.items.map((i) => n(i.cartons ?? 0)).join(" + ")} = ${n(sum)} cartons`, `Booking: ${n(b.cartons)} cartons`],
        result: sum === b.cartons ? `${n(sum)} = ${n(b.cartons)}` : `${n(sum)} ≠ ${n(b.cartons)}`,
        verdict: sum === b.cartons ? "pass" : "fail",
      });
    }
  }

  // R-05 weight per pallet vs the chosen carrier's limit
  {
    const f = "Weight per pallet = gross weight ÷ pallets, must be ≤ the chosen carrier's max kg per pallet";
    const chosen = chosenCarrier(b);
    if (!b.pallets || b.pallets <= 0 || b.grossWeight == null || !chosen) out.push(missing("R-05", "Weight per pallet", f, "pallets, gross weight or destination"));
    else {
      const per = b.grossWeight / b.pallets;
      out.push({
        ruleId: "R-05", title: "Weight per pallet", formula: f,
        steps: [`${n(b.grossWeight)} kg ÷ ${n(b.pallets)} pallets = ${n(per)} kg per pallet`, `Chosen carrier: ${chosen.carrier}, limit ${chosen.maxKgPerPallet} kg`,
          ...(per > chosen.maxKgPerPallet ? [`Pallets needed for ${chosen.carrier} = ⌈${n(b.grossWeight)} ÷ ${chosen.maxKgPerPallet}⌉ = ${Math.ceil(b.grossWeight / chosen.maxKgPerPallet)}`] : []),
          ...(per > MAX_KG_ANY_CARRIER ? [`Over every carrier's limit: at least ⌈${n(b.grossWeight)} ÷ ${MAX_KG_ANY_CARRIER}⌉ = ${Math.ceil(b.grossWeight / MAX_KG_ANY_CARRIER)} pallets`] : [])],
        result: per <= chosen.maxKgPerPallet ? `${n(per)} ≤ ${chosen.maxKgPerPallet} kg` : `${n(per)} > ${chosen.maxKgPerPallet} kg`,
        verdict: per <= chosen.maxKgPerPallet ? "pass" : "fail",
      });
    }
  }

  // R-07 gross weight ≥ products
  {
    const f = "Gross weight ≥ Σ (unit weight × quantity)";
    const rows = b.items.filter((i) => i.unitWeight != null && i.quantity != null);
    if (b.grossWeight == null || !rows.length) out.push(missing("R-07", "Gross weight", f, "gross weight or unit weights"));
    else {
      const sum = rows.reduce((t, i) => t + i.unitWeight! * i.quantity!, 0);
      out.push({
        ruleId: "R-07", title: "Gross weight", formula: f,
        steps: [...rows.map((i) => `${i.sku}: ${n(i.unitWeight!)} kg × ${n(i.quantity!)} = ${n(i.unitWeight! * i.quantity!)} kg`), `Products total = ${n(sum)} kg`, `Gross weight = ${n(b.grossWeight)} kg`],
        result: b.grossWeight + 1e-9 >= sum ? `${n(b.grossWeight)} ≥ ${n(sum)} kg` : `${n(b.grossWeight)} < ${n(sum)} kg`,
        verdict: b.grossWeight + 1e-9 >= sum ? "pass" : "fail",
      });
    }
  }

  // Carrier cost and ranking
  {
    const f = "Cost = price per pallet × pallets. Balanced score = 0.4 × (cheapest ÷ price) + 0.3 × (fewest days ÷ days) + 0.3 × (on-time ÷ best on-time)";
    const rec = recommend(b.destCountry, b.pallets, b.grossWeight, b.priority);
    const ok = rec.options.filter((o) => o.feasible && o.cost != null);
    if (!ok.length) out.push({ ruleId: "Cost", title: "Carrier cost", formula: f, steps: [], result: rec.reason || "No carrier can take this load", verdict: "cannot-check" });
    else {
      out.push({
        ruleId: "Cost", title: "Carrier cost", formula: f,
        steps: rec.options.map((o) => o.feasible && o.cost != null
          ? `${o.carrier}: £${o.price} × ${b.pallets} = ${gbp(o.cost)}${o.balancedScore != null ? `, score ${BALANCED_WEIGHTS.price}×${n(Math.min(...ok.map((x) => x.price)) / o.price)} + ${BALANCED_WEIGHTS.days}×${n(Math.min(...ok.map((x) => x.days)) / o.days)} + ${BALANCED_WEIGHTS.reliability}×${n(o.onTime / Math.max(...ok.map((x) => x.onTime)))} = ${o.balancedScore.toFixed(3)}` : ""}`
          : `${o.carrier}: excluded (${o.excludedReason})`),
        result: rec.recommended ? `${rec.recommended.carrier} for "${b.priority ?? "Balanced"}": ${gbp(rec.totalCost!)}` : "—",
        verdict: "pass",
      });
    }
  }
  return out;
}
