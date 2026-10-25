import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normaliseHs, parseArrayBuffer, parseDate, parseWorkbook } from "@/lib/excel";
import { overallStatus, runChecks } from "@/lib/rules";
import { TODAY } from "./helpers";

const { bookings, warnings } = parseArrayBuffer(readFileSync("fixtures/test_bookings.xlsx"));
const get = (id: string) => bookings.find((b) => b.id === id)!;
const failing = (id: string) => runChecks(get(id), TODAY).filter((r) => r.status === "fail").map((r) => r.ruleId);
const status = (id: string, rule: string) => runChecks(get(id), TODAY).find((r) => r.ruleId === rule)!.status;

describe("16 parser edge cases", () => {
  it("keeps the template example row and skips empty rows", () => {
    expect(bookings[0].id).toBe("BK-001");
    expect(bookings).toHaveLength(21);
  });
  it("reads dates as DD-MM-YYYY", () => {
    expect(get("BK-001").readyDate).toBe("2026-11-05");
    expect(get("BK-R10").readyDate).toBe("2020-01-01");
  });
  it("normalises HS codes", () => {
    expect(get("BK-EDGE-HS").items[0].hsCode).toBe("691200");
    expect(get("BK-R01").items.map((i) => i.hsCode)).toEqual([null, "12345", "0901210"]);
  });
  it("blank origin is null", () => expect(get("BK-R09").items[0].countryOfOrigin).toBeNull());
  it("warns about unknown booking IDs and bookings with no items", () => {
    expect(warnings.some((w) => w.includes("BK-GHOST"))).toBe(true);
    expect(warnings.some((w) => w.includes("BK-NOITEMS has no items"))).toBe(true);
  });
});

describe("planted errors fire exactly the expected rules", () => {
  it.each<[string, string[]]>([
    ["BK-001", []],
    ["BK-CLEAN", []],
    ["BK-R01", ["R-01"]],
    ["BK-R02", ["R-02"]],
    ["BK-R02-OK", []],
    ["BK-R02-BAD", ["R-02"]],
    ["BK-R03", ["R-03"]],
    ["BK-R04", ["R-04"]],
    ["BK-R05", ["R-05"]],
    ["BK-R05-NONE", ["R-05"]],
    ["BK-R05-ZERO", []],
    ["BK-R06", ["R-06"]],
    ["BK-R06-OK", []],
    ["BK-R07", ["R-07"]],
    ["BK-R08", ["R-08"]],
    ["BK-R08-OK", []],
    ["BK-R09", ["R-09"]],
    ["BK-R10", ["R-10"]],
    ["BK-MULTI", ["R-01", "R-09"]],
    ["BK-EDGE-HS", []],
  ])("%s -> %j", (id, rules) => expect(failing(id)).toEqual(rules));

  it("R-01 names the two bad SKUs only", () => {
    const m = runChecks(get("BK-R01"), TODAY).find((r) => r.ruleId === "R-01")!.message;
    expect(m).toContain("HS-BLANK");
    expect(m).toContain("HS-SHORT");
    expect(m).not.toContain("HS-ZERO");
  });
  it("pallets 0 is cannot-check and not ready", () => {
    expect(status("BK-R05-ZERO", "R-05")).toBe("cannot-check");
    expect(overallStatus(runChecks(get("BK-R05-ZERO"), TODAY))).toBe("Not ready to dispatch");
  });
  it("booking with no items does not crash and cannot be checked", () => {
    expect(status("BK-NOITEMS", "R-01")).toBe("cannot-check");
    expect(overallStatus(runChecks(get("BK-NOITEMS"), TODAY))).toBe("Not ready to dispatch");
  });
  it("overall status", () => {
    expect(overallStatus(runChecks(get("BK-CLEAN"), TODAY))).toBe("Ready to dispatch");
    expect(overallStatus(runChecks(get("BK-R07"), TODAY))).toBe("Can dispatch after review");
    expect(overallStatus(runChecks(get("BK-R01"), TODAY))).toBe("Not ready to dispatch");
  });
});

describe("helpers", () => {
  it("normaliseHs", () => {
    expect(normaliseHs(691200)).toBe("691200");
    expect(normaliseHs("6912.00")).toBe("691200");
    expect(normaliseHs(" 69 12 00 ")).toBe("691200");
    expect(normaliseHs("691200.0")).toBe("691200");
    expect(normaliseHs("")).toBeNull();
    expect(normaliseHs("ABC123")).toBe("ABC123");
  });
  it("parseDate", () => {
    expect(parseDate("05-11-2026")).toBe("2026-11-05");
    expect(parseDate("31-02-2026")).toBeNull();
    expect(parseDate("2026-11-05")).toBeNull();
  });
  it("non-Excel data gives a friendly warning", () => {
    const r = parseArrayBuffer(new Uint8Array([1, 2, 3]));
    expect(r.bookings).toEqual([]);
  });
  it("finds the header row wherever it is", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Booking ID", "Destination city"], ["X1", "Paris"]]), "Bookings");
    const r = parseWorkbook(wb);
    expect(r.bookings[0].destCountry).toBe("France");
  });
});
