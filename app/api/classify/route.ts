import { classifyProhibited } from "@/lib/llm";
import { clientIp, rateLimited } from "@/lib/rateLimit";

export const maxDuration = 30;

/** Batched R-06 check for ambiguous descriptions. On any failure the client keeps the "check manually" flags. */
export async function POST(req: Request) {
  if (rateLimited(clientIp(req), 6)) return Response.json({ classifications: {}, mode: "basic" }, { status: 429 });
  let descriptions: string[] = [];
  try {
    const body = await req.json();
    descriptions = (Array.isArray(body.descriptions) ? body.descriptions : []).filter((d: unknown) => typeof d === "string").slice(0, 40).map((d: string) => d.slice(0, 200));
  } catch { return Response.json({ classifications: {}, mode: "basic" }, { status: 400 }); }
  try {
    return Response.json({ classifications: await classifyProhibited(descriptions), mode: "smart" });
  } catch (e) {
    console.warn("Classification unavailable:", (e as Error).message);
    return Response.json({ classifications: {}, mode: "basic" });
  }
}
