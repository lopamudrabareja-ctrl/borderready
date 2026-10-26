"use client";
import { Info, LayoutList, MessageSquare, Truck } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { GOV_UK_EXPORT_GUIDE, NOT_CHECKED } from "@/lib/guidance";

type Tab = "chat" | "upload";
const TABS: { id: Tab; label: string; sub: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Book a shipment", sub: "Describe it in plain English; we check it as you go.", icon: MessageSquare },
  { id: "upload", label: "All bookings", sub: "Upload a spreadsheet and check every booking at once.", icon: LayoutList },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  const active = TABS.find((t) => t.id === tab)!;
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
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-dashed border-lime-400/40 bg-white/5 p-3 text-xs leading-relaxed text-white/80">
            <p className="font-semibold text-lime-300">Demo</p>
            <p className="mt-1">Use sample data only. Spreadsheets are read in your browser and never uploaded.</p>
          </div>
          <a href="#scope" className="flex items-center gap-2 px-1 text-xs text-white/70 hover:text-white">
            <Info className="h-3.5 w-3.5" aria-hidden /> What this tool doesn&apos;t check
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar: phones and tablets */}
        <header className="sticky top-0 z-40 bg-forest-900 px-4 pb-3 pt-3 text-white lg:hidden">
          <Brand compact />
          <div role="tablist" aria-label="Pages" className="mt-3 flex gap-1 rounded-full bg-white/10 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} id={`tab-${id}-m`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  tab === id ? "bg-lime-400 text-forest-950" : "text-white/80"
                }`}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold tracking-tight text-forest-950">{active.label}</h2>
            <p className="mt-0.5 text-sm text-slate-600">{active.sub}</p>
          </div>
          {/* both stay mounted so switching keeps the conversation and the loaded file */}
          <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}><ChatPanel /></div>
          <div id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" hidden={tab !== "upload"}><UploadPanel /></div>
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
        <h1 className="text-[15px] font-semibold tracking-tight">Shipment Copilot</h1>
        {!compact && <p className="text-xs text-white/65">UK → DE · FR · NL pallets</p>}
      </div>
    </div>
  );
}
