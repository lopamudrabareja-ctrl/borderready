import * as XLSX from "xlsx";
import { countryForCity, emptyBooking, emptyItem } from "./booking";
import type { Booking, Item } from "./types";
import { DEST_TYPES, DESTINATIONS, ITEM_ORIGINS, ORIGIN_CITIES, PRIORITIES } from "./types";

export interface ParseResult { bookings: Booking[]; warnings: string[] }

type Row = unknown[];

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[£,\s]/g, ""));
  return String(v).trim() === "" || !Number.isFinite(n) ? null : n;
};

const canon = <T extends string>(list: readonly T[], v: unknown): T | null => {
  const s = clean(v);
  return s ? (list.find((x) => x.toLowerCase() === s.toLowerCase()) ?? null) : null;
};

/** HS code as a digit string: strips ".0", spaces and dots; blank stays null. Other characters are kept so R-01 fails. */
export function normaliseHs(v: unknown): string | null {
  if (v == null || typeof v === "boolean" || (typeof v === "number" && !Number.isFinite(v))) return null;
  let s = String(v).trim();
  // "691200.0" is a number saved as text; "6912.00" is a dotted HS code, so only a lone ".0" is dropped
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  s = s.replace(/[\s.]/g, "");
  return s === "" ? null : s;
}

