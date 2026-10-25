# Shipment Copilot: project spec (Case 2 hackathon)

Put this file in the project root. Claude Code reads it automatically every session.

## What we are building

A public web app (no login) for UK sellers shipping to Germany, France and the Netherlands. Two jobs:

1. Conversational booking: the seller describes a shipment in plain English, the app asks only for missing details, and updates the booking when details change.
2. Pre-flight checker: run the 10 fixed rules, say what is wrong, how serious it is and how to fix it, then recommend a carrier from the fixed rate card for the seller's priority.

Judges test it two ways: (1) a chat with no file, including changing a detail mid-conversation, and (2) uploading their own Bookings and Items sheets with planted mistakes. The link must work with no login and no help from us. Deadline: Monday 26 Oct 2026, 11:59 PM IST. Link must stay live through Wed 28 Oct.

## Non-negotiable design principle

The AI understands and explains. Code decides and calculates.

- All arithmetic and all rules R-01 to R-05 and R-07 to R-10 are deterministic TypeScript. Never ask an LLM to do maths or to decide pass/fail on those.
- The LLM is used for: (a) turning chat messages into a structured JSON patch of the booking, (b) R-06 on ambiguous descriptions (after a keyword fast path), (c) optional friendly phrasing.
- The booking is ONE state object. Every check, the carrier recommendation and the summary are pure functions of that object, recomputed on every change. Never keep numbers only in chat history.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel (public URL, no login).
- Excel parsing in the browser with SheetJS (`xlsx`). No upload to a server needed.
- Chat endpoint `app/api/chat/route.ts` calls the Google Gemini API with the official `@google/genai` SDK, using function calling (a `functionDeclarations` tool named `update_booking`) so the model returns a structured patch. Key is `GEMINI_API_KEY` (from Google AI Studio) in Vercel env vars, never in client code. Model ID comes from env var `GEMINI_MODEL`; default to `gemini-3.5-flash-lite` (free tier, ~1 s per call; `gemini-3.8-flash` timed out at 30 s on the free tier in testing on 25 Oct 2026). Do not hard-code the model name anywhere except the env default.
- The code must isolate the LLM behind one small interface (`lib/llm.ts` with `extractPatch(message, booking)` and `classifyProhibited(descriptions[])`) so the provider can be swapped without touching anything else.
- Free-tier limits are low and shared across all judges, so be frugal: one LLM call per chat turn; R-06 uses the keyword fast path first and sends only genuinely ambiguous descriptions to the LLM, all in a single batched call per upload; cache classifications by lowercase description in memory; on HTTP 429 or 5xx retry up to twice with short exponential backoff, then fall back.
- Tests with Vitest for the rules engine and carrier logic. Mock the LLM in tests.
- Rate limit the chat endpoint (simple in-memory limit per IP) because the link is public.
- If the API call fails, hits quota, or the key is missing, the chat falls back to a regex/keyword extractor and still works for simple messages, and the UI shows a small non-alarming notice ("Smart parsing is busy, using basic mode"). The Excel path never depends on the LLM except optional R-06 ambiguity checks, which fall back to "check manually" flags.
- Free-tier prompts may be used by Google to improve its products, so the app must only ever send fake or sample data, and the UI should say "Don't enter real customer data in this demo".

## Repo layout

```
/data/rate_card.json        fixed carrier options (below)
/data/sample_template.xlsx  judges' template (copy the uploaded file here)
/lib/types.ts               Booking, Item, CheckResult, CarrierOption types
/lib/rules.ts               R-01 .. R-10, pure functions
/lib/prohibited.ts          keyword lists + negation handling for R-06
/lib/carriers.ts            feasibility filter, ranking, balanced score
/lib/booking.ts             state, applyPatch, missingFields, summary
/lib/excel.ts               parse Bookings + Items sheets into Booking[]
/lib/llm.ts                 Gemini wrapper: extractPatch, classifyProhibited, retry, fallback
/app/api/chat/route.ts      LLM extraction (function calling) -> patch JSON
/app/page.tsx               UI: Chat tab and Upload tab
/components/*               BookingSummary, ChecksPanel, CarrierPanel, NextSteps
/tests/*.test.ts            rule and carrier unit tests
/fixtures/test_bookings.xlsx  planted-error workbook (generate with a script)
```

