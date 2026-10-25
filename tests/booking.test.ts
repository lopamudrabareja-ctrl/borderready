import { describe, expect, it } from "vitest";
import { applyPatch, emptyBooking, missingFields, summary } from "@/lib/booking";
import { recommend } from "@/lib/carriers";
import { runChecks } from "@/lib/rules";
import { TODAY } from "./helpers";

describe("15 chat state flow (deterministic part)", () => {
  const turn1 = applyPatch(emptyBooking(), {
    booking: { originCity: "Manchester", destCity: "Frankfurt", destType: "Warehouse" },
    upsertItems: [{ description: "ceramic mugs", cartons: 90 }],
  });

  it("derives country and asks only for what's missing", () => {
    expect(turn1.destCountry).toBe("Germany");
    const labels = missingFields(turn1).map((m) => m.field);
    expect(labels).toEqual(expect.arrayContaining(["readyDate", "priority", "pallets", "grossWeight", "appointmentBooked"]));
    expect(labels).not.toContain("originCity");
    expect(labels).not.toContain("destCity");
    expect(labels).not.toContain("destType");
  });

  it("changing pallets recalculates weight per pallet, R-05 and carrier", () => {
    const full = applyPatch(turn1, { booking: { grossWeight: 620, priority: "Cheapest", pallets: 3 } });
    expect(summary(full).weightPerPallet).toBe(206.7);
    const two = applyPatch(full, { booking: { pallets: 2 } });
    expect(summary(two).weightPerPallet).toBe(310);
    expect(recommend(two.destCountry, two.pallets, two.grossWeight, two.priority).totalCost).toBe(360);
    expect(runChecks(two, TODAY).find((r) => r.ruleId === "R-05")!.status).toBe("pass");
    const heavy = applyPatch(two, { booking: { grossWeight: 1200 } });
    expect(runChecks(heavy, TODAY).find((r) => r.ruleId === "R-05")!.status).toBe("fail");
  });

  it("derives cartons from quantity and units per carton, and overwrites on change", () => {
    let b = applyPatch(emptyBooking(), { upsertItems: [{ sku: "M1", description: "mug", quantity: 1080, unitsPerCarton: 12 }] });
    expect(missingFields(b).some((m) => m.field === "cartons")).toBe(false);
    expect(summary(b).cartons).toBe(90);
    b = applyPatch(b, { upsertItems: [{ sku: "M1", unitPrice: 6 }] });
    expect(b.items[0].unitPrice).toBe(6);
    expect(summary(b).declaredValue).toBe(6480);
  });

  it("unsupported city is not stored", () => {
    expect(applyPatch(emptyBooking(), { booking: { destCity: "Madrid" } }).destCity).toBeNull();
  });

  it("remove items", () => {
    const b = applyPatch(turn1, { removeItems: ["ceramic mugs"] });
    expect(b.items).toHaveLength(0);
  });
});