/** DD-MM-YYYY text (or an Excel date serial) to yyyy-mm-dd. */
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? iso(d.y, d.m, d.d) : null;
  }
  const m = String(v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return iso(y, mo, d);
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function findSheet(wb: XLSX.WorkBook, name: string) {
  const n = wb.SheetNames.find((s) => s.trim().toLowerCase() === name);
  return n ? wb.Sheets[n] : null;
}

/** Locate the header row by its "Booking ID" cell; returns rows after it and a column lookup. */
function table(ws: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const h = rows.findIndex((r) => r.some((c) => clean(c)?.toLowerCase() === "booking id"));
  if (h < 0) return null;
  const heads = rows[h].map((c) => clean(c)?.toLowerCase() ?? "");
  const col = (...names: string[]) => heads.findIndex((x) => names.some((n) => x.startsWith(n)));
  return { rows: rows.slice(h + 1).map((r, i) => ({ r, line: h + 2 + i })), col };
}

const isEmpty = (r: Row) => r.every((c) => clean(c) == null);

/** Reads cells and records a plain-English warning for any value outside the template's allowed lists. */
function reader(warnings: string[]) {
  return {
    allowed<T extends string>(who: string, label: string, raw: unknown, list: readonly T[], effect: string): T | null {
      const v = canon(list, raw);
      if (!v && clean(raw)) warnings.push(`${who}: ${label} "${clean(raw)}" is not one of ${list.join(", ")}; ${effect}.`);
      return v;
    },
    number(who: string, label: string, raw: unknown): number | null {
      const n = toNum(raw);
      if (n == null && clean(raw)) warnings.push(`${who}: ${label} "${clean(raw)}" is not a number, so it was left blank.`);
      else if (n != null && n < 0) { warnings.push(`${who}: ${label} is negative (${n}), so it was left blank.`); return null; }
      return n;
    },
  };
}

export function parseWorkbook(wb: XLSX.WorkBook): ParseResult {
  const warnings: string[] = [];
  const bookings: Booking[] = [];
  const bs = findSheet(wb, "bookings");
  const is = findSheet(wb, "items");
  if (!bs) return { bookings, warnings: ['No "Bookings" sheet found. Use the sample template layout.'] };
  const bt = table(bs);
  if (!bt) return { bookings, warnings: ['Could not find a "Booking ID" header row in the Bookings sheet.'] };
  const c = {
    id: bt.col("booking id"), seller: bt.col("seller name"), oCity: bt.col("origin city"), oCountry: bt.col("origin country"),
    dCity: bt.col("destination city"), dCountry: bt.col("destination country"), dType: bt.col("destination type"),
    date: bt.col("ready to ship"), prio: bt.col("seller priority"), pallets: bt.col("pallets"), cartons: bt.col("cartons"),
    value: bt.col("total declared"), cur: bt.col("currency"), weight: bt.col("total gross"), appt: bt.col("delivery appointment"),
  };
  const get = (r: Row, i: number) => (i >= 0 ? r[i] : null);
  const read = reader(warnings);

  for (const { r, line } of bt.rows) {
    if (isEmpty(r)) continue;
    const id = clean(get(r, c.id));
    if (!id) { warnings.push(`Bookings row ${line} has data but no Booking ID, so it was skipped.`); continue; }
    if (bookings.some((b) => b.id === id)) { warnings.push(`Booking ID ${id} appears more than once; only the first was used.`); continue; }
    const b = emptyBooking(id);
    b.sellerName = clean(get(r, c.seller));
    b.originCity = read.allowed(id, "origin city", get(r, c.oCity), ORIGIN_CITIES, "it was left blank");
    const oCountry = clean(get(r, c.oCountry));
    if (oCountry && oCountry.toLowerCase() !== "united kingdom") warnings.push(`${id}: origin country "${oCountry}" is not United Kingdom; this tool only covers UK exports.`);
    b.destCity = read.allowed(id, "destination city", get(r, c.dCity), Object.values(DESTINATIONS).flat(), "it was left blank");
    const country = canon(Object.keys(DESTINATIONS), get(r, c.dCountry));
    b.destCountry = (country ?? countryForCity(b.destCity)) as Booking["destCountry"];
    if (!b.destCountry) warnings.push(`${id}: destination country "${clean(get(r, c.dCountry)) ?? ""}" is not supported (Germany, France or Netherlands).`);
    else if (b.destCity && countryForCity(b.destCity) !== b.destCountry) warnings.push(`${id}: ${b.destCity} is not in ${b.destCountry}; carriers were priced for ${b.destCountry}.`);
    b.destType = read.allowed(id, "destination type", get(r, c.dType), DEST_TYPES, "the appointment check can't run");
    b.readyDate = parseDate(get(r, c.date));
    if (clean(get(r, c.date)) && !b.readyDate) warnings.push(`${id}: could not read ready date "${clean(get(r, c.date))}" (expected DD-MM-YYYY).`);
    b.priority = read.allowed(id, "seller priority", get(r, c.prio), PRIORITIES, "Balanced was used");
    b.pallets = read.number(id, "Pallets", get(r, c.pallets));
    b.cartons = read.number(id, "Cartons", get(r, c.cartons));
    b.declaredValue = read.number(id, "Total declared value", get(r, c.value));
    b.grossWeight = read.number(id, "Total gross weight", get(r, c.weight));
    const cur = clean(get(r, c.cur));
    if (cur && cur.toUpperCase() !== "GBP") warnings.push(`${id}: currency "${cur}" is not GBP; amounts are treated as GBP.`);
    const ap = clean(get(r, c.appt))?.toLowerCase();
    b.appointmentBooked = ap === "yes" ? "Yes" : ap === "no" ? "No" : null;
    if (ap && !b.appointmentBooked) warnings.push(`${id}: delivery appointment "${clean(get(r, c.appt))}" should be Yes or No, so it was treated as not booked.`);
    bookings.push(b);
  }

  const it = is ? table(is) : null;
  if (!it) {
    warnings.push('No usable "Items" sheet found, so no booking has items.');
  } else {
    const k = {
      id: it.col("booking id"), sku: it.col("sku"), desc: it.col("description"), hs: it.col("hs code"), qty: it.col("quantity"),
      price: it.col("unit price"), upc: it.col("units per carton"), cartons: it.col("cartons"), weight: it.col("unit weight"),
      origin: it.col("country of origin"),
    };
    const iget = (r: Row, i: number) => (i >= 0 ? r[i] : null);
    const read = reader(warnings);
    for (const { r, line } of it.rows) {
      if (isEmpty(r)) continue;
      const id = clean(iget(r, k.id));
      const b = bookings.find((x) => x.id === id);
      if (!b) { warnings.push(`Items row ${line} refers to Booking ID "${id ?? ""}", which is not in the Bookings sheet, so it was ignored.`); continue; }
      let sku = clean(iget(r, k.sku)) ?? `${id}-ITEM-${b.items.length + 1}`;
      if (b.items.some((i) => i.sku === sku)) {
        warnings.push(`${id}: SKU ${sku} appears more than once; the repeat is shown as ${sku}-${b.items.length + 1}.`);
        sku = `${sku}-${b.items.length + 1}`;
      }
      const who = `${id} / ${sku}`;
      const origin = clean(iget(r, k.origin));
      if (origin && !canon(ITEM_ORIGINS, origin)) warnings.push(`${who}: country of origin "${origin}" is not in the template's list (${ITEM_ORIGINS.join(", ")}).`);
      const item: Item = {
        ...emptyItem(sku, clean(iget(r, k.desc)) ?? ""),
        hsCode: normaliseHs(iget(r, k.hs)),
        quantity: read.number(who, "Quantity", iget(r, k.qty)),
        unitPrice: read.number(who, "Unit price", iget(r, k.price)),
        unitsPerCarton: read.number(who, "Units per carton", iget(r, k.upc)),
        cartons: read.number(who, "Cartons", iget(r, k.cartons)),
        unitWeight: read.number(who, "Unit weight", iget(r, k.weight)),
        countryOfOrigin: canon(ITEM_ORIGINS, origin) ?? origin,
      };
      b.items.push(item);
    }
  }
  for (const b of bookings) if (!b.items.length) warnings.push(`${b.id} has no items in the Items sheet.`);
  return { bookings, warnings };
}

export function parseArrayBuffer(data: ArrayBuffer | Uint8Array): ParseResult {
  try {
    return parseWorkbook(XLSX.read(data, { type: "array" }));
  } catch {
    return { bookings: [], warnings: ["That file could not be read as an Excel workbook (.xlsx)."] };
  }
}
