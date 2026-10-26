"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { describeChanges } from "@/lib/chat";
import {
  emptyProfile, loadOrders, loadProfile, loadSounds, nextOrderId, saveOrders, saveProfile, saveSounds,
  type Order, type SellerProfile,
} from "@/lib/orders";
import type { Booking, CarrierOption } from "@/lib/types";

interface Store {
  ready: boolean;
  profile: SellerProfile;
  orders: Order[];
  sounds: boolean;
  setProfile: (p: SellerProfile) => void;
  setSounds: (on: boolean) => void;
  /** Save a confirmed booking. existingId re-confirms (updates) an order already saved. Returns the order number. */
  confirmOrder: (b: Booking, carrier: CarrierOption, warnings: number, existingId?: string) => string;
  updateOrder: (id: string, b: Booking, carrier: CarrierOption, warnings: number) => void;
  cancelOrder: (id: string) => void;
  orderForBooking: (bookingId: string) => Order | undefined;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const stamp = () => new Date().toISOString();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<SellerProfile>(emptyProfile);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sounds, setSoundsState] = useState(true);

  // browser storage is only readable after mount, so load it once the page is in the browser
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setProfileState(loadProfile());
    setOrders(loadOrders());
    setSoundsState(loadSounds());
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const commit = useCallback((next: Order[]) => { setOrders(next); saveOrders(next); }, []);

  const setProfile = useCallback((p: SellerProfile) => { setProfileState(p); saveProfile(p); }, []);
  const setSounds = useCallback((on: boolean) => { setSoundsState(on); saveSounds(on); }, []);

  const confirmOrder = useCallback<Store["confirmOrder"]>((b, carrier, warnings, existingId) => {
    const current = loadOrders(); // latest copy, in case another tab saved meanwhile
    const prev = existingId ? current.find((o) => o.id === existingId) : current.find((o) => o.booking.id === b.id && o.status === "confirmed");
    if (prev) {
      const changes = describeChanges(prev.booking, b);
      const updated: Order = {
        ...prev, booking: { ...b, id: prev.id }, carrier, warnings, updatedAt: stamp(),
        events: [...prev.events, { at: stamp(), text: changes.length ? `Re-confirmed with changes: ${changes.join(", ")}` : "Re-confirmed" }],
      };
      commit(current.map((o) => (o.id === prev.id ? updated : o)));
      return prev.id;
    }
    // spreadsheet bookings keep their Booking ID; chat bookings get an order number
    const id = !b.id.startsWith("CHAT-") && !current.some((o) => o.id === b.id) ? b.id : nextOrderId(current, new Date());
    const order: Order = {
      id, booking: { ...b, id }, carrier, status: "confirmed", warnings, createdAt: stamp(), updatedAt: stamp(),
      events: [{ at: stamp(), text: `Confirmed with ${carrier.carrier} (${carrier.service}) at £${carrier.cost?.toLocaleString("en-GB")}${warnings ? `, ${warnings} warning${warnings > 1 ? "s" : ""} open` : ""}` }],
    };
    commit([order, ...current]);
    if (!loadProfile().businessName && b.sellerName) setProfile({ ...loadProfile(), businessName: b.sellerName });
    return id;
  }, [commit, setProfile]);

  const updateOrder = useCallback<Store["updateOrder"]>((id, b, carrier, warnings) => {
    const current = loadOrders();
    commit(current.map((o) => {
      if (o.id !== id) return o;
      const changes = describeChanges(o.booking, b);
      const carrierNote = o.carrier.carrier !== carrier.carrier ? `carrier changed to ${carrier.carrier}` : "";
      const text = [changes.join(", "), carrierNote].filter(Boolean).join(", ") || "Saved without changes";
      return { ...o, booking: { ...b, id }, carrier, warnings, updatedAt: stamp(), events: [...o.events, { at: stamp(), text: `Edited: ${text}` }] };
    }));
  }, [commit]);

  const cancelOrder = useCallback((id: string) => {
    const current = loadOrders();
    commit(current.map((o) => (o.id === id ? { ...o, status: "cancelled" as const, updatedAt: stamp(), events: [...o.events, { at: stamp(), text: "Cancelled" }] } : o)));
  }, [commit]);

  const orderForBooking = useCallback((bookingId: string) => orders.find((o) => o.booking.id === bookingId && o.status === "confirmed"), [orders]);

  const value = useMemo(() => ({ ready, profile, orders, sounds, setProfile, setSounds, confirmOrder, updateOrder, cancelOrder, orderForBooking }),
    [ready, profile, orders, sounds, setProfile, setSounds, confirmOrder, updateOrder, cancelOrder, orderForBooking]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
