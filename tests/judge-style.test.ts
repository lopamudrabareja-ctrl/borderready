// Acceptance checks written from the case brief, using data not seen elsewhere in the tests:
// the judges' own template file, and a fresh workbook covering every route, priority and rule.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { recommend } from "@/lib/carriers";
import { decide } from "@/lib/confirm";
import { parseArrayBuffer, parseWorkbook } from "@/lib/excel";
import { overallStatus, runChecks } from "@/lib/rules";

const TODAY = "2026-10-26";
const BOOKING_HEAD = ["Booking ID", "Seller name", "Origin city", "Origin country", "Destination city", "Destination country", "Destination type", "Ready to ship date", "Seller priority", "Pallets", "Cartons", "Total declared value", "Currency", "Total gross weight (kg)", "Delivery appointment booked"];
const ITEM_HEAD = ["Booking ID", "SKU", "Description", "HS code", "Quantity (units)", "Unit price", "Units per carton", "Cartons", "Unit weight (kg)", "Country of origin"];

describe("the judges' template file as supplied", () => {
  const { bookings, warnings } = parseArrayBuffer(readFileSync("data/sample_template.xlsx"));
  it("reads the example row BK-001 and it passes every check", () => {
    expect(bookings.map((b) => b.id)).toEqual(["BK-001"]);
    const checks = runChecks(bookings[0], TODAY);
    expect(checks.filter((c) => c.status !== "pass")).toEqual([]);
    expect(overallStatus(checks)).toBe("Ready to dispatch");
    expect(warnings).toEqual([]);
  });
  it("recommends Carrier A at £540 for Cheapest to Frankfurt", () => {
    const b = bookings[0];
    const r = recommend(b.destCountry, b.pallets, b.grossWeight, b.priority);
    expect(r.recommended?.carrier).toBe("Carrier A");
    expect(r.totalCost).toBe(540);
    expect(r.reason).toMatch(/Carrier A/);
  });
});

// A fresh judge-style workbook: header on row 2, example row 3, data from row 4 (like the template).
function judgeWorkbook() {
  const B: unknown[][] = [
    // id, seller, origin, country, dest city, dest country, type, date, priority, pallets, cartons, value, cur, weight, appt
    ["J-01", "Leeds Linens", "Leeds", "United Kingdom", "Paris", "France", "Business address", "15-11-2026", "Fastest", 2, 40, 2400, "GBP", 500, "No"],          // clean, C (≤400 kg) fastest
    ["J-02", "Brum Bikes", "Birmingham", "United Kingdom", "Rotterdam", "Netherlands", "Warehouse", "20-11-2026", "Most reliable", 2, 50, 3000, "GBP", 900, "Yes"], // 450/pallet: C out, B picked, R-05 fails (C chosen)
    ["J-03", "Ldn Tea", "London", "United Kingdom", "Lyon", "France", "Business address", "18-11-2026", "Balanced", 1, 20, 1000, "GBP", 300, "No"],              // balanced → B
    ["J-04", "Ldn Tea", "London", "United Kingdom", "Hamburg", "Germany", "Warehouse", "18-11-2026", "Cheapest", 1, 20, 1000, "GBP", 300, "No"],                 // R-08 amber
    ["J-05", "Manc Mugs", "Manchester", "United Kingdom", "Amsterdam", "Netherlands", "Business address", "01-10-2026", "Cheapest", 1, 20, 1000, "GBP", 300, "No"], // R-10 amber (past)
    ["J-06", "Manc Mugs", "Manchester", "United Kingdom", "Berlin", "Germany", "Business address", "18-11-2026", "Cheapest", 1, 30, 1500, "GBP", 300, "No"],      // multi-item: R-01 + R-09 + R-06 aerosol
    ["J-07", "Manc Mugs", "Manchester", "United Kingdom", "Berlin", "Germany", "Business address", "18-11-2026", "Cheapest", 1, 20, 990, "GBP", 300, "No"],       // R-02 within 1% → pass
    ["J-08", "Manc Mugs", "Manchester", "United Kingdom", "Berlin", "Germany", "Business address", "18-11-2026", "Cheapest", 1, 20, 1000, "GBP", 150, "No"],      // R-07 amber: 150 < 200 kg
  ];
  const I: unknown[][] = [
    ["J-01", "LIN-1", "Cotton bed linen set", 630231, 400, 6, 10, 40, 1, "India"],
    ["J-02", "BK-1", "Bicycle helmet", 650610, 500, 6, 10, 50, 1.5, "China"],
    ["J-03", "TEA-1", "Loose leaf tea 250 g", 90240, 100, 10, 5, 20, 2, "India"],          // HS 90240 = 5 digits → R-01 red
    ["J-04", "TEA-2", "Loose leaf tea 250 g", "090240", 100, 10, 5, 20, 2, "India"],
    ["J-05", "MUG-9", "Stoneware mug", 691200, 100, 10, 5, 20, 2, "United Kingdom"],
    ["J-06", "MUG-A", "Stoneware mug", null, 100, 10, 10, 10, 1, "Vietnam"],                // R-01
    ["J-06", "MUG-B", "Stoneware mug", 691200, 50, 10, 5, 10, 1, null],                     // R-09
    ["J-06", "SPR-1", "Deodorant spray 150 ml", 330720, 50, 0, 5, 10, 1, "Turkey"],         // R-06 aerosol
    ["J-07", "MUG-C", "Stoneware mug", 691200, 100, 10, 5, 20, 2, "Germany"],
    ["J-08", "MUG-D", "Stoneware mug", 691200, 100, 10, 5, 20, 2, "Germany"],
  ];
  const wb = XLSX.utils.book_new();
  const ex = ["BK-001", "Northfield Goods", "Manchester", "United Kingdom", "Frankfurt", "Germany", "Warehouse", "05-11-2026", "Cheapest", 3, 90, 5400, "GBP", 620, "Yes"];
  const exItem = ["BK-001", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1080, 5, 12, 90, 0.5, "United Kingdom"];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Bookings"], BOOKING_HEAD, ex, ...B]), "Bookings");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Items"], ITEM_HEAD, exItem, ...I]), "Items");
  return parseWorkbook(wb);
}

