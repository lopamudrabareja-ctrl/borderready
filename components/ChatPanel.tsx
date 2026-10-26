"use client";
import { ListChecks, Mail, MessageSquare, Pencil, RotateCcw, Send, Sparkles, Truck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyBooking, missingFields } from "@/lib/booking";
import { describeChanges, emptyMeta, type ChatMeta } from "@/lib/chat";
import { confirmIntent } from "@/lib/confirm";
import { editCutoff } from "@/lib/orders";
import { isBlocking, runChecks } from "@/lib/rules";
import type { Booking } from "@/lib/types";
import { ResultView, type ResultHandle } from "./ResultView";
import { useStore } from "./store";
import { fmtDate, todayISO } from "./ui";

interface Msg { role: "user" | "assistant"; text: string }

const STARTERS = [
  { label: "Mugs to a Frankfurt warehouse", text: "I need to send 90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt." },
  { label: "Full booking in one go", text: "1080 ceramic mugs from Manchester to a business address in Frankfurt: SKU MUG-01, 12 per carton, 90 cartons, £5 each, 0.5 kg each, made in China, HS 691200. 620 kg on 3 pallets, ready 10-11-2026, cheapest please." },
  { label: "Something that can't ship", text: "50 cartons of lithium power bank from London to a shop in Paris" },
];

const WELCOME: Msg = {
  role: "assistant",
  text: "Hi! Tell me about your shipment in your own words: what you're sending, where from and to, and anything else you know. I'll only ask for what's missing, check everything as we go, and you can change any detail at any time.",
};

/** Quick replies for whatever the booking still needs, so the seller can tap instead of typing. */
function suggestions(b: Booking, meta: ChatMeta, today: string): string[] {
  const unknown = new Set(meta.unknown);
  const miss = missingFields(b).filter((m) => !unknown.has(m.sku ? `${m.sku}.${m.field}` : m.field));
  const has = (f: string) => miss.some((m) => m.field === f);
  const out: string[] = [];
  if (has("priority")) out.push("Cheapest", "Fastest", "Most reliable", "Balanced");
  else if (has("destType")) out.push("It's a warehouse", "It's a business address");
  else if (has("appointmentBooked")) out.push("Delivery appointment is booked", "No appointment booked yet");
  else if (has("readyDate")) out.push("Ready today", "Ready tomorrow");
  if (has("hsCode")) out.push("I don't know the HS code");
  if (has("countryOfOrigin")) out.push("Made in China", "Made in the UK");
  if (!miss.some((m) => !m.optional)) {
    const reds = runChecks(b, today).some((r) => isBlocking(r, "red"));
    if (!reds) out.unshift("Confirm booking");
    if (b.pallets) out.push(`Make it ${b.pallets + 1} pallets`);
  }
  return out.slice(0, 5);
}

