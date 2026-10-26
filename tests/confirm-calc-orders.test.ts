import { describe, expect, it } from "vitest";
import { workings } from "@/lib/calc";
import { recommend } from "@/lib/carriers";
import { confirmIntent, decide } from "@/lib/confirm";
import { canEdit, editCutoff, nextOrderId, orderState, type Order } from "@/lib/orders";
import { runChecks } from "@/lib/rules";
import { booking, item, TODAY } from "./helpers";
import type { Booking } from "@/lib/types";

const carrierFor = (b: Booking) => recommend(b.destCountry, b.pallets, b.grossWeight, b.priority).recommended;

describe("confirming", () => {
  it("blocks on must-fix, holds on warnings, confirms when clean", () => {
    const clean = booking();
    expect(decide(runChecks(clean, TODAY), carrierFor(clean)).kind).toBe("ok");
    const red = booking({ declaredValue: 4000 });
    const r = decide(runChecks(red, TODAY), carrierFor(red));
    expect(r.kind).toBe("blocked");
    expect(r.message).toContain("Declared value (R-02)");
    const amber = booking({ destType: "Warehouse", appointmentBooked: "No" });
    expect(decide(runChecks(amber, TODAY), carrierFor(amber)).kind).toBe("warn");
    expect(decide(runChecks(amber, TODAY), carrierFor(amber), true).kind).toBe("ok");
  });
  it("must-fix can't be forced", () => {
    const red = booking({ declaredValue: 4000 });
    expect(decide(runChecks(red, TODAY), carrierFor(red), true).kind).toBe("blocked");
  });
  it("understands confirm messages", () => {
    for (const t of ["confirm", "Confirm booking", "yes confirm the shipment", "confirm booking please", "book it", "Confirm."]) expect(confirmIntent(t)).toBe("confirm");
    for (const t of ["confirm anyway", "Yes, book it anyway"]) expect(confirmIntent(t)).toBe("force");
    for (const t of ["can you confirm the weight limit for carrier B?", "make it 2 pallets"]) expect(confirmIntent(t)).toBeNull();
  });
});

describe("calculator agrees with the rules engine", () => {
  const cases: [string, Booking][] = [
    ["baseline", booking()],
    ["value off", booking({ declaredValue: 4000 })],
    ["value within 1%", booking({ declaredValue: 5440 })],
    ["carton maths", booking({ items: [item({ quantity: 1000 })], declaredValue: 5000 })],
    ["carton total", booking({ cartons: 100 })],
    ["heavy", booking({ grossWeight: 1200, pallets: 2 })],
    ["too heavy for all", booking({ grossWeight: 1600, pallets: 2 })],
    ["light gross", booking({ grossWeight: 450 })],
    ["no pallets", booking({ pallets: null })],
    ["prices missing", booking({ declaredValue: null, items: [item({ quantity: null, unitPrice: null })] })],
  ];
  it.each(cases)("%s", (_, b) => {
    const checks = runChecks(b, TODAY);
    for (const w of workings(b).filter((x) => x.ruleId.startsWith("R-"))) {
      expect(w.verdict, `${w.ruleId}: ${w.result}`).toBe(checks.find((c) => c.ruleId === w.ruleId)!.status);
    }
  });
  it("shows the numbers", () => {
    const w = workings(booking());
    expect(w.find((x) => x.ruleId === "R-02")!.steps).toContain("SKU-1: 1,080 × £5 = £5,400");
    expect(w.find((x) => x.ruleId === "R-05")!.steps[0]).toBe("620 kg ÷ 3 pallets = 206.67 kg per pallet");
    expect(w.find((x) => x.ruleId === "Cost")!.result).toContain("Carrier A");
  });
});

describe("orders", () => {
  const order = (over: Partial<Order> = {}): Order => ({
    id: "SC-1", booking: booking({ readyDate: "2026-11-10" }), carrier: carrierFor(booking())!, status: "confirmed",
    warnings: 0, createdAt: "", updatedAt: "", events: [], ...over,
  });
  it("can be edited until the day before collection", () => {
    expect(editCutoff(order().booking)).toBe("2026-11-09");
    expect(canEdit(order(), "2026-11-09")).toBe(true);
    expect(canEdit(order(), "2026-11-10")).toBe(false);
    expect(orderState(order(), "2026-11-10")).toBe("locked");
    expect(orderState(order({ status: "cancelled" }), "2026-10-26")).toBe("cancelled");
  });
  it("gets a unique id", () => {
    const now = new Date("2026-10-26T10:00:00");
    expect(nextOrderId([], now)).toBe("SC-261026-001");
    expect(nextOrderId([order({ id: "SC-261026-002" })], now)).toBe("SC-261026-003");
  });
});