describe("fresh judge-style workbook", () => {
  const { bookings, warnings } = judgeWorkbook();
  const get = (id: string) => bookings.find((b) => b.id === id)!;
  const fails = (id: string) => runChecks(get(id), TODAY).filter((c) => c.status !== "pass").map((c) => `${c.ruleId}:${c.severity}`);
  const pick = (id: string) => { const b = get(id); return recommend(b.destCountry, b.pallets, b.grossWeight, b.priority).recommended?.carrier; };

  it("reads every booking without warnings", () => {
    expect(bookings).toHaveLength(9);
    expect(warnings).toEqual([]);
  });
  it.each<[string, string[], string]>([
    ["J-01", [], "Ready to dispatch"],
    ["J-02", ["R-05:red"], "Not ready to dispatch"],
    ["J-03", ["R-01:red"], "Not ready to dispatch"],
    ["J-04", ["R-08:amber"], "Can dispatch after review"],
    ["J-05", ["R-10:amber"], "Can dispatch after review"],
    ["J-06", ["R-01:red", "R-06:red", "R-09:amber"], "Not ready to dispatch"],
    ["J-07", [], "Ready to dispatch"],
    ["J-08", ["R-07:amber"], "Can dispatch after review"],
  ])("%s → %j, %s", (id, expected, status) => {
    expect(fails(id)).toEqual(expected);
    expect(overallStatus(runChecks(get(id), TODAY))).toBe(status);
  });
  it("recommends by priority on each route", () => {
    expect(pick("J-01")).toBe("Carrier C"); // Fastest, 250 kg/pallet: C can take it
    expect(pick("J-02")).toBe("Carrier B"); // Most reliable, 450 kg/pallet: C excluded → B
    expect(pick("J-03")).toBe("Carrier B"); // Balanced
    expect(pick("J-04")).toBe("Carrier A"); // Cheapest
    expect(recommend("Netherlands", 2, 900, "Most reliable").totalCost).toBe(400); // B £200 × 2
  });
  it("every failing check says what's wrong, how serious, and how to fix it", () => {
    for (const b of bookings) for (const c of runChecks(b, TODAY).filter((x) => x.status === "fail")) {
      expect(c.message.length).toBeGreaterThan(15);
      expect(c.fix.length).toBeGreaterThan(10);
      expect(["red", "amber"]).toContain(c.severity);
    }
  });
  it("names the SKU and the matched words for the aerosol", () => {
    const r06 = runChecks(get("J-06"), TODAY).find((c) => c.ruleId === "R-06")!;
    expect(r06.message).toContain("SPR-1");
    expect(r06.message).toContain("deodorant spray");
  });
  it("the R-05 failure offers a switch with its cost and the pallet count that would work", () => {
    const r05 = runChecks(get("J-02"), TODAY).find((c) => c.ruleId === "R-05")!;
    expect(r05.message).toContain("450 kg per pallet is over Carrier C's limit of 400 kg");
    expect(r05.actions?.map((a) => a.label)).toEqual(["Switch to Carrier B (£400)", "Use 3 pallets with Carrier C"]);
  });
  it("confirming: blocked on red, warns on amber, confirms clean", () => {
    const d = (id: string) => { const b = get(id); return decide(runChecks(b, TODAY), recommend(b.destCountry, b.pallets, b.grossWeight, b.priority).recommended).kind; };
    expect(d("J-03")).toBe("blocked");
    expect(d("J-04")).toBe("warn");
    expect(d("J-01")).toBe("ok");
  });
});
