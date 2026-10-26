// Delivery notice (advance shipping notice) for the receiving site: what's coming and what to count.
import { effectiveBooking } from "./booking";
import type { Booking, CarrierOption } from "./types";

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";

export interface Notice {
  title: string;
  intro: string;
  fields: [string, string][];
  appointmentWarning: boolean;
  items: [string, string, string, string][]; // SKU, description, units, cartons
  text: string; // plain text for copying into an email
}

export function buildNotice(raw: Booking, carrier: CarrierOption): Notice {
  const b = effectiveBooking(raw);
  const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-GB"));
  const eta = b.readyDate ? addDays(b.readyDate, carrier.days) : null;
  const appointment = b.destType !== "Warehouse" ? "Not needed" : b.appointmentBooked === "Yes" ? "Booked" : "Not booked yet. Please arrange a delivery slot.";
  const fields: [string, string][] = [
    ["Booking reference", b.id],
    ["From", `${b.sellerName ? `${b.sellerName}, ` : ""}${b.originCity ?? "—"}, United Kingdom`],
    ["To", `${b.destType === "Warehouse" ? "Warehouse" : "Business address"}, ${b.destCity ?? "—"}, ${b.destCountry ?? "—"}`],
    ["Carrier", `${carrier.carrier} · ${carrier.service} · ${carrier.days} days in transit`],
    ["Collection", fmt(b.readyDate)],
    ["Expected arrival", fmt(eta)],
    ["Pallets", n(b.pallets)],
    ["Cartons", n(b.cartons)],
    ["Gross weight", b.grossWeight == null ? "—" : `${n(b.grossWeight)} kg`],
    ["Delivery appointment", appointment],
  ];
  const items = b.items.map((i): [string, string, string, string] => [i.sku, i.description || "—", n(i.quantity), n(i.cartons)]);
  const title = "Delivery notice";
  const intro = "A shipment is on its way to you. When it arrives, please check the cartons and quantities against this notice.";
  const text = [
    `${title} · ${b.id}`, "", intro, "",
    ...fields.map(([k, v]) => `${k}: ${v}`), "",
    "Contents:",
    ...items.map(([sku, desc, units, cartons]) => `- ${sku} · ${desc} · ${units} units · ${cartons} cartons`),
  ].join("\n");
  return { title, intro, fields, items, text, appointmentWarning: b.destType === "Warehouse" && b.appointmentBooked !== "Yes" };
}
