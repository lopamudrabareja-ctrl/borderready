"use client";
import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { GOV_UK_EXPORT_GUIDE, NOT_CHECKED } from "@/lib/guidance";

type Tab = "chat" | "upload";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Shipment Copilot</h1>
        <p className="mt-1 text-slate-600">Book a pallet shipment from the UK to Germany, France or the Netherlands, and catch mistakes before it leaves.</p>
        <p className="mt-2 inline-block rounded-md bg-slate-200/70 px-2 py-1 text-xs text-slate-700">Demo: don&apos;t enter real customer data.</p>
      </header>

      <main>
      <div role="tablist" aria-label="Mode" className="mb-4 inline-flex rounded-lg bg-slate-200/70 p-1">
        {([["chat", "Chat"], ["upload", "Upload Excel"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* both stay mounted so switching tabs keeps the conversation and the loaded file */}
      <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}><ChatPanel /></div>
      <div id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" hidden={tab !== "upload"}><UploadPanel /></div>
      </main>

      <footer className="mt-10 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">What this tool does not check</h2>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">{NOT_CHECKED.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="mt-2">See GOV.UK: <a className="text-sky-700 underline" href={GOV_UK_EXPORT_GUIDE} target="_blank" rel="noreferrer">Export goods from the UK: step by step</a>.</p>
      </footer>
    </div>
  );
}
