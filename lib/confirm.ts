// What happens when the seller tries to confirm: blocked by "must fix" items, held for warnings, or confirmed.
import { isBlocking } from "./rules";
import type { CarrierOption, CheckResult } from "./types";

const NAMES: Record<string, string> = {
  "R-01": "HS code", "R-02": "Declared value", "R-03": "Units per carton", "R-04": "Carton total",
  "R-05": "Weight per pallet", "R-06": "Banned goods", "R-07": "Gross weight", "R-08": "Delivery appointment",
  "R-09": "Country of origin", "R-10": "Ready date",
};
export const ruleName = (id: string) => NAMES[id] ?? id;

export type Decision =
  | { kind: "blocked"; issues: CheckResult[]; message: string }
  | { kind: "warn"; issues: CheckResult[]; message: string }
  | { kind: "ok"; message: string };

/** force = the seller has seen the warnings and said "confirm anyway". Must-fix items can never be forced. */
export function decide(checks: CheckResult[], carrier: CarrierOption | null, force = false): Decision {
  const reds = checks.filter((r) => isBlocking(r, "red"));
  if (reds.length || !carrier) {
    const list = reds.map((r) => `• ${ruleName(r.ruleId)} (${r.ruleId}): ${r.status === "cannot-check" ? "details missing" : r.message}`);
    return {
      kind: "blocked",
      issues: reds,
      message: reds.length
        ? `I can't confirm this booking yet. ${reds.length} "must fix" ${reds.length === 1 ? "issue is" : "issues are"} still open:\n${list.join("\n")}\nFix ${reds.length === 1 ? "it" : "them"} first. Each one shows how.`
        : "I can't confirm this booking yet: no carrier on this route can take the weight per pallet. Add pallets or reduce the weight.",
    };
  }
  const ambers = checks.filter((r) => isBlocking(r, "amber"));
  if (ambers.length && !force) {
    return {
      kind: "warn",
      issues: ambers,
      message: `Before I confirm: ${ambers.length} ${ambers.length === 1 ? "warning is" : "warnings are"} still open:\n${ambers.map((r) => `• ${ruleName(r.ruleId)} (${r.ruleId}): ${r.status === "cannot-check" ? "details missing" : r.message}`).join("\n")}\nThese may cause delays. Say "confirm anyway" to book it as it is, or fix them first.`,
    };
  }
  return { kind: "ok", message: "Confirmed." };
}

/** Recognises "confirm", "confirm booking", "yes confirm the shipment", "book it", "confirm anyway". */
export function confirmIntent(text: string): "confirm" | "force" | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(yes,?\s*)?(please\s*)?(confirm|book)\s*(it\s*)?anyway$/.test(t)) return "force";
  if (/^(yes,?\s*)?(please\s*)?(confirm|book)(\s+(it|the|my|this))?(\s+(booking|shipment|order))?(\s+please)?$/.test(t)) return "confirm";
  return null;
}