## Data (fixed, copy exactly)

Allowed values: origin country United Kingdom; origin cities London, Manchester, Birmingham, Leeds; destination Germany (Berlin, Frankfurt, Hamburg), France (Paris, Lyon), Netherlands (Amsterdam, Rotterdam); currency GBP only; destination type Warehouse or Business address; priority Cheapest, Fastest, Most reliable, Balanced; item country of origin United Kingdom, China, India, Vietnam, Turkey, Germany.

`/data/rate_card.json` (price is per pallet, GBP):

```json
[
 {"carrier":"Carrier A","service":"Road economy","dest":"Germany","price":180,"days":5,"onTime":92,"maxKgPerPallet":500},
 {"carrier":"Carrier B","service":"Road standard","dest":"Germany","price":220,"days":3,"onTime":95,"maxKgPerPallet":750},
 {"carrier":"Carrier C","service":"Road express","dest":"Germany","price":340,"days":2,"onTime":98,"maxKgPerPallet":400},
 {"carrier":"Carrier A","service":"Road economy","dest":"France","price":170,"days":5,"onTime":92,"maxKgPerPallet":500},
 {"carrier":"Carrier B","service":"Road standard","dest":"France","price":210,"days":3,"onTime":95,"maxKgPerPallet":750},
 {"carrier":"Carrier C","service":"Road express","dest":"France","price":330,"days":2,"onTime":98,"maxKgPerPallet":400},
 {"carrier":"Carrier A","service":"Road economy","dest":"Netherlands","price":160,"days":5,"onTime":92,"maxKgPerPallet":500},
 {"carrier":"Carrier B","service":"Road standard","dest":"Netherlands","price":200,"days":3,"onTime":95,"maxKgPerPallet":750},
 {"carrier":"Carrier C","service":"Road express","dest":"Netherlands","price":320,"days":2,"onTime":98,"maxKgPerPallet":400}
]
```

Excel columns, Bookings sheet (header row is row 2, example row 3, data from row 4): Booking ID, Seller name, Origin city, Origin country, Destination city, Destination country, Destination type, Ready to ship date (text DD-MM-YYYY), Seller priority, Pallets, Cartons, Total declared value, Currency, Total gross weight (kg), Delivery appointment booked (Yes/No).

Items sheet: Booking ID, SKU, Description, HS code (number, may be blank), Quantity (units), Unit price, Units per carton, Cartons, Unit weight (kg), Country of origin (may be blank).

Parser rules: find the header row by looking for "Booking ID" (do not hard-code row numbers); skip fully empty rows; keep the example row if present; coerce numbers; HS code is converted to a digit string (strip `.0`, spaces, dots); dates parsed as DD-MM-YYYY explicitly; trim text; items whose Booking ID matches no booking, and bookings with no items, produce a visible warning instead of crashing.

## The 10 rules (exact behaviour)

Severity is fixed. Every result has: ruleId, severity (red/amber), status (pass/fail/cannot-check), plain-English message with the actual numbers, and a fix.

- R-01 red: every item's HS code has at least 6 digits. Blank, non-numeric or under 6 digits fails. Say which SKU.
- R-02 red: declared value vs sum of quantity × unit price. Pass if |declared − sum| ≤ 1% of sum. Message shows both numbers and the difference.
- R-03 red: per item, unitsPerCarton × cartons must equal quantity. Show the expected quantity.
- R-04 red: booking cartons must equal the sum of item cartons.
- R-05 red: grossWeight ÷ pallets must not exceed the max kg per pallet of the chosen carrier. The chosen carrier defaults to the one the seller's priority would pick from the full route rate card. If it exceeds the limit: fail, and offer (a) one-click switch to the best feasible alternative with its cost, and (b) the minimum pallet count that makes the original choice work (`ceil(weight / max)`). If no carrier on the route can take it (over 750 kg per pallet), fail with the pallet count needed. Pallets of 0 or blank: cannot-check.
- R-06 red: no lithium batteries, aerosols or flammable liquids. See "R-06 detail".
- R-07 amber: gross weight must be at least the sum of unit weight × quantity. Show both.
- R-08 amber: Destination type Warehouse and appointment not Yes fails.
- R-09 amber: every item must have a country of origin. Blank fails. Name the SKU.
- R-10 amber: ready-to-ship date earlier than today fails. Today itself passes. Use the real current date at runtime, not a hard-coded one.

