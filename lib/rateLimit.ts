// Simple in-memory sliding-window limit per IP. Resets when the server instance restarts; good enough for a public demo.
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return recent.length > limit;
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
