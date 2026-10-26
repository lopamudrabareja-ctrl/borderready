// The only file that talks to an LLM. Swap providers by reimplementing extractPatch and classifyProhibited.
import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import type { BookingPatch } from "./booking";
import type { Extraction, UnknownField } from "./extraction";
import type { Classification } from "./rules";
import type { Booking, Item } from "./types";
import { DEST_TYPES, DESTINATIONS, ITEM_ORIGINS, ORIGIN_CITIES, PRIORITIES } from "./types";

export class LLMUnavailable extends Error {}

// Flash-Lite answers in ~1 s on the free tier; gemini-3.8-flash often took over 30 s, too slow for chat.
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// Extraction needs little reasoning. Lite models accept MINIMAL; larger Flash models reject it, so use LOW there.
const THINKING = () => ({ thinkingLevel: MODEL().includes("lite") ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW });

const ATTEMPT_MS = 9_000; // per request
const TOTAL_MS = 10_000; // across retries, then fall back to basic mode
const COOL_DOWN_MS = 60_000; // after Gemini times out or is overloaded, answer in basic mode straight away for a minute
let coolDownUntil = 0;
let client: GoogleGenAI | null = null;

function ai() {
  if (!process.env.GEMINI_API_KEY) throw new LLMUnavailable("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request, retried up to twice on 429/5xx/timeouts with short exponential backoff, within a hard time budget. */
async function generate(req: Omit<GenerateContentParameters, "model">) {
  if (Date.now() < coolDownUntil) throw new LLMUnavailable("Gemini cooling down after a slow or failed response");
  const deadline = Date.now() + TOTAL_MS;
  for (let attempt = 0; ; attempt++) {
    const budget = Math.min(ATTEMPT_MS, deadline - Date.now());
    try {
      return await ai().models.generateContent({
        model: MODEL(),
        ...req,
        config: { thinkingConfig: THINKING(), ...req.config, abortSignal: AbortSignal.timeout(budget) },
      });
    } catch (e) {
      if (e instanceof LLMUnavailable) throw e;
      const status = (e as { status?: number }).status ?? 0;
      const retryable = status === 429 || status >= 500 || status === 0;
      const backoff = 400 * 2 ** attempt;
      if (!retryable || attempt >= 2 || Date.now() + backoff + 1_000 > deadline) {
        if (retryable) coolDownUntil = Date.now() + COOL_DOWN_MS; // overloaded or timing out: don't make the next seller wait too
        throw new LLMUnavailable(String((e as Error).message ?? e));
      }
      await sleep(backoff);
    }
  }
}

const num = { type: "number" };
const str = { type: "string" };
const verdict = {
  type: "object",
  description: "Only for items that might be a lithium battery, aerosol or flammable liquid (e.g. smart watch, speaker, cleaning spray).",
  properties: {
    prohibited: { type: "boolean", description: "true if the product is, or normally contains, a lithium battery, an aerosol or a flammable liquid." },
    category: { type: "string", enum: ["lithium battery", "aerosol", "flammable liquid", "none"], description: "Use none when prohibited is false." },
    reason: { type: "string", description: "One short sentence." },
  },
  required: ["prohibited", "category", "reason"],
};

const UPDATE_BOOKING = {
  name: "update_booking",
  description: "Record ONLY the shipment details the user stated in their latest message. Omit anything not stated.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      booking: {
        type: "object",
        properties: {
          sellerName: str,
          originCity: { type: "string", enum: [...ORIGIN_CITIES] },
          destCity: { type: "string", enum: Object.values(DESTINATIONS).flat() },
          destType: { type: "string", enum: [...DEST_TYPES] },
          readyDate: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: [...PRIORITIES] },
          pallets: num,
          cartons: { type: "number", description: "Total cartons for the whole booking, only if the user states a booking total." },
          declaredValue: { type: "number", description: "Total declared value in GBP, only if the user states a total." },
          grossWeight: { type: "number", description: "Total gross weight of the shipment in kg." },
          appointmentBooked: { type: "string", enum: ["Yes", "No"] },
        },
      },
      items: {
        type: "array",
        description: "Items to add or update. To update an existing item, repeat its sku exactly.",
        items: {
          type: "object",
          properties: {
            sku: str, description: str,
            hsCode: { type: "string", description: "Digits only, as stated." },
            quantity: { type: "number", description: "Number of units (not cartons)." },
            unitPrice: { type: "number", description: "GBP per unit." },
            unitsPerCarton: num, cartons: num,
            unitWeight: { type: "number", description: "kg per unit." },
            countryOfOrigin: { type: "string", enum: [...ITEM_ORIGINS] },
            dangerousGoods: verdict,
          },
        },
      },
      removeItems: { type: "array", items: str, description: "SKUs of items the user wants removed." },
      unknownFields: {
        type: "array",
        description: "Fields the user said they do not know.",
        items: { type: "object", properties: { field: { type: "string", enum: ["hsCode", "countryOfOrigin"] }, sku: str }, required: ["field"] },
      },
      unsupportedPlaces: { type: "array", items: str, description: "Origin or destination places the user named that are not in the allowed lists." },
    },
  },
};