Overall booking status: any red fail = "Not ready to dispatch"; no red but amber = "Can dispatch after review"; all pass = "Ready to dispatch". Amber always stays visible.

### R-06 detail

Fast path: keyword and phrase lists, case-insensitive, whole words. Lithium/battery: lithium, li-ion, li-po, lipo, lithium battery, power bank, battery pack, rechargeable battery, e-cigarette, vape. Aerosol: aerosol, spray can, spray paint, deodorant spray, hairspray, pressurised can, compressed gas. Flammable: flammable, petrol, gasoline, lighter fluid, lighter, white spirit, acetone, nail polish, thinner, methylated spirits, perfume (flag as amber-level "check", still reported under R-06 as red only if the description also says flammable or alcohol-based).
Negation: "lithium-free", "battery-free", "no batteries", "without battery" must not trigger.
Show the matched phrase and the SKU in the message so the seller sees why it fired.
Ambiguous descriptions (a product that normally contains a battery, such as "smart watch" or "bluetooth speaker", or "cleaning spray") go to an LLM classifier returning `{prohibited: boolean, category, reason}`. If the LLM is unavailable, flag them as "check manually" (red, with a note), do not silently pass.

## Carrier recommendation

Input: destination country, pallets, gross weight, priority.

1. Filter the rate card to the route (UK → destination country).
2. Compute weight per pallet. Exclude any option where weight per pallet > maxKgPerPallet. Record the reason for each exclusion.
3. Cost = price per pallet × pallets.
4. Rank the feasible options:
   - Cheapest: lowest cost; tie-break fastest, then most reliable.
   - Fastest: fewest days; tie-break higher on-time, then cheaper.
   - Most reliable: highest on-time; tie-break fewer days, then cheaper.
   - Balanced: score = 0.4 × (minPrice / price) + 0.3 × (minDays / days) + 0.3 × (onTime / maxOnTime), computed across the feasible options; highest wins. Show the scores and the weights in the UI.
5. Output: the recommended option, the reason in one sentence, the excluded options with reasons, and total cost.
6. If none is feasible: no recommendation, and tell the seller the minimum pallets needed (`ceil(weight / 750)`).

Note the trap: Carrier C (express) has the LOWEST weight limit (400 kg), so Fastest and Most reliable fall back to Carrier B on heavy pallets.

## Conversation behaviour

- The booking state lives on the client and is sent with each chat request: `{ message, booking }`.
- The API route asks the model to call a single tool `update_booking` with a patch: booking-level fields to set, items to upsert (keyed by SKU, or by description when no SKU is given), items to remove. The model must only extract what the user actually said and never invent values. Changes ("make it 3 pallets", "actually the unit price is £6") overwrite the old value.
- After applying the patch, deterministic code computes: missing fields, all rule results, the carrier recommendation.
- The assistant's reply is built from those results: confirm what was understood, list ONLY the missing required details (grouped, not one question at a time), and when something changed, say what was recalculated (for example "Pallets are now 3, so weight per pallet is 207 kg and the weight check passes").
- Required booking fields: origin city, destination city, destination type, ready-to-ship date, priority, pallets, cartons (derivable from items), declared value (derivable from items; ask only if the user states a different total), gross weight, appointment status (only if destination is a warehouse). Required item fields: description, quantity, unit price, units per carton, cartons (derivable from quantity ÷ units per carton), unit weight, HS code, country of origin.
- If the user says they don't know HS code or origin, record it as blank, move on, and report it through R-01 or R-09 with a fix. Ask for each missing field at most twice.
- Derive instead of asking: if quantity and units per carton are given, compute cartons; if cartons and units per carton are given, compute quantity. If the user gives conflicting numbers, keep them as stated and let R-03 flag it.
- Origin must be one of the allowed UK cities and destination one of the allowed cities; if the user says something else, say what routes are supported.
- Currency is always GBP; do not ask.

## UI requirements

One page, two tabs (Chat, Upload Excel), both feeding the same result view.

