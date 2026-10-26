"use client";
import { Bell, BellOff, Info, MessageSquare, PackageCheck, Sheet, Truck } from "lucide-react";
import { useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { StoreProvider, useStore } from "@/components/store";
import { UploadPanel } from "@/components/UploadPanel";
import { GOV_UK_EXPORT_GUIDE, NOT_CHECKED } from "@/lib/guidance";

type Tab = "chat" | "upload" | "orders";
const TABS: { id: Tab; label: string; short: string; sub: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Book a shipment", short: "Book", sub: "Describe it in plain English; we check it as you go.", icon: MessageSquare },
  { id: "upload", label: "Check a spreadsheet", short: "Spreadsheet", sub: "Upload many bookings at once; fix, pick a carrier and confirm each one.", icon: Sheet },
  { id: "orders", label: "My orders", short: "Orders", sub: "Your seller profile and every confirmed order. Edit until the day before collection.", icon: PackageCheck },
];

export default function Home() {
  return <StoreProvider><Shell /></StoreProvider>;
}

function Shell() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("chat");
  const active = TABS.find((t) => t.id === tab)!;
  const editable = store.orders.filter((o) => o.status === "confirmed").length;
  return (
    <div className="flex min-h-full flex-1">
      {/* sidebar: laptops and up */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-forest-900 px-4 py-5 text-white lg:flex">
        <Brand />
        <nav role="tablist" aria-label="Pages" className="mt-8 space-y-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/60">Menu</p>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                tab === id ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white"
              }`}>
              {tab === id && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-lime-400" aria-hidden />}
              <Icon className={`h-[18px] w-[18px] ${tab === id ? "text-lime-400" : ""}`} aria-hidden />
              {label}
              {id === "orders" && editable > 0 && <span className="ml-auto rounded-full bg-lime-400 px-1.5 text-[11px] font-bold text-forest-950 tnum">{editable}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <button onClick={() => store.setSounds(!store.sounds)} aria-pressed={store.sounds}
            className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-xs text-white/85 hover:bg-white/10">
            {store.sounds ? <Bell className="h-4 w-4 text-lime-400" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            <span className="flex-1">Alert sounds</span>
            <span className="font-semibold">{store.sounds ? "On" : "Off"}</span>
          </button>
          <div className="rounded-xl border border-dashed border-lime-400/40 bg-white/5 p-3 text-xs leading-relaxed text-white/80">
            <p className="font-semibold text-lime-300">Demo</p>
            <p className="mt-1">Use sample data only. Your profile and orders are saved in this browser; spreadsheets are never uploaded.</p>
          </div>
          <a href="#scope" className="flex items-center gap-2 px-1 text-xs text-white/70 hover:text-white">
            <Info className="h-3.5 w-3.5" aria-hidden /> What this tool doesn&apos;t check
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar: phones and tablets */}
        <header className="sticky top-0 z-40 bg-forest-900 px-4 pb-3 pt-3 text-white lg:hidden">
          <div className="flex items-center justify-between">
            <Brand compact />
            <button onClick={() => store.setSounds(!store.sounds)} aria-pressed={store.sounds} aria-label={store.sounds ? "Turn alert sounds off" : "Turn alert sounds on"} className="rounded-lg p-2 hover:bg-white/10">
              {store.sounds ? <Bell className="h-4 w-4 text-lime-400" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <div role="tablist" aria-label="Pages" className="mt-3 flex gap-1 rounded-full bg-white/10 p-1">
            {TABS.map(({ id, short, icon: Icon }) => (
              <button key={id} id={`tab-${id}-m`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition ${
                  tab === id ? "bg-lime-400 text-forest-950" : "text-white/80"
                }`}>
                <Icon className="h-4 w-4" aria-hidden />{short}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold tracking-tight text-forest-950">{active.label}</h2>
            <p className="mt-0.5 text-sm text-slate-600">{active.sub}</p>
          </div>
          {/* all stay mounted so switching keeps the conversation and the loaded file */}
          <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}><ChatPanel /></div>
          <div id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" hidden={tab !== "upload"}><UploadPanel /></div>
          <div id="panel-orders" role="tabpanel" aria-labelledby="tab-orders" hidden={tab !== "orders"}><AccountPanel /></div>
        </main>

        <footer id="scope" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-[1320px] px-4 py-5 text-xs text-slate-600 sm:px-6 lg:px-8">
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-800 hover:text-slate-950">
                <Info className="h-3.5 w-3.5" aria-hidden /> What this tool does not check
              </summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 pl-5 sm:grid-cols-2">{NOT_CHECKED.map((n) => <li key={n} className="list-disc">{n}</li>)}</ul>
              <p className="mt-2 pl-5">See GOV.UK: <a className="font-medium text-forest-700 underline underline-offset-2" href={GOV_UK_EXPORT_GUIDE} target="_blank" rel="noreferrer">Export goods from the UK: step by step</a>.</p>
            </details>
            <p className="mt-3">Demo for the Ops Hackathon. Don&apos;t enter real customer data.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-400 text-forest-950">
        <Truck className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 leading-tight">
        <h1 className="text-[15px] font-semibold tracking-tight">BorderReady</h1>
        {!compact && <p className="text-xs text-white/65">UK → DE · FR · NL pallets</p>}
      </div>
    </div>
  );
}
