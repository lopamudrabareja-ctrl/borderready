"use client";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { countryForCity, emptyItem } from "@/lib/booking";
import { isBlocking, runChecks } from "@/lib/rules";
import type { Booking, Item } from "@/lib/types";
import { DEST_TYPES, DESTINATIONS, ITEM_ORIGINS, ORIGIN_CITIES, PRIORITIES } from "@/lib/types";

const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

const input = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-forest-700 focus:ring-2 focus:ring-lime-400/30";
const cell = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-forest-700 focus:ring-2 focus:ring-lime-400/30";

/** Edit every booking field and item. Checks re-run live; saving hands the new booking back. */
export function BookingEditor({ booking, today, onSave, onCancel, saveLabel = "Save changes" }: {
  booking: Booking; today: string; onSave: (b: Booking) => void; onCancel: () => void; saveLabel?: string;
}) {
  const [b, setB] = useState<Booking>(() => structuredClone(booking));
  const checks = useMemo(() => runChecks(b, today), [b, today]);
  const reds = checks.filter((r) => isBlocking(r, "red")).length;
  const ambers = checks.filter((r) => isBlocking(r, "amber")).length;

  const set = <K extends keyof Booking>(k: K, v: Booking[K]) => setB((x) => ({ ...x, [k]: v }));
  const setItem = (idx: number, patch: Partial<Item>) => setB((x) => ({ ...x, items: x.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const addItem = () => setB((x) => ({ ...x, items: [...x.items, emptyItem(`${x.id}-ITEM-${x.items.length + 1}`)] }));
  const removeItem = (idx: number) => setB((x) => ({ ...x, items: x.items.filter((_, i) => i !== idx) }));

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-slate-700">
      {label}{el}{hint && <span className="font-normal text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <section className="rounded-2xl border-2 border-forest-700/30 bg-white p-5 shadow-sm" aria-label="Edit booking">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-forest-950">Edit booking <span className="font-mono text-sm font-normal text-slate-600">{b.id}</span></h2>
        <span className="ml-auto flex gap-2 text-xs font-semibold" aria-live="polite">
          <span className={`rounded-full px-2 py-0.5 ${reds ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{reds} must fix</span>
          <span className={`rounded-full px-2 py-0.5 ${ambers ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{ambers} warning{ambers === 1 ? "" : "s"}</span>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("Seller (business) name", <input className={input} value={b.sellerName ?? ""} onChange={(e) => set("sellerName", e.target.value || null)} />)}
        {field("Origin city", (
          <select className={input} value={b.originCity ?? ""} onChange={(e) => set("originCity", e.target.value || null)}>
            <option value="">Choose…</option>{ORIGIN_CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        ))}
        {field("Destination city", (
          <select className={input} value={b.destCity ?? ""} onChange={(e) => setB((x) => ({ ...x, destCity: e.target.value || null, destCountry: countryForCity(e.target.value || null) }))}>
            <option value="">Choose…</option>
            {Object.entries(DESTINATIONS).map(([country, cities]) => (
              <optgroup key={country} label={country}>{cities.map((c) => <option key={c}>{c}</option>)}</optgroup>
            ))}
          </select>
        ))}
        {field("Destination type", (
          <select className={input} value={b.destType ?? ""} onChange={(e) => set("destType", (e.target.value || null) as Booking["destType"])}>
            <option value="">Choose…</option>{DEST_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        ))}
        {field("Delivery appointment booked", (
          <select className={input} value={b.appointmentBooked ?? ""} onChange={(e) => set("appointmentBooked", (e.target.value || null) as Booking["appointmentBooked"])}>
            <option value="">Not set</option><option>Yes</option><option>No</option>
          </select>
        ), b.destType === "Warehouse" ? "Needed for warehouse deliveries" : "Only needed for warehouses")}
        {field("Ready to ship", <input type="date" className={input} value={b.readyDate ?? ""} onChange={(e) => set("readyDate", e.target.value || null)} />)}
        {field("Priority", (
          <select className={input} value={b.priority ?? ""} onChange={(e) => set("priority", (e.target.value || null) as Booking["priority"])}>
            <option value="">Choose…</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        ))}
        {field("Pallets", <input inputMode="numeric" className={input} value={str(b.pallets)} onChange={(e) => set("pallets", num(e.target.value))} />)}
        {field("Total gross weight (kg)", <input inputMode="decimal" className={input} value={str(b.grossWeight)} onChange={(e) => set("grossWeight", num(e.target.value))} />)}
        {field("Total cartons", <input inputMode="numeric" className={input} placeholder="Leave blank to add up the items" value={str(b.cartons)} onChange={(e) => set("cartons", num(e.target.value))} />)}
        {field("Total declared value (£)", <input inputMode="decimal" className={input} placeholder="Leave blank to add up the items" value={str(b.declaredValue)} onChange={(e) => set("declaredValue", num(e.target.value))} />)}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-forest-950">Items</h3>
          <button onClick={addItem} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            <Plus className="h-3.5 w-3.5" aria-hidden />Add item
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>{["SKU", "Description", "HS code", "Qty", "Unit £", "Per carton", "Cartons", "Unit kg", "Origin", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.items.map((it, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1.5"><input aria-label="SKU" className={`${cell} font-mono`} value={it.sku} onChange={(e) => setItem(i, { sku: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Description" className={cell} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="HS code" inputMode="numeric" className={`${cell} font-mono`} value={it.hsCode ?? ""} onChange={(e) => setItem(i, { hsCode: e.target.value.replace(/[\s.]/g, "") || null })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Quantity" inputMode="numeric" className={cell} value={str(it.quantity)} onChange={(e) => setItem(i, { quantity: num(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Unit price" inputMode="decimal" className={cell} value={str(it.unitPrice)} onChange={(e) => setItem(i, { unitPrice: num(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Units per carton" inputMode="numeric" className={cell} value={str(it.unitsPerCarton)} onChange={(e) => setItem(i, { unitsPerCarton: num(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Cartons" inputMode="numeric" className={cell} value={str(it.cartons)} onChange={(e) => setItem(i, { cartons: num(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Unit weight" inputMode="decimal" className={cell} value={str(it.unitWeight)} onChange={(e) => setItem(i, { unitWeight: num(e.target.value) })} /></td>
                  <td className="px-2 py-1.5">
                    <select aria-label="Country of origin" className={cell} value={it.countryOfOrigin ?? ""} onChange={(e) => setItem(i, { countryOfOrigin: e.target.value || null })}>
                      <option value="">Not set</option>{ITEM_ORIGINS.map((c) => <option key={c}>{c}</option>)}
                      {it.countryOfOrigin && !(ITEM_ORIGINS as readonly string[]).includes(it.countryOfOrigin) && <option>{it.countryOfOrigin}</option>}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => removeItem(i)} aria-label={`Remove ${it.description || it.sku}`} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  </td>
                </tr>
              ))}
              {!b.items.length && <tr><td colSpan={10} className="px-3 py-4 text-center text-slate-600">No items yet. Add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <span className="mr-auto text-xs text-slate-600">Checks update as you type. Nothing changes until you save.</span>
        <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <X className="h-4 w-4" aria-hidden />Cancel
        </button>
        <button onClick={() => onSave(b)} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800">
          <Save className="h-4 w-4 text-lime-400" aria-hidden />{saveLabel}
        </button>
      </div>
    </section>
  );
}
