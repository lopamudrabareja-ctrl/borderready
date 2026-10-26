"use client";
import { ListChecks, Mail, MessageSquare, Mic, RotateCcw, Send, Sparkles, Square, Truck, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyBooking } from "@/lib/booking";
import { emptyMeta, type ChatMeta } from "@/lib/chat";
import type { Booking } from "@/lib/types";
import { ResultView } from "./ResultView";
import { todayISO } from "./ui";

interface Msg { role: "user" | "assistant"; text: string }

// Minimal typing for the browser's built-in speech recognition (Chrome, Edge, Safari).
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const STARTERS = [
  { label: "Mugs to a Frankfurt warehouse", text: "I need to send 90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt." },
  { label: "Full booking in one go", text: "1080 ceramic mugs from Manchester to a business address in Frankfurt: 12 per carton, 90 cartons, £5 each, 0.5 kg each, made in China, HS 691200. 620 kg on 3 pallets, ready 10-11-2026, cheapest please." },
  { label: "Something that can't ship", text: "50 cartons of lithium power bank from London to a shop in Paris" },
];

const FOLLOW_UPS = ["make it 2 pallets", "actually the total weight is 1600 kg", "I don't know the HS code"];

const WELCOME: Msg = {
  role: "assistant",
  text: "Hi! Tell me about your shipment in your own words: what you're sending, where from and to, and anything else you know. I'll only ask for what's missing, and check everything as we go.",
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [booking, setBooking] = useState<Booking>(() => emptyBooking());
  const [meta, setMeta] = useState<ChatMeta>(() => emptyMeta());
  const [today, setToday] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [basic, setBasic] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<Recognition | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});
  const classifications = useMemo(() => new Map(Object.entries(meta.classifications)), [meta.classifications]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  // feature-detect after mount so the server render and the first client render match
  useEffect(() => { setVoiceOk(!!recognitionCtor()); }, []);

  const say = (text: string) => {
    if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[•→·]/g, " "));
    u.lang = "en-GB";
    window.speechSynthesis.speak(u);
  };

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
      say(data.reply);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `${(e as Error).message || "I couldn't reach the server."} Your booking so far is kept, so you can try again.` }]);
    } finally {
      setBusy(false);
      field.current?.focus();
    }
  };
  sendRef.current = send;

  const toggleMic = () => {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-GB";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setInput(finalText + interim);
    };
    r.onerror = (e) => {
      setVoiceNote(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone is blocked. Allow it in your browser's site settings, or type instead."
        : e.error === "no-speech" ? "Didn't catch that. Tap the mic and try again." : null);
    };
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) sendRef.current(finalText);
    };
    rec.current = r;
    setVoiceNote(null);
    setListening(true);
    r.start();
  };

  const reset = () => {
    rec.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setMessages([WELCOME]); setBooking(emptyBooking()); setMeta(emptyMeta()); setBasic(false); setToday(null); setInput("");
  };

  const started = messages.length > 1;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-label="Chat" className="flex h-[72vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,30,0.05)] xl:sticky xl:top-6 xl:h-[calc(100vh-9rem)]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime-100 text-forest-800"><Sparkles className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold text-forest-950">Booking assistant</div>
            <div className="text-xs text-slate-600">{basic ? "Basic mode" : voiceOk ? "Type or talk, in plain English" : "Understands plain English"}</div>
          </div>
          {voiceOk && (
            <button onClick={() => { setSpeak(!speak); if (speak) window.speechSynthesis?.cancel(); }} aria-pressed={speak}
              aria-label={speak ? "Stop reading replies aloud" : "Read replies aloud"} title={speak ? "Stop reading replies aloud" : "Read replies aloud"}
              className={`rounded-lg p-1.5 transition ${speak ? "bg-lime-100 text-forest-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              {speak ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            </button>
          )}
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
        {voiceNote && <p className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-700" role="status">{voiceNote}</p>}
        {started && !busy && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]" aria-label="Suggested replies">
            {FOLLOW_UPS.map((f) => (
              <button key={f} onClick={() => send(f)} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-lime-400 hover:text-forest-950">{f}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3">
          <div className={`flex items-end gap-2 rounded-xl border bg-white p-1.5 pl-3 focus-within:ring-2 ${listening ? "border-lime-500 ring-2 ring-lime-400/40" : "border-slate-300 focus-within:border-forest-700 focus-within:ring-lime-400/30"}`}>
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea id="chat-input" ref={field} rows={1} value={input} disabled={busy} maxLength={1500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={listening ? "Listening…" : started ? "Reply, or change any detail…" : "Describe your shipment…"}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-500" />
            {voiceOk && (
              <button type="button" onClick={toggleMic} disabled={busy} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak your message"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${listening ? "animate-pulse bg-lime-400 text-forest-950" : "text-slate-600 hover:bg-slate-100 hover:text-forest-950"}`}>
                {listening ? <Square className="h-3.5 w-3.5 fill-current" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-900 text-white transition hover:bg-forest-800 disabled:bg-slate-200 disabled:text-slate-500">
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-500">Demo: don&apos;t enter real customer data.</p>
        </form>
      </section>

      <div aria-label="Live booking">
        {started && today ? (
          <ResultView booking={booking} today={today} classifications={classifications} onChange={setBooking} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    { icon: MessageSquare, title: "Describe it", text: "Type or talk: what you're shipping, from where to where. Plain English is fine." },
    { icon: ListChecks, title: "We check 10 rules", text: "HS codes, values, cartons, pallet weight, banned goods, dates, all live." },
    { icon: Truck, title: "Pick the carrier", text: "Every option for your route, why any are ruled out, and the best fit." },
    { icon: Mail, title: "Tell the receiver", text: "A delivery notice in their language, so they know exactly what to count." },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,40,30,0.05)]">
      <div className="bg-forest-900 px-6 py-6 text-white sm:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Book a pallet shipment in a few messages</h2>
        <p className="mt-1.5 max-w-prose text-sm text-white/75">Your booking, checks and carrier build up here as you chat, and update the moment anything changes.</p>
      </div>
      <ol className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-100 text-forest-800"><Icon className="h-4 w-4" aria-hidden /></span>
              <span className="text-xs font-semibold text-slate-500 tnum">Step {i + 1}</span>
            </div>
            <div className="mt-3 text-sm font-semibold text-forest-950">{title}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
