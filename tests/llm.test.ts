import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBooking } from "@/lib/booking";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; },
  FunctionCallingConfigMode: { ANY: "ANY" },
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW" },
}));

beforeEach(() => {
  vi.resetModules();
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
});

const call = (args: object) => ({ functionCalls: [{ name: "update_booking", args }] });

describe("extractPatch", () => {
  it("maps the tool call to a patch, unknowns and classifications", async () => {
    generateContent.mockResolvedValueOnce(call({
      booking: { originCity: "Manchester", destCity: "Frankfurt", pallets: null },
      items: [{ description: "Bluetooth speaker", cartons: 10, hsCode: "8518.22", dangerousGoods: { prohibited: true, category: "lithium battery", reason: "Rechargeable." } }],
      unknownFields: [{ field: "countryOfOrigin" }],
    }));
    const { extractPatch } = await import("@/lib/llm");
    const ex = await extractPatch("...", emptyBooking(), "2026-10-26");
    expect(ex.patch.booking).toEqual({ originCity: "Manchester", destCity: "Frankfurt" });
    expect(ex.patch.upsertItems![0]).toEqual({ description: "Bluetooth speaker", cartons: 10, hsCode: "851822" });
    expect(ex.classifications["bluetooth speaker"].prohibited).toBe(true);
    expect(ex.unknown).toEqual([{ field: "countryOfOrigin" }]);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("retries 429 twice, then gives up with LLMUnavailable", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("quota"), { status: 429 }));
    const { extractPatch, LLMUnavailable } = await import("@/lib/llm");
    await expect(extractPatch("x", emptyBooking(), "2026-10-26")).rejects.toBeInstanceOf(LLMUnavailable);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    const { extractPatch } = await import("@/lib/llm");
    await expect(extractPatch("x", emptyBooking(), "2026-10-26")).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("missing key is unavailable without calling the API", async () => {
    delete process.env.GEMINI_API_KEY;
    const { extractPatch, LLMUnavailable } = await import("@/lib/llm");
    await expect(extractPatch("x", emptyBooking(), "2026-10-26")).rejects.toBeInstanceOf(LLMUnavailable);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("classifyProhibited", () => {
  it("batches uncached descriptions into one call and caches results", async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify([
      { description: "smart watch", prohibited: true, category: "lithium battery", reason: "Battery." },
      { description: "cleaning spray", prohibited: false, category: "none", reason: "Pump spray." },
    ]) });
    const { classifyProhibited } = await import("@/lib/llm");
    const r = await classifyProhibited(["Smart watch", "Cleaning spray", "smart watch"]);
    expect(r["smart watch"].prohibited).toBe(true);
    expect(r["cleaning spray"].prohibited).toBe(false);
    await classifyProhibited(["Smart Watch"]);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("cleaning model output", () => {
  it("strips control codes, invented SKUs and repeated carton totals", async () => {
    generateContent.mockResolvedValueOnce(call({
      booking: { readyDate: "2026-11-10\u001b[m", cartons: 200 },
      items: [{ sku: "cotton t-shirts", description: "cotton t-shirts", cartons: 200 }],
    }));
    const { extractPatch } = await import("@/lib/llm");
    const ex = await extractPatch("200 cartons of cotton t-shirts", emptyBooking(), "2026-10-26");
    expect(ex.patch.booking).toEqual({ readyDate: "2026-11-10" });
    expect(ex.patch.upsertItems![0].sku).toBeUndefined();
  });
  it("keeps a SKU the user typed", async () => {
    generateContent.mockResolvedValueOnce(call({ items: [{ sku: "MUG-01", description: "mug" }] }));
    const { extractPatch } = await import("@/lib/llm");
    const ex = await extractPatch("SKU MUG-01 is a mug", emptyBooking(), "2026-10-26");
    expect(ex.patch.upsertItems![0].sku).toBe("MUG-01");
  });
});

describe("consistency and gap filling", () => {
  it("a prohibited category wins over prohibited:false", async () => {
    generateContent.mockResolvedValueOnce(call({
      items: [{ description: "Bluetooth speakers", dangerousGoods: { prohibited: false, category: "lithium battery", reason: "Contains a lithium battery." } }],
    }));
    const { extractPatch } = await import("@/lib/llm");
    const ex = await extractPatch("bluetooth speakers", emptyBooking(), "2026-10-26");
    expect(ex.classifications["bluetooth speakers"].prohibited).toBe(true);
  });
  it("basic extractor fills fields the LLM missed, never overrides", async () => {
    const { fillGaps } = await import("@/lib/extraction");
    const { basicExtract } = await import("@/lib/fallback");
    const b = { ...emptyBooking(), items: [{ ...emptyBooking().items[0], sku: "ITEM-1", description: "mugs", hsCode: null, quantity: null, unitPrice: null, unitsPerCarton: null, cartons: 90, unitWeight: null, countryOfOrigin: null }] };
    const msg = "1080 units, £5 each, made in China, 620 kg total";
    const llm = { patch: { booking: { grossWeight: 600 }, upsertItems: [{ sku: "ITEM-1", quantity: 1080, unitPrice: 5 }] }, unknown: [], unsupported: [], classifications: {} };
    const merged = fillGaps(llm, basicExtract(msg, b, "2026-10-26"));
    expect(merged.patch.booking!.grossWeight).toBe(600); // LLM wins
    expect(merged.patch.upsertItems![0]).toMatchObject({ sku: "ITEM-1", quantity: 1080, unitPrice: 5, countryOfOrigin: "China" });
  });
});

describe("slow Gemini", () => {
  it("after an overload, the next request skips Gemini straight away", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 503 }));
    const { extractPatch, LLMUnavailable } = await import("@/lib/llm");
    await expect(extractPatch("x", emptyBooking(), "2026-10-26")).rejects.toBeInstanceOf(LLMUnavailable);
    const calls = generateContent.mock.calls.length;
    const t = Date.now();
    await expect(extractPatch("y", emptyBooking(), "2026-10-26")).rejects.toBeInstanceOf(LLMUnavailable);
    expect(generateContent.mock.calls.length).toBe(calls); // not called again
    expect(Date.now() - t).toBeLessThan(50);
  });
});
