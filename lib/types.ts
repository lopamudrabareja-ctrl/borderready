export const ORIGIN_CITIES = ["London", "Manchester", "Birmingham", "Leeds"] as const;
export const DESTINATIONS = {
  Germany: ["Berlin", "Frankfurt", "Hamburg"],
  France: ["Paris", "Lyon"],
  Netherlands: ["Amsterdam", "Rotterdam"],
} as const;
export const PRIORITIES = ["Cheapest", "Fastest", "Most reliable", "Balanced"] as const;
export const DEST_TYPES = ["Warehouse", "Business address"] as const;
export const ITEM_ORIGINS = ["United Kingdom", "China", "India", "Vietnam", "Turkey", "Germany"] as const;

export type DestCountry = keyof typeof DESTINATIONS;
export type Priority = (typeof PRIORITIES)[number];
export type DestType = (typeof DEST_TYPES)[number];

export interface Item {
  sku: string;
  description: string;
  hsCode: string | null; // digits only
  quantity: number | null;
  unitPrice: number | null;
  unitsPerCarton: number | null;
  cartons: number | null;
  unitWeight: number | null;
  countryOfOrigin: string | null;
}

export interface Booking {
  id: string;
  sellerName: string | null;
  originCity: string | null;
  originCountry: string;
  destCity: string | null;
  destCountry: DestCountry | null;
  destType: DestType | null;
  readyDate: string | null; // ISO yyyy-mm-dd
  priority: Priority | null;
  pallets: number | null;
  cartons: number | null;
  declaredValue: number | null;
  currency: string;
  grossWeight: number | null;
  appointmentBooked: "Yes" | "No" | null;
  carrierOverride?: string | null; // seller picked a carrier other than the one their priority chose
  items: Item[];
}

export type Severity = "red" | "amber";
export type Status = "pass" | "fail" | "cannot-check";

export interface CheckAction {
  kind: "switch-carrier" | "add-pallets";
  label: string;
  carrier?: string;
  pallets?: number;
}

export interface CheckResult {
  ruleId: string;
  severity: Severity;
  status: Status;
  message: string;
  fix: string;
  actions?: CheckAction[];
}

export interface RateOption {
  carrier: string;
  service: string;
  dest: string;
  price: number;
  days: number;
  onTime: number;
  maxKgPerPallet: number;
}

export interface CarrierOption extends RateOption {
  cost: number | null;
  feasible: boolean;
  excludedReason?: string;
  balancedScore?: number;
}

export interface Recommendation {
  options: CarrierOption[];
  recommended: CarrierOption | null;
  reason: string;
  totalCost: number | null;
  minPalletsNeeded: number | null;
}

export type OverallStatus = "Not ready to dispatch" | "Can dispatch after review" | "Ready to dispatch";
