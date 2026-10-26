// The hand-made test workbook in test-data/ (built from the judges' template): each booking's expected result.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/carriers";
import { parseArrayBuffer } from "@/lib/excel";
import { overallStatus, runChecks } from "@/lib/rules";

const TODAY = "2026-10-26";
const { bookings, warnings } = parseArrayBuffer(readFileSync("test-data/Case2_Test_Data_Planted_Errors.xlsx"));
const get = (id: string) => bookings.find((b) => b.id === id)!;

describe("test-data workbook", () => {
  it("reads all 18 bookings (17 + the template example) with no warnings", () => {
    expect(bookings).toHaveLength(18);
    expect(warnings).toEqual([]);
  });
  it.each<[string, string[], string, string | null, number | null]>([
    ["BK-001", [], "Ready to dispatch", "Carrier A", 540],
    ["T-01", [], "Ready to dispatch", "Carrier C", 660],
    ["T-02", [], "Ready to dispatch", "Carrier A", 320],
    ["T-03", ["R-01"], "Not ready to dispatch", "Carrier A", 180],
    ["T-04", ["R-02"], "Not ready to dispatch", "Carrier B", 420],
    ["T-05", [], "Ready to dispatch", "Carrier B", 420],
    ["T-06", ["R-03"], "Not ready to dispatch", "Carrier A", 180],
    ["T-07", ["R-04"], "Not ready to dispatch", "Carrier C", 320],
    ["T-08", ["R-05"], "Not ready to dispatch", "Carrier B", 440],
    ["T-09", ["R-05"], "Not ready to dispatch", null, null],
    ["T-10", ["R-06"], "Not ready to dispatch", "Carrier A", 160],
    ["T-11", [], "Ready to dispatch", "Carrier B", 220],
    ["T-12", ["R-07"], "Can dispatch after review", "Carrier A", 170],
    ["T-13", ["R-08"], "Can dispatch after review", "Carrier A", 360],
    ["T-14", ["R-09"], "Can dispatch after review", "Carrier A", 160],
    ["T-15", ["R-10"], "Can dispatch after review", "Carrier A", 170],
    ["T-16", ["R-01", "R-08", "R-09"], "Not ready to dispatch", "Carrier C", 340],
    ["T-17", [], "Ready to dispatch", "Carrier A", 160],
  ])("%s → %j, %s, %s %s", (id, rules, status, carrier, cost) => {
    const b = get(id);
    const checks = runChecks(b, TODAY);
    expect(checks.filter((c) => c.status !== "pass").map((c) => c.ruleId)).toEqual(rules);
    expect(overallStatus(checks)).toBe(status);
    const r = recommend(b.destCountry, b.pallets, b.grossWeight, b.priority);
    expect(r.recommended?.carrier ?? null).toBe(carrier);
    expect(r.totalCost).toBe(cost);
  });
});
