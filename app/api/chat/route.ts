import { emptyBooking } from "@/lib/booking";
import { emptyMeta, runTurn, type ChatMeta } from "@/lib/chat";
import { fillGaps } from "@/lib/extraction";
import { basicExtract } from "@/lib/fallback";
import { extractPatch } from "@/lib/llm";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { resolveToday } from "@/lib/today";
import type { Booking } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (rateLimited(clientIp(req), 15)) {
    return Response.json({ error: "You're sending messages quickly. Please wait a minute and try again." }, { status: 429 });
  }
  let body: { message?: unknown; booking?: Booking; meta?: ChatMeta; today?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1500) : "";
  if (!message) return Response.json({ error: "Please type a message." }, { status: 400 });
  const booking = body.booking && Array.isArray(body.booking.items) && body.booking.items.length <= 50 ? body.booking : emptyBooking();
  const meta = body.meta && typeof body.meta === "object" ? { ...emptyMeta(), ...body.meta } : emptyMeta();
  const today = resolveToday(body.today);

  let mode: "smart" | "basic" = "smart";
  let extraction;
  try {
    extraction = fillGaps(await extractPatch(message, booking, today), basicExtract(message, booking, today));
  } catch (e) {
    console.warn("LLM unavailable, using basic mode:", (e as Error).message);
    mode = "basic";
    extraction = basicExtract(message, booking, today);
  }
  try {
    const result = runTurn(booking, meta, extraction, today);
    return Response.json({ ...result, mode });
  } catch (e) {
    console.error("chat turn failed:", e);
    return Response.json({ error: "Sorry, I couldn't process that message. Try rephrasing it, or press Start over." }, { status: 500 });
  }
}
