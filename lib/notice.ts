// Delivery notice (advance shipping notice) for the receiver, in the destination's language.
// Fixed, hand-written translations: no AI, so the wording is predictable.
import { effectiveBooking } from "./booking";
import type { Booking, CarrierOption } from "./types";

export type Lang = "en" | "de" | "fr" | "nl";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" }, { id: "de", label: "Deutsch" }, { id: "fr", label: "Français" }, { id: "nl", label: "Nederlands" },
];

export const langFor = (country: string | null): Lang =>
  country === "Germany" ? "de" : country === "France" ? "fr" : country === "Netherlands" ? "nl" : "en";

const T = {
  en: {
    title: "Delivery notice", intro: "A shipment is on its way to you. When it arrives, please check the cartons and quantities against this notice.",
    ref: "Booking reference", from: "From", to: "To", carrier: "Carrier", collection: "Collection", eta: "Expected arrival",
    pallets: "Pallets", cartons: "Cartons", weight: "Gross weight", appointment: "Delivery appointment", booked: "Booked",
    notBooked: "Not booked yet. Please arrange a delivery slot.", notNeeded: "Not needed", contents: "Contents",
    sku: "SKU", desc: "Description", units: "Units", warehouse: "Warehouse", business: "Business address", days: "days in transit",
  },
  de: {
    title: "Lieferavis", intro: "Eine Sendung ist auf dem Weg zu Ihnen. Bitte prüfen Sie bei Ankunft Kartons und Mengen anhand dieses Avis.",
    ref: "Buchungsreferenz", from: "Von", to: "An", carrier: "Spediteur", collection: "Abholung", eta: "Voraussichtliche Ankunft",
    pallets: "Paletten", cartons: "Kartons", weight: "Bruttogewicht", appointment: "Liefertermin", booked: "Gebucht",
    notBooked: "Noch nicht gebucht. Bitte vereinbaren Sie ein Lieferzeitfenster.", notNeeded: "Nicht erforderlich", contents: "Inhalt",
    sku: "Artikelnr.", desc: "Beschreibung", units: "Stück", warehouse: "Lager", business: "Geschäftsadresse", days: "Tage Laufzeit",
  },
  fr: {
    title: "Avis d'expédition", intro: "Une expédition est en route vers vous. À la réception, veuillez vérifier les cartons et les quantités à l'aide de cet avis.",
    ref: "Référence de réservation", from: "De", to: "À", carrier: "Transporteur", collection: "Enlèvement", eta: "Arrivée prévue",
    pallets: "Palettes", cartons: "Cartons", weight: "Poids brut", appointment: "Rendez-vous de livraison", booked: "Réservé",
    notBooked: "Pas encore réservé. Merci de prévoir un créneau de livraison.", notNeeded: "Non nécessaire", contents: "Contenu",
    sku: "Réf.", desc: "Description", units: "Unités", warehouse: "Entrepôt", business: "Adresse professionnelle", days: "jours de transit",
  },
  nl: {
    title: "Vooraankondiging levering", intro: "Er is een zending onderweg naar u. Controleer bij aankomst de dozen en aantallen aan de hand van dit bericht.",
    ref: "Boekingsreferentie", from: "Van", to: "Naar", carrier: "Vervoerder", collection: "Ophalen", eta: "Verwachte aankomst",
    pallets: "Pallets", cartons: "Dozen", weight: "Brutogewicht", appointment: "Leveringsafspraak", booked: "Geboekt",
    notBooked: "Nog niet geboekt. Plan alstublieft een levertijdslot.", notNeeded: "Niet nodig", contents: "Inhoud",
    sku: "Artikelnr.", desc: "Omschrijving", units: "Stuks", warehouse: "Magazijn", business: "Zakelijk adres", days: "dagen onderweg",
  },
} satisfies Record<Lang, Record<string, string>>;

const LOCALE: Record<Lang, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR", nl: "nl-NL" };

const COUNTRY: Record<Lang, Record<string, string>> = {
  en: {},
  de: { "United Kingdom": "Vereinigtes Königreich", Germany: "Deutschland", France: "Frankreich", Netherlands: "Niederlande" },
  fr: { "United Kingdom": "Royaume-Uni", Germany: "Allemagne", France: "France", Netherlands: "Pays-Bas" },
  nl: { "United Kingdom": "Verenigd Koninkrijk", Germany: "Duitsland", France: "Frankrijk", Netherlands: "Nederland" },
};
const country = (name: string | null, lang: Lang) => (name ? COUNTRY[lang][name] ?? name : "—");

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string | null, lang: Lang) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";

export interface Notice {
  lang: Lang;
  title: string;
  intro: string;
  fields: [string, string][];
  appointmentWarning: boolean;
  itemHead: [string, string, string, string];
  items: [string, string, string, string][];
  contentsLabel: string;
  text: string; // plain text for copying into an email
}

export function buildNotice(raw: Booking, carrier: CarrierOption, lang: Lang): Notice {
  const b = effectiveBooking(raw);
  const t = T[lang];
  const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString(LOCALE[lang]));
  const eta = b.readyDate ? addDays(b.readyDate, carrier.days) : null;
  const appointment = b.destType !== "Warehouse" ? t.notNeeded : b.appointmentBooked === "Yes" ? t.booked : t.notBooked;
  const fields: [string, string][] = [
    [t.ref, b.id],
    [t.from, `${b.sellerName ? `${b.sellerName}, ` : ""}${b.originCity ?? "—"}, ${country("United Kingdom", lang)}`],
    [t.to, `${b.destType === "Warehouse" ? t.warehouse : t.business}, ${b.destCity ?? "—"}, ${country(b.destCountry, lang)}`],
    [t.carrier, `${carrier.carrier} · ${carrier.service} · ${carrier.days} ${t.days}`],
    [t.collection, fmt(b.readyDate, lang)],
    [t.eta, fmt(eta, lang)],
    [t.pallets, n(b.pallets)],
    [t.cartons, n(b.cartons)],
    [t.weight, b.grossWeight == null ? "—" : `${n(b.grossWeight)} kg`],
    [t.appointment, appointment],
  ];
  const itemHead: Notice["itemHead"] = [t.sku, t.desc, t.units, t.cartons];
  const items = b.items.map((i): [string, string, string, string] => [i.sku, i.description || "—", n(i.quantity), n(i.cartons)]);
  const text = [
    `${t.title} · ${b.id}`, "", t.intro, "",
    ...fields.map(([k, v]) => `${k}: ${v}`), "",
    `${t.contents}:`,
    ...items.map(([sku, desc, units, cartons]) => `- ${sku} · ${desc} · ${units} ${t.units.toLowerCase()} · ${cartons} ${t.cartons.toLowerCase()}`),
  ].join("\n");
  return {
    lang, title: t.title, intro: t.intro, fields, itemHead, items, text, contentsLabel: t.contents,
    appointmentWarning: b.destType === "Warehouse" && b.appointmentBooked !== "Yes",
  };
}
