// Saved orders and the seller profile. Stored in the browser (localStorage) so the public demo needs no
// login and each visitor only sees their own data. The pure helpers below hold all the order logic.
import { addDays } from "./notice";
import type { Booking, CarrierOption } from "./types";

export interface SellerProfile {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  eori: string;
  defaultOrigin: string;
}

export const emptyProfile = (): SellerProfile => ({ businessName: "", contactName: "", email: "", phone: "", eori: "", defaultOrigin: "" });

export interface OrderEvent { at: string; text: string }

export interface Order {
  id: string;
  booking: Booking;
  carrier: CarrierOption;
  status: "confirmed" | "cancelled";
  warnings: number; // open "warning" checks when last saved
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
}

/** Changes are allowed up to the end of the day before collection. */
export const editCutoff = (b: Booking): string | null => (b.readyDate ? addDays(b.readyDate, -1) : null);

export function canEdit(o: Order, today: string): boolean {
  if (o.status !== "confirmed") return false;
  const cutoff = editCutoff(o.booking);
  return cutoff == null || today <= cutoff;
}

export function orderState(o: Order, today: string): "editable" | "locked" | "cancelled" {
  if (o.status === "cancelled") return "cancelled";
  return canEdit(o, today) ? "editable" : "locked";
}

export function nextOrderId(existing: Order[], now: Date): string {
  const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let n = existing.length + 1;
  while (existing.some((o) => o.id === `SC-${ymd}-${String(n).padStart(3, "0")}`)) n++;
  return `SC-${ymd}-${String(n).padStart(3, "0")}`;
}

const PROFILE_KEY = "shipment-copilot.profile.v1";
const ORDERS_KEY = "shipment-copilot.orders.v1";
const SOUND_KEY = "shipment-copilot.sounds.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: keep working in memory */ }
}

export const loadProfile = () => ({ ...emptyProfile(), ...read<Partial<SellerProfile>>(PROFILE_KEY, {}) });
export const saveProfile = (p: SellerProfile) => write(PROFILE_KEY, p);
export const loadOrders = () => read<Order[]>(ORDERS_KEY, []);
export const saveOrders = (o: Order[]) => write(ORDERS_KEY, o);
export const loadSounds = () => read<boolean>(SOUND_KEY, true);
export const saveSounds = (on: boolean) => write(SOUND_KEY, on);
