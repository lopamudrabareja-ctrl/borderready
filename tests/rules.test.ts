import { describe, expect, it } from "vitest";
import { overallStatus, runChecks } from "@/lib/rules";
import { booking, item, FUTURE, TODAY } from "./helpers";
import type { Booking } from "@/lib/types";

const check = (b: Booking, id: string, cls = new Map()) => runChecks(b, TODAY, cls).find((r) => r.ruleId === id)!;

describe("1 baseline", () => {
  it("everything passes", () => {
    const res = runChecks(booking(), TODAY);
    expect(res.filter((r) => r.status !== "pass")).toEqual([]);
    expect(overallStatus(res)).toBe("Ready to dispatch");
  });
});

describe("2 R-01 HS code", () => {
  it("blank and 5 digits fail, leading zero kept passes", () => {
    const b = booking({ items: [
      item({ sku: "A", hsCode: null }), item({ sku: "B", hsCode: "12345" }), item({ sku: "C", hsCode: "0901210" }),
    ] });
    const r = check(b, "R-01");
    expect(r.status).toBe("fail");
    expect(r.message).toContain("A");
    expect(r.message).toContain("B");
    expect(r.message).not.toContain("C (");
  });
});

describe("3 R-02 declared value", () => {
  it.each([[4000, "fail"], [5440, "pass"], [5500, "fail"]])("declared %s -> %s", (v, s) => {
    expect(check(booking({ declaredValue: v }), "R-02").status).toBe(s);
  });
  it("shows both numbers", () => {
    const m = check(booking({ declaredValue: 4000 }), "R-02").message;
    expect(m).toContain("4,000");
    expect(m).toContain("5,400");
  });
});

describe("4 R-03 carton maths", () => {
  it("quantity 1000 with 12 x 90 fails, expected 1080", () => {
    const r = check(booking({ items: [item({ quantity: 1000 })] }), "R-03");
    expect(r.status).toBe("fail");
    expect(r.message).toContain("1080");
  });
});

describe("5 R-04 cartons total", () => {
  it("100 vs 90 fails", () => expect(check(booking({ cartons: 100 }), "R-04").status).toBe("fail"));
});

describe("6 R-05 pallet weight", () => {
  it("1200 kg on 2 pallets, Cheapest, Germany", () => {
    const r = check(booking({ grossWeight: 1200, pallets: 2, declaredValue: 5400 }), "R-05");
    expect(r.status).toBe("fail");
    const sw = r.actions!.find((a) => a.kind === "switch-carrier")!;
    expect(sw.carrier).toBe("Carrier B");
    expect(sw.label).toContain("£440");
    expect(r.actions!.find((a) => a.kind === "add-pallets")!.pallets).toBe(3);
  });
  it("800 kg per pallet: nobody can take it, 2 pallets for 1200 kg", () => {
    const r = check(booking({ grossWeight: 1600, pallets: 2 }), "R-05");
    expect(r.status).toBe("fail");
    const r2 = check(booking({ grossWeight: 1200, pallets: 1 }), "R-05");
    expect(r2.actions![0].pallets).toBe(2);
    expect(r2.fix).toContain("2 pallets");
  });
  it("pallets 0 cannot check", () => expect(check(booking({ pallets: 0 }), "R-05").status).toBe("cannot-check"));
  it("pallets null cannot check", () => expect(check(booking({ pallets: null }), "R-05").status).toBe("cannot-check"));
});

