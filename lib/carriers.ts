import rateCard from "@/data/rate_card.json";
import type { CarrierOption, Priority, RateOption, Recommendation } from "./types";

export const BALANCED_WEIGHTS = { price: 0.4, days: 0.3, reliability: 0.3 };
export const MAX_KG_ANY_CARRIER = 750;

export function routeOptions(destCountry: string): RateOption[] {
  return (rateCard as RateOption[]).filter((r) => r.dest === destCountry);
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

export function recommend(
  destCountry: string | null,
  pallets: number | null,
  grossWeight: number | null,
  priority: Priority | null,
): Recommendation {
  const empty: Recommendation = { options: [], recommended: null, reason: "", totalCost: null, minPalletsNeeded: null };
  if (!destCountry) return { ...empty, reason: "Choose a destination to see carrier options." };
  const route = routeOptions(destCountry);
  if (!pallets || pallets <= 0 || grossWeight == null) {
    return {
      ...empty,
      options: route.map((r) => ({ ...r, cost: null, feasible: true })),
      reason: "Add pallets and gross weight to get a recommendation.",
    };
  }
  const perPallet = grossWeight / pallets;
  const options: CarrierOption[] = route.map((r) => {
    const feasible = perPallet <= r.maxKgPerPallet;
    return {
      ...r,
      cost: r.price * pallets,
      feasible,
      excludedReason: feasible
        ? undefined
        : `${round(perPallet, 1)} kg per pallet is over ${r.carrier}'s limit of ${r.maxKgPerPallet} kg`,
    };
  });
  const ok = options.filter((o) => o.feasible);
  if (ok.length === 0) {
    const need = Math.ceil(grossWeight / MAX_KG_ANY_CARRIER);
    return {
      options,
      recommended: null,
      reason: `No carrier on this route can take ${round(perPallet, 1)} kg per pallet. You need at least ${need} pallets for ${grossWeight} kg.`,
      totalCost: null,
      minPalletsNeeded: need,
    };
  }
  const minPrice = Math.min(...ok.map((o) => o.price));
  const minDays = Math.min(...ok.map((o) => o.days));
  const maxOnTime = Math.max(...ok.map((o) => o.onTime));
  for (const o of ok) {
    o.balancedScore = round(
      BALANCED_WEIGHTS.price * (minPrice / o.price) +
        BALANCED_WEIGHTS.days * (minDays / o.days) +
        BALANCED_WEIGHTS.reliability * (o.onTime / maxOnTime),
    );
  }
  const p = priority ?? "Balanced";
  const cmp: Record<Priority, (a: CarrierOption, b: CarrierOption) => number> = {
    Cheapest: (a, b) => a.price - b.price || a.days - b.days || b.onTime - a.onTime,
    Fastest: (a, b) => a.days - b.days || b.onTime - a.onTime || a.price - b.price,
    "Most reliable": (a, b) => b.onTime - a.onTime || a.days - b.days || a.price - b.price,
    Balanced: (a, b) => (b.balancedScore ?? 0) - (a.balancedScore ?? 0) || a.price - b.price,
  };
  const best = [...ok].sort(cmp[p])[0];
  const why: Record<Priority, string> = {
    Cheapest: `lowest price (£${best.price} per pallet)`,
    Fastest: `fastest option (${best.days} days)`,
    "Most reliable": `best on-time record (${best.onTime}%)`,
    Balanced: `best balanced score (${best.balancedScore})`,
  };
  const excluded = options.length - ok.length;
  return {
    options,
    recommended: best,
    reason: `${best.carrier} (${best.service}) is the ${why[p]} for "${p}"${excluded ? `; ${excluded} option(s) can't take the weight per pallet` : ""}.`,
    totalCost: best.cost,
    minPalletsNeeded: null,
  };
}
