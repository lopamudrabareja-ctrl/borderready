import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/carriers";
import { addDays, buildNotice, langFor } from "@/lib/notice";
import { CITIES, MAP_H, MAP_W, project } from "@/lib/geo";
import { booking } from "./helpers";

const carrier = recommend("Germany", 3, 620, "Cheapest").recommended!;

describe("delivery notice", () => {
  it("picks the destination language", () => {
    expect(langFor("Germany")).toBe("de");
    expect(langFor("France")).toBe("fr");
    expect(langFor("Netherlands")).toBe("nl");
    expect(langFor(null)).toBe("en");
  });
  it("adds transit days for the expected arrival", () => {
    expect(addDays("2026-11-10", 5)).toBe("2026-11-15");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("lists what's coming so the receiver can count it", () => {
    const n = buildNotice(booking(), carrier, "en");
    const f = Object.fromEntries(n.fields);
    expect(f["Booking reference"]).toBe("BK-001");
    expect(f["Cartons"]).toBe("90");
    expect(f["Pallets"]).toBe("3");
    expect(f["Expected arrival"]).toBe("15 November 2026");
    expect(n.items).toEqual([["SKU-1", "Ceramic mug", "1,080", "90"]]);
    expect(n.text).toContain("Carrier A");
  });
  it("is translated, with numbers in the local format", () => {
    const de = buildNotice(booking(), carrier, "de");
    expect(de.title).toBe("Lieferavis");
    expect(Object.fromEntries(de.fields)["Kartons"]).toBe("90");
    expect(de.items[0][2]).toBe("1.080");
    expect(Object.fromEntries(de.fields)["An"]).toContain("Deutschland");
    expect(buildNotice(booking(), carrier, "fr").title).toBe("Avis d'expédition");
    expect(buildNotice(booking(), carrier, "nl").fields.map(([k]) => k)).toContain("Dozen");
  });
  it("warns the receiver when a warehouse slot isn't booked", () => {
    expect(buildNotice(booking({ destType: "Warehouse", appointmentBooked: "No" }), carrier, "en").appointmentWarning).toBe(true);
    expect(buildNotice(booking({ destType: "Warehouse", appointmentBooked: "Yes" }), carrier, "en").appointmentWarning).toBe(false);
  });
});

describe("route map geometry", () => {
  it("places every city inside the map, west to east in the right order", () => {
    for (const ll of Object.values(CITIES)) {
      const [x, y] = project(ll);
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(MAP_W);
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(MAP_H);
    }
    expect(project(CITIES.Manchester)[0]).toBeLessThan(project(CITIES.Paris)[0]);
    expect(project(CITIES.Paris)[0]).toBeLessThan(project(CITIES.Berlin)[0]);
    expect(project(CITIES.Lyon)[1]).toBeGreaterThan(project(CITIES.Hamburg)[1]);
  });
});
