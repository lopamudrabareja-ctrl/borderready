import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/carriers";

const pick = (kg: number, pallets: number, p: Parameters<typeof recommend>[3]) =>
  recommend("Germany", pallets, kg, p).recommended?.carrier;

describe("1 baseline", () => {
  it("Cheapest -> Carrier A £540", () => {
    const r = recommend("Germany", 3, 620, "Cheapest");
    expect(r.recommended?.carrier).toBe("Carrier A");
    expect(r.totalCost).toBe(540);
  });
});

describe("13 priority matrix on Germany", () => {
  it("3 feasible", () => {
    expect(pick(300, 1, "Cheapest")).toBe("Carrier A");
    expect(pick(300, 1, "Fastest")).toBe("Carrier C");
    expect(pick(300, 1, "Most reliable")).toBe("Carrier C");
    expect(pick(300, 1, "Balanced")).toBe("Carrier B");
  });
  it("450 per pallet excludes C", () => {
    expect(pick(450, 1, "Cheapest")).toBe("Carrier A");
    expect(pick(450, 1, "Fastest")).toBe("Carrier B");
    expect(pick(450, 1, "Most reliable")).toBe("Carrier B");
    expect(pick(450, 1, "Balanced")).toBe("Carrier B");
    const c = recommend("Germany", 1, 450, "Fastest").options.find((o) => o.carrier === "Carrier C")!;
    expect(c.feasible).toBe(false);
    expect(c.excludedReason).toContain("400");
  });
  it("600 per pallet leaves only B", () => {
    for (const p of ["Cheapest", "Fastest", "Most reliable", "Balanced"] as const) expect(pick(600, 1, p)).toBe("Carrier B");
  });
});

describe("7 nothing feasible", () => {
  it("800 per pallet -> no recommendation, min pallets", () => {
    const r = recommend("Germany", 1, 800, "Cheapest");
    expect(r.recommended).toBeNull();
    expect(r.minPalletsNeeded).toBe(2);
    expect(recommend("Germany", 1, 1200, "Cheapest").minPalletsNeeded).toBe(2);
  });
});

describe("balanced score", () => {
  it("is exposed on feasible options with the 0.4/0.3/0.3 weights", () => {
    const r = recommend("Germany", 1, 300, "Balanced");
    const b = r.options.find((o) => o.carrier === "Carrier B")!;
    // 0.4*(180/220) + 0.3*(2/3) + 0.3*(95/98)
    expect(b.balancedScore).toBeCloseTo(0.4 * (180 / 220) + 0.3 * (2 / 3) + 0.3 * (95 / 98), 3);
  });
  it("other routes use their own prices", () => {
    expect(recommend("Netherlands", 2, 300, "Cheapest").totalCost).toBe(320);
  });
});
