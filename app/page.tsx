"use client";
import { Info, MessageSquare, Sheet, Truck } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { GOV_UK_EXPORT_GUIDE, NOT_CHECKED } from "@/lib/guidance";

type Tab = "chat" | "upload";
const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Book by chat", icon: MessageSquare },
  { id: "upload", label: "Check a spreadsheet", icon: Sheet },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Truck className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">Shipment Copilot</h1>
              <div className="hidden truncate text-xs text-slate-500 sm:block">UK → Germany, France &amp; Netherlands · pallet booking and pre-flight checks</div>
            </div>
          </div>
          <div role="tablist" aria-label="Mode" className="ml-auto hidden rounded-xl bg-slate-100 p-1 md:flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabButton key={id} id={id} label={label} Icon={Icon} active={tab === id} onClick={() => setTab(id)} />
            ))}
          </div>
          <span className="ml-auto hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 lg:inline md:ml-0">
            Demo · use sample data only
          </span>
        </div>
        <div role="tablist" aria-label="Mode" className="flex gap-1 border-t border-slate-100 px-4 py-2 md:hidden">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabButton key={id} id={`${id}-m`} label={label} Icon={Icon} active={tab === id} onClick={() => setTab(id)} controls={`panel-${id}`} grow />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {/* both stay mounted so switching tabs keeps the conversation and the loaded file */}
        <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}><ChatPanel /></div>
        <div id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" hidden={tab !== "upload"}><UploadPanel /></div>
      </main>

      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-500 sm:px-6">
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
              <Info className="h-3.5 w-3.5" aria-hidden /> What this tool does not check
            </summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 pl-5 sm:grid-cols-2">{NOT_CHECKED.map((n) => <li key={n} className="list-disc">{n}</li>)}</ul>
            <p className="mt-2 pl-5">See GOV.UK: <a className="text-teal-700 underline underline-offset-2" href={GOV_UK_EXPORT_GUIDE} target="_blank" rel="noreferrer">Export goods from the UK: step by step</a>.</p>
          </details>
          <p className="mt-3">Demo for the Ops Hackathon. Don&apos;t enter real customer data. Excel files are read in your browser and never uploaded.</p>
        </div>
      </footer>
    </div>
  );
}

function TabButton({ id, label, Icon, active, onClick, controls, grow }: {
  id: string; label: string; Icon: typeof MessageSquare; active: boolean; onClick: () => void; controls?: string; grow?: boolean;
}) {
  return (
    <button id={`tab-${id}`} role="tab" aria-selected={active} aria-controls={controls ?? `panel-${id}`} onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${grow ? "flex-1" : ""} ${
        active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
      }`}>
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
