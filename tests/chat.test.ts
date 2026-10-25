import { describe, expect, it } from "vitest";
import { emptyBooking, summary } from "@/lib/booking";
import { emptyMeta, runTurn, type TurnResult } from "@/lib/chat";
import { basicExtract, parseLooseDate } from "@/lib/fallback";
import { runChecks } from "@/lib/rules";
import { TODAY } from "./helpers";

/** Plays messages through the basic extractor, like the route does when the LLM is down. */
function play(...messages: string[]): TurnResult[] {
  let state: TurnResult = { booking: emptyBooking(), meta: emptyMeta(), reply: "" };
  const out: TurnResult[] = [];
  for (const m of messages) {
    state = runTurn(state.booking, state.meta, basicExtract(m, state.booking, TODAY), TODAY);
    out.push(state);
  }
  return out;
}

const FIRST = "I need to send 90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt.";
const DETAILS = "1080 units, 12 per carton, £5 each, 0.5 kg each, made in China, HS code 691200. 620 kg total, ready 10-11-2026, cheapest please. Appointment is booked.";

describe("15 chat flow in basic mode", () => {
  it("first message: understood fields, asks only for what's missing", () => {
    const [t1] = play(FIRST);
    expect(t1.booking.originCity).toBe("Manchester");
    expect(t1.booking.destCity).toBe("Frankfurt");
    expect(t1.booking.destType).toBe("Warehouse");
    expect(t1.booking.items[0]).toMatchObject({ description: "ceramic mugs", cartons: 90 });
    expect(t1.reply).toContain("To finish the booking I still need");
    expect(t1.reply).toMatch(/number of pallets/);
    expect(t1.reply).toMatch(/delivery appointment/);
    expect(t1.reply).not.toMatch(/origin city/);
    expect(t1.reply).not.toMatch(/destination city/);
    expect(t1.reply).not.toMatch(/destination type/);
  });

  it("3 pallets then 2 pallets recalculates weight per pallet, R-05 and carrier", () => {
    const [, t2, t3, t4] = play(FIRST, DETAILS, "3 pallets", "make it 2 pallets");
    expect(t2.booking.items[0]).toMatchObject({ quantity: 1080, unitsPerCarton: 12, unitPrice: 5, unitWeight: 0.5, hsCode: "691200", countryOfOrigin: "China" });
    expect(t2.booking.grossWeight).toBe(620);
    expect(t2.booking.appointmentBooked).toBe("Yes");
    expect(summary(t3.booking).weightPerPallet).toBe(206.7);
    expect(t3.reply).toContain("That's everything");
    expect(t4.booking.pallets).toBe(2);
    expect(t4.reply).toContain("Pallets are now 2, so weight per pallet is 310 kg");
    expect(t4.reply).toContain("R-05");
    expect(t4.reply).toContain("Carrier A at £360");
    expect(runChecks(t4.booking, TODAY).every((r) => r.status === "pass")).toBe(true);
  });

  it("heavy change makes R-05 fail and offers a fix", () => {
    const [, , , t4] = play(FIRST, DETAILS, "3 pallets", "actually it's 1200 kg on 2 pallets");
    expect(t4.reply).toContain("weight check (R-05) now fails");
    expect(t4.reply).toContain("Carrier B");
  });

  it("lithium power bank triggers R-06", () => {
    const [t1] = play("Sending 50 cartons of lithium power bank from London to Paris");
    expect(t1.reply).toContain("R-06");
    expect(t1.reply).toContain("lithium");
  });

  it("don't know the HS code: recorded blank, not asked again, flagged by R-01", () => {
    const [t1, t2] = play(FIRST, "I don't know the HS code");
    expect(t1.reply).toContain("HS code");
    expect(t2.reply).toContain("left the HS code blank");
    expect(t2.reply).not.toMatch(/ceramic mugs: HS code/);
    expect(runChecks(t2.booking, TODAY).find((r) => r.ruleId === "R-01")!.status).toBe("fail");
  });

  it("asks for each missing field at most twice", () => {
    const [t1, t2, t3] = play(FIRST, "hello", "hello again");
    expect(t1.reply).toMatch(/number of pallets/);
    expect(t2.reply).toMatch(/number of pallets/);
    expect(t3.reply).not.toMatch(/number of pallets/);
  });

  it("unsupported destination explains the routes", () => {
    const [t1] = play("10 cartons of soap from Leeds to Madrid");
    expect(t1.booking.destCity).toBeNull();
    expect(t1.reply).toContain("can't book Madrid");
    expect(t1.reply).toContain("Rotterdam");
  });

  it("unit price change overwrites", () => {
    const [, t2, t3] = play(FIRST, DETAILS, "actually the unit price is £6 each");
    expect(t2.booking.items[0].unitPrice).toBe(5);
    expect(t3.booking.items[0].unitPrice).toBe(6);
    expect(t3.reply).toContain("£6 each");
  });
});

describe("runTurn with an LLM-style extraction", () => {
  it("uses classifications for ambiguous items", () => {
    const ex = {
      patch: { booking: {}, upsertItems: [{ sku: "W1", description: "Smart watch", quantity: 10 }] },
      unknown: [], unsupported: [],
      classifications: { "smart watch": { prohibited: true, category: "lithium battery", reason: "Contains a lithium battery." } },
    };
    const t = runTurn(emptyBooking(), emptyMeta(), ex, TODAY);
    expect(t.meta.classifications["smart watch"].prohibited).toBe(true);
    expect(t.reply).toContain("R-06");
    expect(t.reply).toContain("lithium battery");
  });
});

describe("parseLooseDate", () => {
  it.each([
    ["ready 10-11-2026", "2026-11-10"], ["10/11/2026", "2026-11-10"], ["2026-11-10", "2026-11-10"],
    ["today", TODAY], ["tomorrow", "2026-10-27"], ["5 November", "2026-11-05"], ["3rd Jan", "2027-01-03"],
  ])("%s", (text, expected) => expect(parseLooseDate(text, TODAY)).toBe(expected));
});