- Left: chat. Right (live): booking summary (route, destination type, pallets and cartons, weight, value, date), pre-flight checks list with red/amber/green icons and fix text, carrier panel (all options for the route, excluded ones greyed with the reason, recommended one highlighted with the reason), and a "Next steps" list.
- Status banner: Not ready to dispatch / Can dispatch after review / Ready to dispatch.
- Upload tab: accepts .xlsx, shows one card per booking with status, checks and recommendation; a button to "Load sample data" so judges can try it instantly; a button to download a sample file.
- A "Confirm booking" button that is disabled with a reason while any red failure exists, and when pressed shows a plain-English confirmation (route, cartons, pallets, carrier, price, transit days, what happens next).
- Changed values should briefly highlight so judges can see recalculation happening.
- Mobile-friendly, clear typography, no login, no jargon without a tooltip (HS code, carton, pallet).
- Add a "What this tool does not check" note (HS code correctness, Incoterms, EORI, VAT, dangerous-goods paperwork) to be honest about scope.

## Export guidance (research)

`lib/guidance.ts` holds plain-English guidance from GOV.UK "Export goods from the UK: step by step" (https://www.gov.uk/export-goods): next steps (GB EORI, commercial invoice at selling price with freight/insurance listed separately, who makes the export declaration, buyer's import paperwork and proof of origin, keep records), the "What this tool does not check" list, and glossary tooltips. It is guidance only and must never change pass/fail: judges test only R-01 to R-10. Northern Ireland, postal and temporary exports are out of scope (all origin cities are in Great Britain).

## Test cases that must pass (write these as Vitest tests and as rows in fixtures/test_bookings.xlsx)

1. BK-001 baseline (from template): 1080 × £5 = 5400, 12 × 90 = 1080, 620 kg ≥ 540, 206.7 kg per pallet. Everything passes on a future date; Cheapest → Carrier A £540.
2. HS code blank, and HS code `12345` (five digits), and HS `0901210` kept with its leading zero → R-01 on the first two only.
3. Declared value 4000 vs 5400 → R-02 red. Declared 5440 (0.74% off) → pass. Declared 5500 (1.9% off) → fail.
4. Quantity 1000 with 12 × 90 → R-03 red (expected 1080).
5. Booking cartons 100 vs item sum 90 → R-04 red.
6. Gross weight 1200, pallets 2, Cheapest, Germany → 600 kg per pallet exceeds A (500) → R-05 red, switch offer to B (£440), or 3 pallets keeps A.
7. Weight per pallet 800 → no carrier feasible, minimum 2 pallets for 1,200 kg.
8. Items "Lithium power bank 10000mAh", "Hairspray aerosol 250 ml", "Lighter fluid" → R-06 red each. "Lithium-free skincare" → pass. "Ceramic mug" → pass.
9. Gross weight 450 with products at 540 → R-07 amber.
10. Warehouse with appointment No → R-08 amber; Business address with No → pass.
11. Country of origin blank → R-09 amber.
12. Ready date yesterday → R-10 amber; today → pass.
13. Priority matrix on Germany with 3 feasible: Cheapest A, Fastest C, Most reliable C, Balanced B. With weight per pallet 450: C is excluded (limit 400), so Fastest and Most reliable → B, and Cheapest stays A (limit 500). With weight per pallet 600: A and C are excluded, so every priority → B.
14. Multi-item booking with one item missing HS code and another missing origin → both reported with SKUs.
15. Chat: "90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt" → assistant asks only for the still-missing fields; then "3 pallets" → "make it 2 pallets" → weight per pallet and R-05 and the carrier panel update.
16. Excel edge cases: example row left in, HS code stored as a number with `.0`, blank HS and origin cells, an item with an unknown Booking ID, a booking with no items, extra empty rows.

## Working agreements for Claude Code

- Build the rules engine and tests first, run them, and only then build the UI.
- Keep every rule a small pure function with unit tests. After any change run `npm test`.
- Do not hard-code today's date; inject it so tests can fix it.
- Keep code simple and readable; no unnecessary dependencies.
- Never commit secrets. `.env.local` is gitignored; `.env.example` lists the variable names.
- Before finishing, run the test suite, build, and manually check the golden path in a browser: chat flow with a mid-conversation change, and the upload of `fixtures/test_bookings.xlsx`.
