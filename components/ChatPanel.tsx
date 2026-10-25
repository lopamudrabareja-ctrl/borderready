"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyBooking } from "@/lib/booking";
import { emptyMeta, type ChatMeta } from "@/lib/chat";
import type { Booking } from "@/lib/types";
import { ResultView } from "./ResultView";
import { todayISO } from "./ui";

interface Msg { role: "user" | "assistant"; text: string }

const EXAMPLES = [
  "I need to send 90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt.",
  "1080 mugs, 12 per carton, £5 each, 0.5 kg each, made in China, HS code 691200. 620 kg on 3 pallets, ready 10-11-2026, cheapest please. Appointment is booked.",
  "Actually make it 2 pallets.",
];

const WELCOME: Msg = {
  role: "assistant",
  text: "Hi! Tell me about your shipment in your own words: what you're sending, from where to where, and anything else you know. I'll only ask for what's missing.",
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [booking, setBooking] = useState<Booking>(() => emptyBooking());
  const [meta, setMeta] = useState<ChatMeta>(() => emptyMeta());
  const [today, setToday] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [basic, setBasic] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const classifications = useMemo(() => new Map(Object.entries(meta.classifications)), [meta.classifications]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const now = todayISO(); // read at send time so R-10 always uses the real date
    setToday(now);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, booking, meta, today: now }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setBooking(data.booking);
      setMeta(data.meta);
      setBasic(data.mode === "basic");
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `${(e as Error).message || "I couldn't reach the server."} Your booking so far is kept, so you can try again.` }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setMessages([WELCOME]); setBooking(emptyBooking()); setMeta(emptyMeta()); setBasic(false); setToday(null);
  };

  const started = messages.length > 1;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-label="Chat" className="flex h-[70vh] min-h-[420px] flex-col rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-semibold text-slate-900">Booking chat</span>
          {started && <button onClick={reset} className="text-xs font-medium text-slate-500 hover:text-slate-900">Start over</button>}
        </div>
        <div ref={log} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && <div className="w-fit rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-500">Thinking…</div>}
          {!started && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-slate-500">Try an example:</p>
              {EXAMPLES.slice(0, 2).map((e) => (
                <button key={e} onClick={() => send(e)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50">{e}</button>
              ))}
            </div>
          )}
        </div>
        {basic && (
          <p className="border-t border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">Smart parsing is busy, using basic mode. Short, simple messages work best.</p>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-slate-100 p-3">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} maxLength={1500}
            placeholder="e.g. 3 pallets, 620 kg, ready 10 November"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Send</button>
        </form>
      </section>

      <div aria-label="Live booking">
        {started && today ? (
          <ResultView booking={booking} today={today} classifications={classifications} onChange={setBooking} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Your booking, checks and carrier recommendation appear here and update live as you chat.
          </div>
        )}
      </div>
    </div>
  );
}
