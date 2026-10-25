// Plain-English export guidance shown next to the checks. Based on GOV.UK "Export goods from the UK:
// step by step" (https://www.gov.uk/export-goods). Guidance only: none of this affects pass/fail.
import type { CheckResult, OverallStatus } from "./types";

export const GOV_UK_EXPORT_GUIDE = "https://www.gov.uk/export-goods";
export const TRADE_TARIFF_LOOKUP = "https://www.trade-tariff.service.gov.uk/find_commodity";

export const GLOSSARY = {
  hsCode: "HS code (commodity code): the number customs use to classify a product. Needs at least 6 digits. A customs agent or your carrier can help find it.",
  carton: "Carton: one box of units. Cartons are stacked onto pallets.",
  pallet: "Pallet: a wooden platform holding stacked cartons. Carriers limit how much weight one pallet can carry.",
  eori: "EORI number: a customs ID. Exporting from England, Scotland or Wales needs one starting with GB.",
} as const;

export const NOT_CHECKED = [
  "Whether the HS code is the correct one for the product (only that it has at least 6 digits)",
  "Your EORI number (you need one starting with GB to export from Great Britain)",
  "VAT registration and whether the export can be zero-rated",
  "Licences or certificates for controlled goods (for example chemicals, medicines, plants, animal products, dual-use items)",
  "Whether your buyer can import the goods and what paperwork their country needs",
  "Proof of origin for reduced or zero duty, export declarations, Incoterms and dangerous-goods paperwork",
];

export function nextSteps(status: OverallStatus, checks: CheckResult[]): string[] {
  const failing = checks.filter((c) => c.status === "fail");
  const steps: string[] = [];
  if (failing.some((c) => c.severity === "red")) steps.push("Fix the red items above. The booking can't be confirmed until they pass.");
  if (failing.some((c) => c.severity === "amber")) steps.push("Review the amber items. You can still dispatch, but they may cause delays or rejected deliveries.");
  if (checks.some((c) => c.status === "cannot-check")) steps.push("Fill in the missing details so every check can run.");
  steps.push(
    "Make sure you have a GB EORI number before collection.",
    "Prepare the commercial invoice using the selling price (or market value if not sold). List freight and insurance separately. It must travel with the goods.",
    "Decide who makes the export declaration: you, the carrier or a customs agent.",
    "Ask your buyer what import paperwork they need, and whether proof of origin will cut their duty.",
    "Keep the invoice and customs paperwork for your records (and your VAT accounts if VAT registered).",
  );
  if (status === "Ready to dispatch") steps.unshift("All checks pass. Confirm the booking to lock in the carrier.");
  return steps;
}
