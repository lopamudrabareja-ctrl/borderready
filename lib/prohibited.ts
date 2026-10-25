export type ProhibitedCategory = "lithium battery" | "aerosol" | "flammable liquid";

export type Scan =
  | { kind: "prohibited"; category: ProhibitedCategory; phrase: string }
  | { kind: "ambiguous"; phrase: string }
  | { kind: "perfume-check"; phrase: string }
  | { kind: "clear" };

const LISTS: Record<ProhibitedCategory, string[]> = {
  "lithium battery": [
    "lithium battery", "lithium", "li-ion", "li-po", "lipo", "power bank", "battery pack",
    "rechargeable battery", "e-cigarette", "vape",
  ],
  aerosol: ["aerosol", "spray can", "spray paint", "deodorant spray", "hairspray", "pressurised can", "compressed gas"],
  "flammable liquid": [
    "flammable", "petrol", "gasoline", "lighter fluid", "lighter", "white spirit", "acetone",
    "nail polish", "thinner", "methylated spirits",
  ],
};

// Products that normally contain a battery or pressurised contents but are not clearly prohibited.
const AMBIGUOUS = [
  "smart watch", "smartwatch", "bluetooth", "speaker", "headphones", "earbuds", "phone", "laptop", "tablet",
  "drone", "cleaning spray", "spray", "remote control", "electric toothbrush", "e-bike", "scooter", "torch",
  "camera", "cordless", "rechargeable", "electronic",
];

const NEGATIONS = [
  "lithium-free", "lithium free", "battery-free", "battery free", "no batteries", "no battery",
  "without battery", "without batteries",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (phrase: string) => new RegExp(`(?<![a-z0-9])${esc(phrase)}(?![a-z0-9])`, "i");

function stripNegations(text: string): string {
  let t = text.toLowerCase();
  for (const n of NEGATIONS) t = t.split(n).join(" ");
  return t;
}

function firstMatch(text: string, phrases: string[]): string | null {
  // longest phrases first so "lighter fluid" is reported rather than "lighter"
  for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
    if (wholeWord(p).test(text)) return p;
  }
  return null;
}

export function scanDescription(description: string): Scan {
  const text = stripNegations(description);
  for (const [category, phrases] of Object.entries(LISTS) as [ProhibitedCategory, string[]][]) {
    const phrase = firstMatch(text, phrases);
    if (phrase) return { kind: "prohibited", category, phrase };
  }
  if (wholeWord("perfume").test(text)) {
    if (/\b(flammable|alcohol)\b/.test(text)) return { kind: "prohibited", category: "flammable liquid", phrase: "perfume (alcohol-based)" };
    return { kind: "perfume-check", phrase: "perfume" };
  }
  const amb = firstMatch(text, AMBIGUOUS);
  if (amb) return { kind: "ambiguous", phrase: amb };
  return { kind: "clear" };
}
