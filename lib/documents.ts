// Downloadable documents: a draft commercial invoice and the receiver's delivery notice, as standalone
// printable HTML files. Everything the seller typed is escaped before it goes into the file.
import { effectiveBooking } from "./booking";
import { buildNotice } from "./notice";
import type { Booking, CarrierOption } from "./types";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0b1f17; margin: 0; padding: 32px; background: #fff; }
  .doc { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0; } .muted { color: #5b6570; } .draft { display: inline-block; background: #fff4d6; color: #7a4b00; border: 1px solid #f2c94c; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0b3326; padding-bottom: 12px; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 18px; }
  .box { border: 1px solid #d9dee3; border-radius: 8px; padding: 10px 12px; } .box h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6570; }
  .fill { color: #a35a00; font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; margin-bottom: 16px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e3e7ea; vertical-align: top; } th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5b6570; background: #f4f6f5; }
  td.r, th.r { text-align: right; } tfoot td { font-weight: 700; border-top: 2px solid #0b3326; border-bottom: 0; }
  .note { font-size: 12px; color: #5b6570; border-top: 1px solid #e3e7ea; padding-top: 10px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head><body><div class="doc">${body}
<p class="noprint muted" style="margin-top:24px">Tip: use your browser's Print (Ctrl/Cmd + P) to save this as a PDF.</p>
</div></body></html>`;

export function invoiceHtml(raw: Booking, carrier: CarrierOption | null, reference: string, issued: string): string {
  const b = effectiveBooking(raw);
  const lines = b.items.map((i) => ({ ...i, total: (i.quantity ?? 0) * (i.unitPrice ?? 0) }));
  const goods = lines.reduce((t, l) => t + l.total, 0);
  const placeholder = (label: string) => `<span class="fill">[${esc(label)}]</span>`;
  const body = `
  <div class="head">
    <div><h1>Commercial invoice</h1><div class="muted">Export from the United Kingdom</div></div>
    <div style="text-align:right"><span class="draft">DRAFT: check and complete before use</span><div class="muted">Reference ${esc(reference)}<br>Prepared ${esc(dmy(issued))}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>Seller / exporter</h3>${esc(b.sellerName) || placeholder("Business name")}<br>${placeholder("Full address")}, ${esc(b.originCity ?? "")}, United Kingdom<br>EORI: ${placeholder("GB EORI number")}</div>
    <div class="box"><h3>Buyer / consignee</h3>${placeholder("Buyer name and full address")}<br>${esc(b.destCity ?? "")}, ${esc(b.destCountry ?? "")}<br>Delivery to: ${esc(b.destType ?? "—")}</div>
    <div class="box"><h3>Shipment</h3>${esc(b.originCity ?? "—")} → ${esc(b.destCity ?? "—")}, ${esc(b.destCountry ?? "—")}<br>Ready to ship: ${esc(dmy(b.readyDate))}<br>Carrier: ${carrier ? `${esc(carrier.carrier)} · ${esc(carrier.service)}` : "—"}</div>
    <div class="box"><h3>Packing</h3>${num(b.pallets)} pallets · ${num(b.cartons)} cartons<br>Gross weight: ${num(b.grossWeight)} kg<br>Terms of sale (Incoterms): ${placeholder("e.g. DAP")}</div>
  </div>
  <table>
    <thead><tr><th>SKU</th><th>Description</th><th>HS code</th><th>Origin</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Cartons</th><th class="r">Line total</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(l.sku)}</td><td>${esc(l.description)}</td><td>${esc(l.hsCode) || placeholder("HS code")}</td><td>${esc(l.countryOfOrigin) || placeholder("origin")}</td><td class="r">${num(l.quantity)}</td><td class="r">${l.unitPrice == null ? "—" : money(l.unitPrice)}</td><td class="r">${num(l.cartons)}</td><td class="r">${money(l.total)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="7">Total value of goods (GBP)</td><td class="r">${money(goods)}</td></tr></tfoot>
  </table>
  <p>Declared value on the booking: <b>${b.declaredValue == null ? "—" : money(b.declaredValue)}</b>. Currency: GBP.</p>
  <p class="note">Values are the selling price of the goods. Freight and insurance are not included and should be listed separately if charged. Draft generated by BorderReady from the booking details; the exporter is responsible for checking every entry and completing the items in brackets before the goods travel.</p>`;
  return page(`Commercial invoice ${reference}`, body);
}

export function noticeHtml(raw: Booking, carrier: CarrierOption, reference: string): string {
  const n = buildNotice({ ...raw, id: reference }, carrier);
  const body = `
  <div class="head"><div><h1>${esc(n.title)}</h1><div class="muted">${esc(n.intro)}</div></div><div class="muted" style="text-align:right">Reference ${esc(reference)}</div></div>
  ${n.appointmentWarning ? `<p class="draft">Delivery appointment not booked yet. Please arrange a delivery slot.</p>` : ""}
  <div class="grid">${n.fields.map(([k, v]) => `<div class="box"><h3>${esc(k)}</h3>${esc(v)}</div>`).join("")}</div>
  <table><thead><tr><th>SKU</th><th>Description</th><th class="r">Units</th><th class="r">Cartons</th></tr></thead>
  <tbody>${n.items.map(([s, d, u, c]) => `<tr><td>${esc(s)}</td><td>${esc(d)}</td><td class="r">${esc(u)}</td><td class="r">${esc(c)}</td></tr>`).join("")}</tbody></table>
  <p class="note">Please check the cartons and quantities against this notice on arrival and report any difference to the sender.</p>`;
  return page(`Delivery notice ${reference}`, body);
}

/** Saves an HTML string as a file in the browser. */
export function downloadHtml(filename: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