function systemPrompt(today: string) {
  return [
    "You turn a UK seller's chat message into a structured update for a pallet shipment booking.",
    "Call update_booking exactly once. Include only values the user actually said in the LATEST message; never guess or fill defaults.",
    "If the user changes a value (e.g. 'make it 2 pallets', 'actually the unit price is £6'), send the new value.",
    `Today is ${today}. Convert dates to YYYY-MM-DD.`,
    "Quantities: '90 cartons of mugs' sets the item's cartons to 90. 'units' or pieces set quantity. '12 per carton' sets unitsPerCarton.",
    "Weights: a total/gross shipment weight goes in booking.grossWeight; a weight per unit goes in the item's unitWeight.",
    "Prices: a price per unit goes in unitPrice; a total goods value goes in booking.declaredValue.",
    "If the user says they don't know an item's HS code or country of origin, add it to unknownFields.",
    "If the user names a city or country outside the allowed lists, put it in unsupportedPlaces and do not set the city.",
    "For items whose description suggests a battery, aerosol or flammable liquid, include dangerousGoods.",
  ].join("\n");
}

function compactBooking(b: Booking) {
  const { items, ...rest } = b;
  return { ...rest, items: items.map((i: Item) => ({ sku: i.sku, description: i.description })) };
}

type RawItem = Partial<Item> & { dangerousGoods?: { prohibited: boolean; category: string; reason: string } };

export async function extractPatch(message: string, booking: Booking, today: string): Promise<Extraction> {
  const res = await generate({
    contents: [{ role: "user", parts: [{ text: `Current booking (JSON):\n${JSON.stringify(compactBooking(booking))}\n\nLatest message:\n${message}` }] }],
    config: {
      systemInstruction: systemPrompt(today),
      temperature: 0,
      tools: [{ functionDeclarations: [UPDATE_BOOKING] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: ["update_booking"] } },
    },
  });
  const call = res.functionCalls?.find((c) => c.name === "update_booking");
  if (!call) throw new LLMUnavailable("model did not call update_booking");
  const args = (call.args ?? {}) as {
    booking?: BookingPatch["booking"]; items?: RawItem[]; removeItems?: string[];
    unknownFields?: UnknownField[]; unsupportedPlaces?: string[];
  };
  const classifications: Record<string, Classification> = {};
  const knownSkus = new Set(booking.items.map((i) => i.sku.toLowerCase()));
  const items = (args.items ?? []).map(clean).map(({ dangerousGoods, ...i }) => {
    // the model sometimes invents a SKU (e.g. the description); keep it only if it exists or the user typed it
    const sku = i.sku?.toLowerCase();
    if (sku && !knownSkus.has(sku) && (!message.toLowerCase().includes(sku) || sku === i.description?.toLowerCase())) delete i.sku;
    if (dangerousGoods && i.description) {
      const c = consistent(dangerousGoods);
      classifications[i.description.trim().toLowerCase()] = c;
      cache.set(i.description.trim().toLowerCase(), c);
    }
    if (i.hsCode != null) i.hsCode = String(i.hsCode).replace(/[\s.]/g, "") || null;
    return dropNulls(i);
  });
  const b = dropNulls(clean(args.booking ?? {}));
  if (b.readyDate) b.readyDate = b.readyDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? undefined;
  // a carton count repeated from an item is not a separate booking total; storing it would go stale when the item changes
  if (b.cartons != null && items.some((i) => i.cartons === b.cartons)) delete b.cartons;
  return {
    patch: { booking: dropNulls(b), upsertItems: items, removeItems: (args.removeItems ?? []).map(clean) },
    unknown: args.unknownFields ?? [],
    unsupported: args.unsupportedPlaces ?? [],
    classifications,
  };
}

/** Code decides: a verdict naming a prohibited category counts as prohibited even if the model's flag says otherwise. */
function consistent(v: { prohibited?: boolean; category?: string; reason?: string }): Classification {
  const named = ["lithium battery", "aerosol", "flammable liquid"].includes(String(v.category));
  return { prohibited: !!v.prohibited || named, category: v.category, reason: v.reason };
}

/** Strip control characters (the model has returned stray ANSI codes) from every string, recursively. */
function clean<T>(v: T): T {
  if (typeof v === "string") return v.replace(/[\u0000-\u001f\u007f]|\[[0-9;]*m/g, "").trim() as T;
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as T;
  return v;
}

function dropNulls<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")) as T;
}

/** In-memory R-06 verdicts by lowercase description, shared across requests on this server instance. */
const cache = new Map<string, Classification>();

/** One batched call for all uncached descriptions. Throws LLMUnavailable so callers fall back to "check manually". */
export async function classifyProhibited(descriptions: string[]): Promise<Record<string, Classification>> {
  const keys = [...new Set(descriptions.map((d) => d.trim().toLowerCase()))].filter(Boolean);
  const out: Record<string, Classification> = {};
  const todo = keys.filter((k) => (cache.has(k) ? ((out[k] = cache.get(k)!), false) : true));
  if (!todo.length) return out;
  const res = await generate({
    contents: [{ role: "user", parts: [{ text: `Classify each product description:\n${JSON.stringify(todo)}` }] }],
    config: {
      systemInstruction: "For each product, decide if it is, or normally contains, a lithium battery, an aerosol, or a flammable liquid (these cannot ship). Answer for every description, in order.",
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "array",
        items: { ...verdict, properties: { description: str, ...verdict.properties }, required: ["description", ...verdict.required] },
      },
    },
  });
  let parsed: ({ description: string } & Classification)[];
  try { parsed = JSON.parse(res.text ?? "[]"); } catch { throw new LLMUnavailable("unparseable classification"); }
  for (const p of parsed) {
    const k = String(p.description ?? "").trim().toLowerCase();
    if (!todo.includes(k)) continue;
    const c = consistent(p);
    cache.set(k, c);
    out[k] = c;
  }
  return out;
}
