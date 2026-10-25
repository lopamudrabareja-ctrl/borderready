// Generates fixtures/test_bookings.xlsx from data/sample_template.xlsx, keeping its layout
// (title row, header row, example row 3) and adding one booking per planted error from row 4.
// Run: npm run make-fixture
import XLSX from "xlsx";

type Cell = string | number | null;

const wb = XLSX.readFile("data/sample_template.xlsx");
const FUTURE = "31-12-2030";

const bookings: Cell[][] = [];
const items: Cell[][] = [];

function booking(id: string, o: Partial<Record<string, Cell>> = {}) {
  const b = {
    seller: "Planted Test Ltd", oCity: "Manchester", oCountry: "United Kingdom", dCity: "Frankfurt", dCountry: "Germany",
    dType: "Business address", date: FUTURE, prio: "Cheapest", pallets: 3, cartons: 90, value: 5400, cur: "GBP",
    weight: 620, appt: "No", ...o,
  };
  bookings.push([id, b.seller, b.oCity, b.oCountry, b.dCity, b.dCountry, b.dType, b.date, b.prio, b.pallets, b.cartons, b.value, b.cur, b.weight, b.appt]);
}

function item(id: string, sku: string, desc: string, o: Partial<Record<string, Cell>> = {}) {
  const i = { hs: 691200, qty: 1080, price: 5, upc: 12, cartons: 90, w: 0.5, origin: "China", ...o };
  items.push([id, sku, desc, i.hs, i.qty, i.price, i.upc, i.cartons, i.w, i.origin]);
}

const mug = "Ceramic mug";

// clean booking
booking("BK-CLEAN"); item("BK-CLEAN", "MUG-C", mug);

// R-01: blank HS, 5-digit HS, and 0901210 (leading zero kept, passes)
booking("BK-R01");
item("BK-R01", "HS-BLANK", mug, { hs: null, qty: 360, cartons: 30 });
item("BK-R01", "HS-SHORT", mug, { hs: 12345, qty: 360, cartons: 30 });
item("BK-R01", "HS-ZERO", "Coffee beans", { hs: "0901210", qty: 360, cartons: 30 });

booking("BK-R02", { value: 4000 }); item("BK-R02", "MUG-2", mug);
booking("BK-R02-OK", { value: 5440 }); item("BK-R02-OK", "MUG-2B", mug);
booking("BK-R02-BAD", { value: 5500 }); item("BK-R02-BAD", "MUG-2C", mug);
booking("BK-R03", { value: 5000 }); item("BK-R03", "MUG-3", mug, { qty: 1000 });
booking("BK-R04", { cartons: 100 }); item("BK-R04", "MUG-4", mug);
booking("BK-R05", { pallets: 2, weight: 1200 }); item("BK-R05", "MUG-5", mug);
booking("BK-R05-NONE", { pallets: 2, weight: 1600 }); item("BK-R05-NONE", "MUG-5B", mug);
booking("BK-R05-ZERO", { pallets: 0 }); item("BK-R05-ZERO", "MUG-5C", mug);

booking("BK-R06");
item("BK-R06", "LI-1", "Lithium power bank 10000mAh", { qty: 360, cartons: 30 });
item("BK-R06", "AE-1", "Hairspray aerosol 250 ml", { qty: 360, cartons: 30 });
item("BK-R06", "LF-1", "Lighter fluid", { qty: 360, cartons: 30 });
booking("BK-R06-OK");
item("BK-R06-OK", "SK-1", "Lithium-free skincare", { qty: 540, cartons: 45 });
item("BK-R06-OK", "MUG-6", mug, { qty: 540, cartons: 45 });

booking("BK-R07", { weight: 450 }); item("BK-R07", "MUG-7", mug);
booking("BK-R08", { dType: "Warehouse", appt: "No" }); item("BK-R08", "MUG-8", mug);
booking("BK-R08-OK", { dType: "Business address", appt: "No" }); item("BK-R08-OK", "MUG-8B", mug);
booking("BK-R09"); item("BK-R09", "MUG-9", mug, { origin: null });
booking("BK-R10", { date: "01-01-2020" }); item("BK-R10", "MUG-10", mug);

// multi-item: one item missing HS code, another missing origin
booking("BK-MULTI");
item("BK-MULTI", "M-A", mug, { qty: 360, cartons: 30, hs: null });
item("BK-MULTI", "M-B", mug, { qty: 360, cartons: 30, origin: null });
item("BK-MULTI", "M-C", mug, { qty: 360, cartons: 30 });

bookings.push([], []); items.push([]); // stray empty rows
// edge cases: HS stored as text "691200.0", and a booking with no items
booking("BK-EDGE-HS"); item("BK-EDGE-HS", "MUG-E", mug, { hs: "691200.0" });
booking("BK-NOITEMS");
item("BK-GHOST", "GHOST-1", mug); // unknown booking ID

function fill(sheetName: string, rows: Cell[][]) {
  const ws = wb.Sheets[sheetName];
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: "A4" });
  // keep the used range as wide as the template's
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: rows[0].length - 1 } });
}

fill("Bookings", bookings);
fill("Items", items);
XLSX.writeFile(wb, "fixtures/test_bookings.xlsx");
console.log(`Wrote fixtures/test_bookings.xlsx: ${bookings.filter((r) => r.length).length} bookings, ${items.filter((r) => r.length).length} items (plus the template example row).`);
