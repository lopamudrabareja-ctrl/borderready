// Basic mode: a keyword/regex extractor used when the LLM is unavailable. Handles simple, single-item messages.
import type { BookingPatch } from "./booking";
import { emptyExtraction, type Extraction } from "./extraction";
import type { Booking, Item, Priority } from "./types";
import { DESTINATIONS, ITEM_ORIGINS, ORIGIN_CITIES } from "./types";

const DEST_CITIES = Object.values(DESTINATIONS).flat() as string[];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const N = String.raw`(\d+(?:[.,]\d+)?)`;
const toN = (s: string) => Number(s.replace(",", "."));

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseLooseDate(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const base = new Date(`${today}T12:00:00`);
  if (/\btoday\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) { base.setDate(base.getDate() + 1); return iso(base); }
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTHS.join("|")})[a-z]*\.?(?:\s+(\d{4}))?`));
  if (m) {
    const month = MONTHS.indexOf(m[2]) + 1;
    let year = m[3] ? Number(m[3]) : base.getFullYear();
    const candidate = `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!m[3] && candidate < today) year += 1;
    return `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const findCity = (text: string, list: string[]) => list.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? null;

export function basicExtract(message: string, booking: Booking, today: string): Extraction {
  const ex = emptyExtraction();
  const t = message.toLowerCase();
  const b: NonNullable<BookingPatch["booking"]> = {};
  const item: Partial<Item> = {};

  const origin = findCity(message, [...ORIGIN_CITIES]);
  if (origin) b.originCity = origin;
  const dest = findCity(message, DEST_CITIES);
  if (dest) b.destCity = dest;
  const to = message.match(/\bto\s+(?:a\s+\w+\s+in\s+)?([A-Z][a-z]+)/);
  if (to && !dest && !DEST_CITIES.includes(to[1]) && !["A", "The"].includes(to[1])) ex.unsupported.push(to[1]);
  const from = message.match(/\bfrom\s+([A-Z][a-z]+)/);
  if (from && !origin && !(ORIGIN_CITIES as readonly string[]).includes(from[1])) ex.unsupported.push(from[1]);

  if (/\bwarehouse\b/.test(t)) b.destType = "Warehouse";
  else if (/\b(business address|office|shop|store|business)\b/.test(t)) b.destType = "Business address";

  const prio: [RegExp, Priority][] = [
    [/\b(most reliable|reliab\w*|on[- ]time)\b/, "Most reliable"], [/\b(fastest|fast|quick\w*|urgent|express)\b/, "Fastest"],
    [/\b(cheapest|cheap\w*|lowest cost|budget)\b/, "Cheapest"], [/\b(balanced|no preference|best value)\b/, "Balanced"],
  ];
  const p = prio.find(([re]) => re.test(t));
  if (p) b.priority = p[1];

  let m = t.match(new RegExp(`${N}\\s*pallets?`));
  if (m) b.pallets = toN(m[1]);

  const PHRASE = String.raw`([a-zA-Z][a-zA-Z0-9\s-]*?)(?=\s*[(,.;]|\s+(?:from|to|at|for|in|with|weigh\w*|on)\b|$)`;
  m = message.match(new RegExp(String.raw`(\d+)\s*(?:cartons?|boxes)(?:\s+of\s+${PHRASE})?`, "i"));
  if (m) { item.cartons = Number(m[1]); if (m[2]) item.description = m[2].trim(); }
  // "sending 1080 ceramic mugs" -> quantity and description
  m = message.match(new RegExp(String.raw`(?:\b(?:send|sending|ship|shipping|export|exporting|got|have)\s+|^\s*)(\d[\d,]*)\s+${PHRASE}`, "i"));
  if (m && !/^(cartons?|boxes|pallets?|units?|pieces|pcs|kg)\b/i.test(m[2])) {
    item.quantity = Number(m[1].replace(/,/g, ""));
    item.description ??= m[2].trim();
  }

  m = t.match(/(\d+)\s*(?:units?|pieces|pcs|items)\s*(?:per|in each|a|each)\s*(?:carton|box)/) ?? t.match(/(\d+)\s*(?:per|in each|a)\s*(?:carton|box)/);
  if (m) item.unitsPerCarton = Number(m[1]);
  m = t.match(/(\d+)\s*(?:units?|pieces|pcs)\b(?!\s*(?:per|in each|a|each)\s*(?:carton|box))/);
  if (m) item.quantity = Number(m[1]);

  for (const w of t.matchAll(new RegExp(`${N}\\s*(?:kg|kilos?|kilograms?)\\b([^.,;]{0,20})`, "g"))) {
    const before = t.slice(Math.max(0, w.index! - 25), w.index!);
    if (/\b(each|per unit|per item|a unit|unit weight)\b/.test(w[2] + " " + before)) item.unitWeight = toN(w[1]);
    else b.grossWeight = toN(w[1]);
  }

  for (const v of t.matchAll(/£\s?(\d[\d,]*(?:\.\d+)?)([^.,;]{0,20})/g)) {
    const before = t.slice(Math.max(0, v.index! - 25), v.index!);
    const amount = Number(v[1].replace(/,/g, ""));
    if (/\b(each|per unit|per item|a unit|unit price|per mug|apiece)\b/.test(v[2] + " " + before)) item.unitPrice = amount;
    else if (/\b(total|declared|worth|value|altogether)\b/.test(v[2] + " " + before)) b.declaredValue = amount;
    else item.unitPrice = amount;
  }

  m = t.match(/\bhs(?:\s*code)?\s*(?:is|:|=)?\s*(\d+(?:[ .]\d+)*)/);
  if (m) item.hsCode = m[1].replace(/[\s.]/g, "");
  if (/(don'?t|do not|no idea|not sure|unsure)[^.]*\b(hs|commodity)\b/.test(t)) ex.unknown.push({ field: "hsCode" });
  if (/(don'?t|do not|no idea|not sure|unsure)[^.]*\b(origin|where (it'?s|they'?re) made)\b/.test(t)) ex.unknown.push({ field: "countryOfOrigin" });
  const made = ITEM_ORIGINS.find((c) => new RegExp(`\\b(made in|from|origin(?: is)?:?)\\s+(the\\s+)?${c}\\b`, "i").test(message) || (c === "United Kingdom" && /\bmade in (the )?uk\b/.test(t)));
  if (made) item.countryOfOrigin = made;

  if (/\b(no appointment|appointment (is )?not booked|haven'?t booked|not booked|without (an )?appointment)\b/.test(t)) b.appointmentBooked = "No";
  else if (/\bappointment\b/.test(t) && /\b(booked|yes|have|got|confirmed)\b/.test(t)) b.appointmentBooked = "Yes";

  const seller = message.match(/\b(?:seller(?:\s+name)?|company(?:\s+name)?|business(?:\s+name)?)\s*(?:is|:|=)\s*([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})/i);
  if (seller) b.sellerName = seller[1].split(/[.,;](?:\s|$)/)[0].trim(); // stop at the end of the sentence
  const sku = message.match(/\b(?:sku|product code|item code)\s*(?:is|:|=)?\s*([A-Z0-9][A-Z0-9-]{1,30})\b/i);
  if (sku) item.sku = sku[1].toUpperCase();

  const date = parseLooseDate(message, today);
  if (date) b.readyDate = date;

  ex.patch.booking = b;
  if (Object.keys(item).length) {
    // basic mode tracks one item: update the last item, or create one
    const target = booking.items.at(-1);
    // a stated SKU renames the item (matched by description); otherwise keep its current SKU
    ex.patch.upsertItems = [target ? { ...item, sku: item.sku ?? target.sku, description: target.description || item.description } : item];
  }
  return ex;
}
