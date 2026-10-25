import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/excel";
import { recommend } from "@/lib/carriers";
import { overallStatus, runChecks } from "@/lib/rules";
import { compute } from "@/components/ResultView";
import { TODAY } from "./helpers";

const BOOKING_HEAD = ["Booking ID", "Seller name", "Origin city", "Origin country", "Destination city", "Destination country", "Destination type", "Ready to ship date", "Seller priority", "Pallets", "Cartons", "Total declared value", "Currency", "Total gross weight (kg)", "Delivery appointment booked"];
const ITEM_HEAD = ["Booking ID", "SKU", "Description", "HS code", "Quantity (units)", "Unit price", "Units per carton", "Cartons", "Unit weight (kg)", "Country of origin"];

function workbook(bookings: unknown[][], items: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["title"], BOOKING_HEAD, ...bookings]), "Bookings");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["title"], ITEM_HEAD, ...items]), "Items");
  return wb;
}

describe("junk cells never crash", () => {
  const JUNK = [null, "", " ", "abc", -5, 0, 1e12, "12,5", "£1,000", true, "#N/A", "  Warehouse ", NaN, "05/13/2026", 45967.5];
  const pick = (i: number) => JUNK[i % JUNK.length];

  it("200 random rows parse and run all checks and carriers", () => {
    const bookings = Array.from({ length: 100 }, (_, n) => [`BK-${n % 90}`, ...BOOKING_HEAD.slice(1).map((_, c) => pick(n * 7 + c * 3))]);
    const items = Array.from({ length: 100 }, (_, n) => [`BK-${n % 110}`, ...ITEM_HEAD.slice(1).map((_, c) => pick(n * 5 + c * 11))]);
    const { bookings: parsed, warnings } = parseWorkbook(workbook(bookings, items));
    expect(parsed.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    for (const b of parsed) {
      const res = runChecks(b, TODAY);
      expect(res).toHaveLength(10);
      expect(() => overallStatus(res)).not.toThrow();
      expect(() => recommend(b.destCountry, b.pallets, b.grossWeight, b.priority)).not.toThrow();
      expect(() => compute(b, TODAY)).not.toThrow();
      for (const r of res) expect(`${r.message} ${r.fix}`, r.message).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});

describe("allowed-value warnings", () => {
  it("explains values outside the template lists", () => {
    const { bookings, warnings } = parseWorkbook(workbook(
      [["BK-X", "S", "Manchster", "United Kingdom", "Paris", "Germany", "Depot", "05-11-2030", "Cheap", "two", 10, 100, "EUR", 50, "Maybe"]],
      [["BK-X", "A1", "Mug", 691200, 10, 10, 1, 10, 1, "Japan"], ["BK-X", "A1", "Mug", 691200, -3, 10, 1, 10, 1, "China"]],
    ));
    const all = warnings.join("\n");
    for (const s of ["Manchster", "Paris is not in Germany", "Depot", "Cheap", '"two" is not a number', "EUR", "Maybe", "Japan", "A1 appears more than once", "negative"]) {
      expect(all).toContain(s);
    }
    const b = bookings[0];
    expect(b.originCity).toBeNull();
    expect(b.priority).toBeNull();
    expect(b.items.map((i) => i.sku)).toEqual(["A1", "A1-2"]);
    expect(runChecks(b, TODAY).find((r) => r.ruleId === "R-08")!.status).toBe("cannot-check");
  });

  it("accepts case and whitespace variations without warnings", () => {
    const { bookings, warnings } = parseWorkbook(workbook(
      [["BK-Y", "S", " manchester ", "united kingdom", "FRANKFURT", "germany", "warehouse", "05-11-2030", "most reliable", 3, 90, 5400, "gbp", 620, "YES"]],
      [["BK-Y", "M", "Mug", 691200, 1080, 5, 12, 90, 0.5, "china"]],
    ));
    expect(warnings).toEqual([]);
    expect(bookings[0]).toMatchObject({ originCity: "Manchester", destCity: "Frankfurt", destType: "Warehouse", priority: "Most reliable", appointmentBooked: "Yes" });
    expect(bookings[0].items[0].countryOfOrigin).toBe("China");
  });
});
