import type { BookingPatch } from "./booking";
import type { Classification } from "./rules";

/** A field the user said they don't know. sku is omitted when it applies to the only/new item. */
export interface UnknownField { field: "hsCode" | "countryOfOrigin"; sku?: string }

/** What one chat message changed, from the LLM or the basic extractor. */
export interface Extraction {
  patch: BookingPatch;
  unknown: UnknownField[];
  unsupported: string[]; // places the user named that we don't serve
  classifications: Record<string, Classification>; // lowercase description -> R-06 verdict
}

export const emptyExtraction = (): Extraction => ({ patch: {}, unknown: [], unsupported: [], classifications: {} });

/**
 * Fill gaps in the LLM's extraction with what the basic extractor read from the same message.
 * The LLM wins on any field both found; the basic extractor only adds fields the LLM left out.
 */
export function fillGaps(llm: Extraction, basic: Extraction): Extraction {
  const booking = { ...basic.patch.booking, ...llm.patch.booking };
  let upsertItems = llm.patch.upsertItems ?? [];
  const basicItem = basic.patch.upsertItems?.[0];
  if (basicItem && upsertItems.length <= 1) {
    // keep the LLM's item identity (sku/description); if it gave neither, use basic mode's (the last item)
    const l = upsertItems[0];
    const identity = l && (l.sku || l.description) ? { sku: l.sku, description: l.description } : { sku: basicItem.sku, description: basicItem.description };
    upsertItems = [{ ...basicItem, ...l, ...identity }];
  }
  const unknown = [...llm.unknown, ...basic.unknown.filter((u) => !llm.unknown.some((x) => x.field === u.field))];
  return { ...llm, patch: { ...llm.patch, booking, upsertItems }, unknown };
}
