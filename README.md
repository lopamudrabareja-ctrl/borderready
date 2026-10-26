# BorderReady

**Book it right, before it reaches the border.** Book a pallet shipment from the UK to Germany, France or the Netherlands, and catch mistakes before it leaves.
Built for the Ops Hackathon, Case 2 (Shipment Booking & Error Checker).

**Live demo:** https://borderready-app.vercel.app (public, no login).

**Code:** https://github.com/lopamudrabareja-ctrl/borderready

## What it does

- **Chat booking.** Describe a shipment in plain English. The app records what you said, asks only for what's missing (grouped, at most twice per detail), and updates the booking when you change your mind ("make it 2 pallets").
- **Excel upload.** Drop a workbook in the judges' template layout (Bookings + Items sheets). Each booking gets a card with its status, checks and carrier. **Load sample data** shows 20 bookings with planted mistakes.
- **Pre-flight checks.** The 10 fixed rules (R-01 to R-10), each with severity, the actual numbers and a fix. Status: *Not ready to dispatch* (any red), *Can dispatch after review* (amber only), *Ready to dispatch*.
- **Carrier recommendation** from the fixed rate card for the seller's priority (Cheapest, Fastest, Most reliable, Balanced). Carriers that can't take the weight per pallet are greyed out with the reason. One-click fixes for an overweight pallet: switch carrier, or add pallets.
- **Confirm booking** stays disabled while any red check fails, then shows a plain-English confirmation.
- **Must fix vs Warning.** Red checks show as "Must fix" (serious, blocks the booking), amber as "Warning" (you can still ship), each with its Red / Amber rulebook tag. Prohibited goods also get a red banner.
- **Confirm with alerts.** Confirm (button, or typing "confirm booking" in the chat) is refused with a red alert and sound while must-fix items remain; warnings play a softer chime and ask "confirm anyway?"; a clean booking confirms silently.
- **Calculator tab.** Every rule's arithmetic, step by step, with the case's fixed formulas (tests check it always agrees with the rules engine).
- **Edit anything.** An edit form for every booking and item, in the chat, for each spreadsheet booking, and for saved orders.
- **My orders.** Seller profile plus the full order history, saved in the visitor's browser. Orders can be edited or cancelled until the end of the day before collection, with a change log.
- **Receiver notice** for the receiving site, and a **route map** of the lane.

## Design principle: the AI understands, code decides

All arithmetic and every pass/fail decision is deterministic TypeScript (`lib/rules.ts`, `lib/carriers.ts`). The LLM (Google Gemini) is used for only two things:

1. Turning a chat message into a structured patch of the booking (function calling, one call per message).
2. Judging ambiguous product descriptions for R-06 (e.g. "smart watch") after a keyword fast path. One batched call per upload, cached.

The booking is one state object. Checks, carrier choice and the chat reply are all recomputed from it on every change.

If Gemini is slow, out of quota or not configured, the chat falls back to a regex extractor ("basic mode") and still works for simple messages. Unclear R-06 items are then flagged "check manually", never silently passed. Calls time out after 15 s in total.

## Run it locally

Needs Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then paste your Gemini key into .env.local
npm run dev                  # http://localhost:3000
```

Without a key the app still works, with chat in basic mode.

### Environment variables

| Name | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | for smart chat | Free key from [Google AI Studio](https://aistudio.google.com/apikey). Server-side only. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.5-flash-lite` (about 1 s per call). `gemini-3.8-flash` timed out on the free tier in testing. |

This is a demo on Gemini's free tier, so prompts may be used by Google. **Don't enter real customer data.**

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Vitest: all rules, carriers, Excel parsing, chat flow, LLM wrapper (mocked), junk-data robustness |
| `npm run build` | Production build |
| `npm run make-fixture` | Regenerates `fixtures/test_bookings.xlsx` from the template |
| `npm run play-chat` | Plays 5 scripted conversations against a running server and prints the booking after each turn |

After `make-fixture`, copy the file to `public/samples/` so **Load sample data** uses it.

## Project layout

```
data/rate_card.json        fixed carrier options
data/sample_template.xlsx  judges' template
lib/rules.ts               R-01..R-10, pure functions
lib/prohibited.ts          R-06 keyword lists and negation handling
lib/carriers.ts            feasibility filter, ranking, balanced score
lib/booking.ts             booking state, applyPatch, missing fields, summary
lib/excel.ts               SheetJS parser for the Bookings + Items sheets
lib/llm.ts                 Gemini wrapper: extractPatch, classifyProhibited, retry, timeouts
lib/fallback.ts            basic-mode regex extractor
lib/chat.ts                one chat turn: apply patch, recompute, build the reply
lib/guidance.ts            next steps and scope note (based on GOV.UK export guidance)
app/api/chat/route.ts      chat endpoint, rate limited per IP
app/api/classify/route.ts  batched R-06 classification for uploads
components/                ResultView (shared by both tabs), ChatPanel, UploadPanel
fixtures/test_bookings.xlsx  planted-error workbook
tests/                     Vitest suites
```

## Judgement calls

- **R-05 "chosen carrier".** The sheets have no carrier column, so the chosen carrier is the one the seller's priority would pick from the full route rate card. If that carrier can't take the weight per pallet, R-05 fails and offers a one-click switch to the best carrier that can, or the minimum pallets for the original choice.
- **Checks that can't run** (e.g. 0 pallets, no items) are never shown as "Ready": a red check that can't run means *Not ready*, an amber one means *Review*.
- **R-06 ambiguous items** without an LLM verdict are flagged red "check manually". A verdict that names a prohibited category counts as prohibited, even if the model's yes/no flag disagrees.
- **Perfume** passes with a note unless the description says alcohol-based or flammable.
- **Today's date** is read in the browser at run time, so R-10 uses the seller's real date.

## What this tool does not check

Whether the HS code is the *correct* one (only that it has at least 6 digits), EORI numbers, VAT, licences for controlled goods, whether the buyer can import, proof of origin, export declarations, Incoterms or dangerous-goods paperwork. See GOV.UK: [Export goods from the UK](https://www.gov.uk/export-goods).
