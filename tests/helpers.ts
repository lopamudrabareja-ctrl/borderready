import { emptyItem } from "@/lib/booking";
import type { Booking, Item } from "@/lib/types";

export const TODAY = "2026-10-26";
export const FUTURE = "2026-11-10";

export function item(over: Partial<Item> = {}): Item {
  return {
    ...emptyItem("SKU-1", "Ceramic mug"),
    hsCode: "691200", quantity: 1080, unitPrice: 5, unitsPerCarton: 12, cartons: 90, unitWeight: 0.5, countryOfOrigin: "China",
    ...over,
  };
}

/** BK-001 baseline: 1080 x £5 = 5400, 12 x 90 = 1080, 620 kg >= 540, 206.7 kg per pallet. */
export function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: "BK-001", sellerName: "Acme", originCity: "Manchester", originCountry: "United Kingdom",
    destCity: "Frankfurt", destCountry: "Germany", destType: "Business address", readyDate: FUTURE,
    priority: "Cheapest", pallets: 3, cartons: 90, declaredValue: 5400, currency: "GBP", grossWeight: 620,
    appointmentBooked: "No", items: [item()], ...over,
  };
}
