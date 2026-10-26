import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/carriers";
import { invoiceHtml, noticeHtml } from "@/lib/documents";
import { booking, item } from "./helpers";

const carrier = recommend("Germany", 3, 620, "Cheapest").recommended!;

describe("downloadable documents", () => {
  it("draft invoice lists every item with its line total and the goods total", () => {
    const html = invoiceHtml(booking({ items: [item({ sku: "A1", quantity: 100, unitPrice: 2.5 }), item({ sku: "B2", quantity: 10, unitPrice: 12 })] }), carrier, "SC-1", "2026-10-26");
    expect(html).toContain("Commercial invoice");
    expect(html).toContain("DRAFT");
    expect(html).toContain("£250.00");
    expect(html).toContain("£120.00");
    expect(html).toContain("£370.00");
    expect(html).toContain("691200");
    expect(html).toContain("[GB EORI number]");
  });
  it("escapes anything typed by the seller", () => {
    const html = invoiceHtml(booking({ sellerName: "<script>x</script>", items: [item({ description: "<img onerror=1>" })] }), carrier, "SC-1", "2026-10-26");
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;");
  });
  it("delivery notice file carries the order reference and contents", () => {
    const html = noticeHtml(booking(), carrier, "SC-261026-001");
    expect(html).toContain("SC-261026-001");
    expect(html).toContain("Delivery notice");
    expect(html).toContain("Ceramic mug");
  });
});