describe("8 R-06 prohibited goods", () => {
  const desc = (d: string) => check(booking({ items: [item({ description: d })] }), "R-06");
  it.each(["Lithium power bank 10000mAh", "Hairspray aerosol 250 ml", "Lighter fluid"])("%s fails", (d) => {
    expect(desc(d).status).toBe("fail");
  });
  it.each(["Lithium-free skincare", "Ceramic mug", "Battery-free toy", "Soap, no batteries needed"])("%s passes", (d) => {
    expect(desc(d).status).toBe("pass");
  });
  it("names the matched phrase and SKU", () => {
    const m = desc("Lighter fluid").message;
    expect(m).toContain("lighter fluid");
    expect(m).toContain("SKU-1");
  });
  it("ambiguous without LLM is flagged for manual check", () => {
    const r = desc("Smart watch");
    expect(r.status).toBe("fail");
    expect(r.message).toContain("check manually");
  });
  it("ambiguous with LLM verdict", () => {
    const ok = new Map([["smart watch", { prohibited: false }]]);
    const bad = new Map([["smart watch", { prohibited: true, category: "lithium battery", reason: "contains a battery" }]]);
    expect(check(booking({ items: [item({ description: "Smart watch" })] }), "R-06", ok).status).toBe("pass");
    expect(check(booking({ items: [item({ description: "Smart watch" })] }), "R-06", bad).status).toBe("fail");
  });
  it("perfume alone is a note, alcohol-based perfume fails", () => {
    expect(desc("Perfume 50ml").status).toBe("pass");
    expect(desc("Alcohol-based perfume 50ml").status).toBe("fail");
  });
});

describe("9 R-07 weight", () => {
  it("450 kg vs 540 kg products is amber", () => {
    const r = check(booking({ grossWeight: 450 }), "R-07");
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("amber");
  });
});

describe("10 R-08 appointment", () => {
  it("warehouse + No fails; business + No passes", () => {
    expect(check(booking({ destType: "Warehouse", appointmentBooked: "No" }), "R-08").status).toBe("fail");
    expect(check(booking({ destType: "Warehouse", appointmentBooked: "Yes" }), "R-08").status).toBe("pass");
    expect(check(booking({ destType: "Business address", appointmentBooked: "No" }), "R-08").status).toBe("pass");
  });
});

describe("11 R-09 origin", () => {
  it("blank origin fails naming SKU", () => {
    const r = check(booking({ items: [item({ sku: "Z9", countryOfOrigin: null })] }), "R-09");
    expect(r.status).toBe("fail");
    expect(r.message).toContain("Z9");
  });
});

describe("12 R-10 date", () => {
  it("yesterday fails, today passes", () => {
    expect(check(booking({ readyDate: "2026-10-25" }), "R-10").status).toBe("fail");
    expect(check(booking({ readyDate: TODAY }), "R-10").status).toBe("pass");
    expect(check(booking({ readyDate: FUTURE }), "R-10").status).toBe("pass");
  });
});

describe("14 multi-item", () => {
  it("reports both SKUs", () => {
    const b = booking({ items: [
      item({ sku: "S1", hsCode: null, quantity: 540, cartons: 45, unitPrice: 5 }),
      item({ sku: "S2", countryOfOrigin: null, quantity: 540, cartons: 45, unitPrice: 5 }),
    ] });
    expect(check(b, "R-01").message).toContain("S1");
    expect(check(b, "R-09").message).toContain("S2");
    expect(overallStatus(runChecks(b, TODAY))).toBe("Not ready to dispatch");
  });
});

describe("overall status", () => {
  it("amber only is review", () => {
    expect(overallStatus(runChecks(booking({ grossWeight: 560, destType: "Warehouse", appointmentBooked: "No" }), TODAY))).toBe("Can dispatch after review");
  });
});

describe("R-05 one-click switch", () => {
  it("switching to the offered carrier makes R-05 pass", () => {
    const heavy = booking({ grossWeight: 1200, pallets: 2 });
    expect(check(heavy, "R-05").status).toBe("fail");
    expect(check({ ...heavy, carrierOverride: "Carrier B" }, "R-05").status).toBe("pass");
  });
});

describe("R-02 with prices not given yet", () => {
  it("is cannot-check, not a £0 = £0 pass", () => {
    const r = check(booking({ declaredValue: null, items: [item({ quantity: null, unitPrice: null })] }), "R-02");
    expect(r.status).toBe("cannot-check");
    expect(r.message).not.toContain("£0");
  });
});