export function ChatPanel() {
  const store = useStore();
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [booking, setBooking] = useState<Booking>(() => emptyBooking());
  const [meta, setMeta] = useState<ChatMeta>(() => emptyMeta());
  const [today, setToday] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [basic, setBasic] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const result = useRef<ResultHandle>(null);
  const classifications = useMemo(() => new Map(Object.entries(meta.classifications)), [meta.classifications]);
  const started = messages.length > 1;

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  const say = (text: string) => setMessages((m) => [...m, { role: "assistant", text }]);

  const confirmByMessage = (force: boolean) => {
    if (!started || !result.current) { say("There's nothing to confirm yet. Tell me about the shipment first."); return; }
    const d = result.current.attemptConfirm(force);
    if (d.kind !== "ok") { say(d.message); return; }
    const cutoff = editCutoff(booking);
    say(`Done! Booking ${d.orderId} is confirmed and saved to My orders.${cutoff ? ` You can still edit it until the end of ${fmtDate(cutoff)}.` : ""} The "Documents" tab has a draft commercial invoice and a delivery notice you can download and send.`);
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const now = todayISO(); // read at send time so R-10 always uses the real date
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    const intent = confirmIntent(message);
    if (intent) { setToday(today ?? now); confirmByMessage(intent === "force"); return; }
    setToday(now);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // the seller's business name comes from their profile, so the chat doesn't need to ask for it
        body: JSON.stringify({ message, booking: booking.sellerName ? booking : { ...booking, sellerName: store.profile.businessName || null }, meta, today: now }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setBooking(data.booking);
      setMeta(data.meta);
      setBasic(data.mode === "basic");
      say(data.reply);
    } catch (e) {
      say(`${(e as Error).message || "I couldn't reach the server."} Your booking so far is kept, so you can try again.`);
    } finally {
      setBusy(false);
      field.current?.focus();
    }
  };

  /** Changes made with the edit form or one-click fixes are summarised in the chat too. */
  const changeFromPanel = (nb: Booking) => {
    const changes = describeChanges(booking, nb);
    if (nb.carrierOverride && nb.carrierOverride !== booking.carrierOverride) changes.push(`carrier switched to ${nb.carrierOverride}`);
    setBooking(nb);
    if (changes.length) say(`Updated: ${changes.join(", ")}. Everything has been re-checked.`);
  };

  const reset = () => {
    setMessages([WELCOME]);
    setBooking({ ...emptyBooking(), sellerName: store.profile.businessName || null });
    setMeta(emptyMeta()); setBasic(false); setToday(null); setInput("");
  };

  const chips = started && today ? suggestions(booking, meta, today) : [];

  return (
    // before the chat starts the conversation gets most of the room; once a booking exists, the results do
    <div className={`grid grid-cols-1 items-start gap-5 ${started ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"}`}>
      <section aria-label="Chat" className="flex h-[72vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,30,0.05)] xl:sticky xl:top-6 xl:h-[calc(100vh-9rem)]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime-100 text-forest-800"><Sparkles className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold text-forest-950">Booking assistant</div>
            <div className="flex items-center gap-1 truncate text-xs text-slate-600">
              {basic ? "Basic mode" : <><UserRound className="h-3 w-3" aria-hidden />{store.profile.businessName ? `Booking as ${store.profile.businessName}` : "Plain English is fine"}</>}
            </div>
          </div>
          {started && (
            <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />Start over
            </button>
          )}
        </div>

        <div ref={log} tabIndex={0} aria-label="Conversation" className="flex-1 space-y-4 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-500" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`rise flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] whitespace-pre-line px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "rounded-2xl rounded-br-md bg-forest-900 text-white" : "rounded-2xl rounded-bl-md bg-slate-100 text-slate-800"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="typing flex w-fit gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3" aria-label="Assistant is typing">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /><span className="h-1.5 w-1.5 rounded-full bg-slate-500" /><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            </div>
          )}
          {!started && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-600">Try one of these</p>
              {STARTERS.map((s) => (
                <button key={s.label} onClick={() => send(s.text)}
                  className="group block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left transition hover:border-lime-400 hover:bg-lime-50/60">
                  <span className="block text-sm font-medium text-forest-950">{s.label}</span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-slate-600">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {basic && (
          <p className="border-t border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">Smart parsing is busy, using basic mode. Short, simple messages work best.</p>
        )}
        {chips.length > 0 && !busy && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]" aria-label="Suggested replies">
            {chips.map((f) => (
              <button key={f} onClick={() => send(f)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${f === "Confirm booking" ? "border-forest-900 bg-forest-900 text-white hover:bg-forest-800" : "border-slate-200 bg-white text-slate-700 hover:border-lime-400 hover:text-forest-950"}`}>
                {f}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3">
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 pl-3 focus-within:border-forest-700 focus-within:ring-2 focus-within:ring-lime-400/30">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea id="chat-input" ref={field} rows={1} value={input} disabled={busy} maxLength={1500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={started ? "Reply, change any detail, or say \"confirm booking\"…" : "Describe your shipment…"}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-500" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-900 text-white transition hover:bg-forest-800 disabled:bg-slate-200 disabled:text-slate-500">
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-slate-500">
            {started ? <><Pencil className="h-3 w-3" aria-hidden />Prefer a form? Use <b className="font-semibold text-slate-700">Edit details</b> on the right.</> : "Demo: don't enter real customer data."}
          </p>
        </form>
      </section>

      <div aria-label="Live booking">
        {started && today ? (
          <ResultView ref={result} booking={booking} today={today} classifications={classifications} onChange={changeFromPanel}
            onConfirmed={(b, carrier, warnings, existingId) => store.confirmOrder(b, carrier, warnings, existingId)} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    { icon: MessageSquare, title: "Describe it", text: "In plain English. Tap the quick replies to go faster." },
    { icon: ListChecks, title: "We check 10 rules", text: "Red = must fix, amber = warning, each with the fix." },
    { icon: Truck, title: "Pick the carrier", text: "The best fit for your priority, and why others are out." },
    { icon: Mail, title: "Confirm and send", text: "Download the invoice and the receiver's notice; edit in My orders." },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="bg-forest-900 px-5 py-4 text-white">
        <h2 className="text-base font-semibold tracking-tight">How it works</h2>
        <p className="mt-0.5 text-xs text-white/75">Your booking and checks appear here as you chat.</p>
      </div>
      <ol className="divide-y divide-slate-100">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3 px-5 py-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-100 text-[12px] font-bold text-forest-800 tnum" aria-hidden>{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-forest-950"><Icon className="h-3.5 w-3.5 text-forest-700" aria-hidden />{title}</div>
              <p className="text-xs leading-relaxed text-slate-600">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
