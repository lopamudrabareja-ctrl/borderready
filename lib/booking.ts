import type { Booking, Item } from "./types";
import { DESTINATIONS, ORIGIN_CITIES } from "./types";

export function emptyBooking(id = "CHAT-001"): Booking {
  return {
    id, sellerName: null, originCity: null, originCountry: "United Kingdom", destCity: null,
    destCountry: null, destType: null, readyDate: null, priority: null, pallets: null, cartons: null,
    declaredValue: null, currency: "GBP", grossWeight: null, appointmentBooked: null, items: [],
  };
}

export function emptyItem(sku: string, description = ""): Item {
  return {
    sku, description, hsCode: null, quantity: null, unitPrice: null, unitsPerCarton: null,
    cartons: null, unitWeight: null, countryOfOrigin: null,
  };
}

export interface BookingPatch {
  booking?: Partial<Omit<Booking, "items" | "id" | "currency" | "originCountry">>;
  upsertItems?: Partial<Item>[]; // keyed by sku, else by description
  removeItems?: string[]; // sku or description
}

export function countryForCity(city: string | null): Booking["destCountry"] {
  if (!city) return null;
  for (const [country, cities] of Object.entries(DESTINATIONS)) {
    if ((cities as readonly string[]).some((c) => c.toLowerCase() === city.toLowerCase())) return country as Booking["destCountry"];
  }
  return null;
}

const canon = (list: readonly string[], v: string | null | undefined) =>
  v ? (list.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null) : null;

export function applyPatch(b: Booking, patch: BookingPatch): Booking {
  const next: Booking = { ...b, items: b.items.map((i) => ({ ...i })) };
  const p = patch.booking ?? {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    (next as unknown as Record<string, unknown>)[k] = v;
  }
  if (p.originCity !== undefined) next.originCity = canon(ORIGIN_CITIES, p.originCity);
  if (p.destCity !== undefined) {
    const all = Object.values(DESTINATIONS).flat();
    next.destCity = canon(all, p.destCity);
    next.destCountry = countryForCity(next.destCity);
  }
  const find = (key: string | undefined, desc: string | undefined) =>
    next.items.find((i) => (key && i.sku.toLowerCase() === key.toLowerCase()) || (!key && desc && i.description.toLowerCase() === desc.toLowerCase()));
  for (const u of patch.upsertItems ?? []) {
    const existing = find(u.sku, u.description);
    if (existing) {
      for (const [k, v] of Object.entries(u)) if (v !== undefined) (existing as unknown as Record<string, unknown>)[k] = v;
    } else {
      const sku = u.sku || `ITEM-${next.items.length + 1}`;
      next.items.push({ ...emptyItem(sku, u.description ?? ""), ...stripUndefined(u), sku });
    }
  }
  for (const r of patch.removeItems ?? []) {
    next.items = next.items.filter((i) => i.sku.toLowerCase() !== r.toLowerCase() && i.description.toLowerCase() !== r.toLowerCase());
  }
  return next;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Fill derivable blanks without overwriting anything the user stated. */
export function effectiveItem(i: Item): Item {
  const e = { ...i };
  if (e.cartons == null && e.quantity != null && e.unitsPerCarton) {
    const c = e.quantity / e.unitsPerCarton;
    if (Number.isInteger(c)) e.cartons = c;
  }
  if (e.quantity == null && e.cartons != null && e.unitsPerCarton) e.quantity = e.cartons * e.unitsPerCarton;
  return e;
}

export const itemsValue = (b: Booking) =>
  b.items.reduce((s, i) => s + (effectiveItem(i).quantity ?? 0) * (i.unitPrice ?? 0), 0);

export const itemsCartons = (b: Booking) => b.items.reduce((s, i) => s + (effectiveItem(i).cartons ?? 0), 0);

export function effectiveBooking(b: Booking): Booking {
  const items = b.items.map(effectiveItem);
  const e = { ...b, items };
  if (e.cartons == null && items.length) e.cartons = itemsCartons(e);
  if (e.declaredValue == null && items.length) e.declaredValue = itemsValue(e);
  return e;
}

export interface Missing { field: string; label: string; group: "shipment" | "item"; sku?: string; itemName?: string }

export function missingFields(b: Booking): Missing[] {
  const e = effectiveBooking(b);
  const m: Missing[] = [];
  const s = (field: string, label: string) => m.push({ field, label, group: "shipment" });
  if (!e.originCity) s("originCity", "origin city (London, Manchester, Birmingham or Leeds)");
  if (!e.destCity) s("destCity", "destination city (Berlin, Frankfurt, Hamburg, Paris, Lyon, Amsterdam or Rotterdam)");
  if (!e.destType) s("destType", "destination type (Warehouse or Business address)");
  if (!e.readyDate) s("readyDate", "ready-to-ship date");
  if (!e.priority) s("priority", "priority (Cheapest, Fastest, Most reliable or Balanced)");
  if (!e.pallets) s("pallets", "number of pallets");
  if (e.cartons == null) s("cartons", "number of cartons");
  if (e.declaredValue == null) s("declaredValue", "total declared value");
  if (e.grossWeight == null) s("grossWeight", "total gross weight (kg)");
  if (e.destType === "Warehouse" && !e.appointmentBooked) s("appointmentBooked", "whether a delivery appointment is booked");
  if (!e.items.length) s("items", "item details");
  for (const i of e.items) {
    const it = (field: string, label: string) => m.push({ field, label, group: "item", sku: i.sku, itemName: i.description || i.sku });
    if (!i.description) it("description", "description");
    if (i.quantity == null) it("quantity", "quantity");
    if (i.unitPrice == null) it("unitPrice", "unit price (£)");
    if (i.unitsPerCarton == null) it("unitsPerCarton", "units per carton");
    if (i.unitWeight == null) it("unitWeight", "unit weight (kg)");
    if (!i.hsCode) it("hsCode", "HS code");
    if (!i.countryOfOrigin) it("countryOfOrigin", "country of origin");
  }
  return m;
}

export function summary(b: Booking) {
  const e = effectiveBooking(b);
  return {
    route: e.originCity && e.destCity ? `${e.originCity} → ${e.destCity}, ${e.destCountry}` : null,
    destType: e.destType, pallets: e.pallets, cartons: e.cartons, grossWeight: e.grossWeight,
    declaredValue: e.declaredValue, readyDate: e.readyDate, priority: e.priority,
    weightPerPallet: e.pallets && e.grossWeight != null ? Math.round((e.grossWeight / e.pallets) * 10) / 10 : null,
  };
}
