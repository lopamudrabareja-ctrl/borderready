"use client";
import { ArrowLeft, Building2, History, Lock, MapPin, PackageCheck, Pencil, Save, Truck, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { editCutoff, orderState, type Order, type SellerProfile } from "@/lib/orders";
import { isBlocking } from "@/lib/rules";
import { ORIGIN_CITIES } from "@/lib/types";
import { compute, ResultView } from "./ResultView";
import { useStore } from "./store";
import { Card, fmtDate, gbp, todayISO } from "./ui";

const STATE_STYLE = {
  editable: "bg-lime-100 text-forest-800 ring-lime-200",
  locked: "bg-slate-100 text-slate-700 ring-slate-200",
  cancelled: "bg-red-50 text-red-800 ring-red-200",
} as const;

export function AccountPanel() {
  const store = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = store.orders.find((o) => o.id === openId) ?? null;

  if (!store.ready) return <p className="text-sm text-slate-600">Loading your orders…</p>;
  const today = todayISO(); // only after load, in the browser, so the edit deadlines use the real date

  if (open) {
    const state = orderState(open, today);
    return (
      <div className="space-y-4">
        <button onClick={() => { setOpenId(null); setConfirmCancel(false); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />All orders
        </button>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {confirmCancel && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">
                <span className="flex-1"><b>Cancel order {open.id}?</b> It stays in your history as cancelled.</span>
                <button onClick={() => { store.cancelOrder(open.id); setConfirmCancel(false); }} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Yes, cancel it</button>
                <button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800">Keep it</button>
              </div>
            )}
            <ResultView key={`${open.id}:${open.updatedAt}`} booking={open.booking} today={today} order={{ id: open.id, state }}
              onCancelOrder={() => setConfirmCancel(true)}
              onChange={(nb) => {
                const c = compute(nb, today);
                if (!c.selected) return; // ResultView already blocks saves that leave no usable carrier
                store.updateOrder(open.id, nb, c.selected, c.checks.filter((r) => isBlocking(r, "amber")).length);
              }} />
          </div>
          <OrderHistory order={open} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* remount when the profile changes elsewhere (e.g. the first chat booking fills in the business name) */}
      <ProfileCard key={JSON.stringify(store.profile)} profile={store.profile} orders={store.orders} onSave={store.setProfile} />
      <OrdersTable orders={store.orders} today={today} onOpen={setOpenId} />
    </div>
  );
}

/** The most frequent value in a list (ties: the most recent, since orders are newest first). */
function mostCommon(values: (string | null | undefined)[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** The seller's profile, built from what they've booked. Saved edits override the derived values. */
function ProfileCard({ profile, orders, onSave }: { profile: SellerProfile; orders: Order[]; onSave: (p: SellerProfile) => void }) {
  const live = orders.filter((o) => o.status === "confirmed");
  const derived = {
    businessName: profile.businessName || mostCommon(orders.map((o) => o.booking.sellerName)),
    defaultOrigin: profile.defaultOrigin || mostCommon(orders.map((o) => o.booking.originCity)),
  };
  const destinations = [...new Set(orders.map((o) => o.booking.destCity && `${o.booking.destCity}, ${o.booking.destCountry}`).filter(Boolean))] as string[];
  const pallets = live.reduce((t, o) => t + (o.booking.pallets ?? 0), 0);
  const spend = live.reduce((t, o) => t + (o.carrier.cost ?? 0), 0);
  const carrier = mostCommon(live.map((o) => o.carrier.carrier));
  const since = orders.length ? orders.reduce((min, o) => (o.createdAt < min ? o.createdAt : min), orders[0].createdAt).slice(0, 10) : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SellerProfile>({ ...profile, ...derived });
  const set = (k: keyof SellerProfile, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const input = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-forest-700 focus:ring-2 focus:ring-lime-400/30";
  const name = derived.businessName;

  if (!name && !orders.length && !editing) {
    return (
      <Card title="Seller profile" icon={Building2}>
        <div className="flex flex-wrap items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-slate-700">Your profile builds itself from your bookings: business name, collection city, where you ship and what you spend. Confirm a booking and it appears here.</p>
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            <Pencil className="h-3.5 w-3.5" aria-hidden />Add details now
          </button>
        </div>
      </Card>
    );
  }

  if (editing) {
    const fields: { k: keyof SellerProfile; label: string; type?: string; placeholder?: string }[] = [
      { k: "businessName", label: "Business name" },
      { k: "contactName", label: "Contact name" },
      { k: "email", label: "Email", type: "email" },
      { k: "phone", label: "Phone", type: "tel" },
      { k: "eori", label: "EORI number", placeholder: "GB…" },
    ];
    return (
      <Card title="Edit seller details" icon={Building2}>
        <form onSubmit={(e) => { e.preventDefault(); onSave(draft); setEditing(false); }} className="space-y-4">
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <label key={f.k} className="grid min-w-0 gap-1 text-xs font-medium text-slate-700">
                {f.label}
                <input id={`profile-${f.k}`} type={f.type ?? "text"} placeholder={f.placeholder} className={input} value={draft[f.k]} onChange={(e) => set(f.k, e.target.value)} />
              </label>
            ))}
            <label className="grid min-w-0 gap-1 text-xs font-medium text-slate-700">
              Usual collection city
              <select id="profile-defaultOrigin" className={input} value={draft.defaultOrigin} onChange={(e) => set("defaultOrigin", e.target.value)}>
                <option value="">Not set</option>{ORIGIN_CITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setDraft({ ...profile, ...derived }); setEditing(false); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden />Cancel</button>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800">
              <Save className="h-4 w-4 text-lime-400" aria-hidden />Save details
            </button>
          </div>
        </form>
      </Card>
    );
  }

  const contact = [profile.contactName, profile.email, profile.phone].filter(Boolean).join(" · ");
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-4 bg-forest-900 px-5 py-4 text-white">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-400 text-lg font-bold text-forest-950" aria-hidden>
          {(name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{name || "Your business"}</h2>
          <p className="truncate text-sm text-white/70">{contact || "No contact details yet"}{profile.eori ? ` · EORI ${profile.eori}` : ""}</p>
        </div>
        <button onClick={() => { setDraft({ ...profile, ...derived }); setEditing(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
          <Pencil className="h-3.5 w-3.5" aria-hidden />Edit details
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <ProfileFact icon={MapPin} label="Collects from" value={derived.defaultOrigin || "—"} />
        <ProfileFact label="Ships to" value={destinations.length ? destinations.slice(0, 3).join("; ") + (destinations.length > 3 ? ` +${destinations.length - 3}` : "") : "—"} wide />
        <ProfileFact label="Orders" value={`${live.length}${orders.length > live.length ? ` (+${orders.length - live.length} cancelled)` : ""}`} />
        <ProfileFact label="Pallets booked" value={pallets.toLocaleString("en-GB")} />
        <ProfileFact icon={Truck} label="Carrier spend" value={`${gbp(spend)}${carrier ? ` · mostly ${carrier}` : ""}`} />
      </dl>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
        Built from your bookings{since ? ` since ${fmtDate(since)}` : ""} and saved in this browser. Edit anything that&apos;s wrong or missing.
      </p>
    </section>
  );
}

function ProfileFact({ icon: Icon, label, value, wide }: { icon?: typeof MapPin; label: string; value: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="flex items-center gap-1 text-xs text-slate-600">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}{label}</dt>
      <dd className="mt-0.5 font-medium text-forest-950 tnum">{value}</dd>
    </div>
  );
}

function OrdersTable({ orders, today, onOpen }: { orders: Order[]; today: string; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "editable" | "locked" | "cancelled">("all");
  const counts = useMemo(() => orders.reduce<Record<string, number>>((a, o) => ({ ...a, [orderState(o, today)]: (a[orderState(o, today)] ?? 0) + 1 }), {}), [orders, today]);
  const spend = orders.filter((o) => o.status === "confirmed").reduce((t, o) => t + (o.carrier.cost ?? 0), 0);
  const shown = orders.filter((o) => filter === "all" || orderState(o, today) === filter);

  return (
    <Card title="Order history" icon={PackageCheck} aside={<span className="text-xs text-slate-600 tnum">{orders.length} order{orders.length === 1 ? "" : "s"} · {gbp(spend)} carrier spend</span>}>
      {!orders.length ? (
        <div className="py-8 text-center">
          <p className="font-medium text-forest-950">No orders yet</p>
          <p className="mt-1 text-sm text-slate-600">Confirm a booking in the chat, or save bookings from a spreadsheet, and they&apos;ll appear here.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter orders">
            {([["all", "All", orders.length], ["editable", "Can still edit", counts.editable ?? 0], ["locked", "Locked", counts.locked ?? 0], ["cancelled", "Cancelled", counts.cancelled ?? 0]] as const).map(([id, label, n]) => (
              <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${filter === id ? "bg-forest-900 text-white ring-forest-900" : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>
                {label} · {n}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm tnum">
              <thead className="text-[11px] uppercase tracking-wide text-slate-600">
                <tr>{["Order", "Route", "Load", "Carrier", "Ready", "Status", ""].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const state = orderState(o, today);
                  const cutoff = editCutoff(o.booking);
                  return (
                    <tr key={o.id} className="border-t border-slate-100 align-top">
                      <td className="py-2.5 pr-3"><div className="font-mono font-semibold text-forest-950">{o.id}</div><div className="text-xs text-slate-600">{fmtDate(o.createdAt.slice(0, 10))}</div></td>
                      <td className="py-2.5 pr-3">{o.booking.originCity} → {o.booking.destCity}<div className="text-xs text-slate-600">{o.booking.items.length} item{o.booking.items.length === 1 ? "" : "s"}</div></td>
                      <td className="py-2.5 pr-3">{o.booking.pallets} pallets<div className="text-xs text-slate-600">{o.booking.grossWeight} kg</div></td>
                      <td className="py-2.5 pr-3">{o.carrier.carrier}<div className="text-xs text-slate-600">{gbp(o.carrier.cost)} · {o.carrier.days} days</div></td>
                      <td className="py-2.5 pr-3">{fmtDate(o.booking.readyDate)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATE_STYLE[state]}`}>
                          {state === "locked" && <Lock className="h-3 w-3" aria-hidden />}{state === "cancelled" && <XCircle className="h-3 w-3" aria-hidden />}
                          {state === "editable" ? `Edit until ${cutoff ? fmtDate(cutoff) : "—"}` : state === "locked" ? "Locked" : "Cancelled"}
                        </span>
                        {o.warnings > 0 && o.status === "confirmed" && <div className="mt-1 text-xs font-medium text-amber-800">{o.warnings} warning{o.warnings > 1 ? "s" : ""} open</div>}
                      </td>
                      <td className="py-2.5 text-right">
                        <button onClick={() => onOpen(o.id)} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${state === "editable" ? "bg-forest-900 text-white hover:bg-forest-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}>
                          {state === "editable" ? <><Pencil className="h-3 w-3" aria-hidden />View / edit</> : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function OrderHistory({ order }: { order: Order }) {
  return (
    <Card title="History" icon={History}>
      <ol className="space-y-3 text-sm">
        {[...order.events].reverse().map((e, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime-500" aria-hidden />
            <div className="min-w-0">
              <div className="text-xs text-slate-600 tnum">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="text-slate-800">{e.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
