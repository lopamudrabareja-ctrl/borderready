/** The client's local date if it sent a valid one (so R-10 matches the seller's day), else the server's. */
export function resolveToday(clientToday: unknown): string {
  if (typeof clientToday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientToday)) return clientToday;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
