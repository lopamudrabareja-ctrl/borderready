// Plays scripted conversations against the chat API and prints the booking after each turn.
// Usage: npm run dev (in another terminal), then: npm run play-chat [baseUrl]
const BASE = process.argv[2] || "http://localhost:3000";

const CONVERSATIONS = {
  "a) Frankfurt mugs flow": [
    "I need to send 90 cartons of ceramic mugs from Manchester to a warehouse in Frankfurt.",
    "1080 units, 12 per carton, £5 each, 0.5 kg each, made in China, HS code 691200. 620 kg total, ready 10-11-2026, cheapest please. Appointment is booked.",
    "3 pallets",
  ],
  "b) change from 3 to 2 pallets": [
    "Sending 1080 ceramic mugs (90 cartons, 12 per carton, £5 each, 0.5 kg each, HS 691200, made in China) from Manchester to a business address in Frankfurt, 620 kg on 3 pallets, ready 10-11-2026, cheapest.",
    "make it 2 pallets",
  ],
  "c) lithium power bank": [
    "I want to ship 50 cartons of lithium power bank 10000mAh from London to Paris.",
  ],
  "d) don't know the HS code": [
    "200 cartons of cotton t-shirts from Leeds to an office in Amsterdam",
    "I don't know the HS code",
  ],
  "e) free-form change and an ambiguous item (smart mode)": [
    "Hi, Birmingham to Rotterdam, warehouse, 40 cartons of bluetooth speakers, 10 per carton, priced at £12 a piece",
    "hmm actually they're £15 each, and we haven't booked a delivery slot yet",
  ],
};

const today = new Date().toISOString().slice(0, 10);

function compact(b) {
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
  return {
    ...pick(b, ["originCity", "destCity", "destCountry", "destType", "readyDate", "priority", "pallets", "cartons", "declaredValue", "grossWeight", "appointmentBooked", "carrierOverride"]),
    items: b.items.map((i) => pick(i, ["sku", "description", "hsCode", "quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeight", "countryOfOrigin"])),
  };
}

for (const [name, turns] of Object.entries(CONVERSATIONS)) {
  console.log(`\n=== ${name} ===`);
  let booking, meta;
  for (const message of turns) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, booking, meta, today }),
    });
    const data = await res.json();
    if (!res.ok) { console.log(`  ! ${res.status}: ${data.error}`); break; }
    ({ booking, meta } = data);
    console.log(`\n> ${message}\n[${data.mode} mode]\n${data.reply.replace(/^/gm, "  ")}`);
    console.log("  booking:", JSON.stringify(compact(booking)));
  }
}
