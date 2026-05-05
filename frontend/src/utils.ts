import type { PolymarketEvent, PolymarketMarket } from "./types";

export function num(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value: number | string | null | undefined): string {
  const n = num(value);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = date.getTime() - Date.now();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return `closing soon`;
  if (days === 1) return `closes in 1 day`;
  if (days < 14) return `closes in ${days} days`;
  if (days < 60) return `closes in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `closes in ${Math.round(days / 30)} months`;
  return `closes in ${Math.round(days / 365)} years`;
}

export function parseOutcomes(market: PolymarketMarket): { name: string; price: number }[] {
  if (!market.outcomes || !market.outcomePrices) return [];
  try {
    const names = JSON.parse(market.outcomes) as string[];
    const prices = JSON.parse(market.outcomePrices) as string[];
    return names.map((name, i) => ({ name, price: Number(prices[i] ?? "0") || 0 }));
  } catch {
    return [];
  }
}

/** Pick a representative top outcome for an event (highest priced "Yes" or top market). */
export function topOutcome(event: PolymarketEvent): { question: string; outcome: string; price: number } | null {
  let best: { question: string; outcome: string; price: number } | null = null;
  for (const market of event.markets ?? []) {
    const outcomes = parseOutcomes(market);
    if (!outcomes.length) continue;
    const top = outcomes.reduce((a, b) => (b.price > a.price ? b : a));
    if (!best || top.price > best.price) {
      best = {
        question: market.question ?? event.title,
        outcome: top.name,
        price: top.price,
      };
    }
  }
  return best;
}

/** Build the canonical Polymarket event URL. */
export function eventUrl(event: PolymarketEvent): string {
  return `https://polymarket.com/event/${event.slug}`;
}

/** Map an event to a category color used for its planet glow. */
export function categoryColor(event: PolymarketEvent): { hex: string; key: string; label: string } {
  const tagSlugs = new Set((event.tags ?? []).map((t) => (t.slug ?? "").toLowerCase()));
  const tagLabels = (event.tags ?? []).map((t) => (t.label ?? "").toLowerCase());

  const has = (...needles: string[]) =>
    needles.some((n) => tagSlugs.has(n) || tagLabels.some((l) => l.includes(n)));

  if (has("crypto", "bitcoin", "ethereum")) return { hex: "#f7a83e", key: "crypto", label: "Crypto" };
  if (has("politics", "elections", "trump", "us-presidential-election", "global-elections")) {
    return { hex: "#ff7d9b", key: "politics", label: "Politics" };
  }
  if (has("sports", "nba", "nfl", "soccer", "mma", "ufc", "tennis")) {
    return { hex: "#6cf2ff", key: "sports", label: "Sports" };
  }
  if (has("geopolitics", "world", "middle-east", "ukraine", "iran")) {
    return { hex: "#b388ff", key: "geo", label: "Geopolitics" };
  }
  if (has("tech", "ai", "artificial-intelligence")) return { hex: "#7d8bff", key: "tech", label: "Tech" };
  if (has("culture", "entertainment", "movies", "music", "tv")) {
    return { hex: "#ff7df0", key: "culture", label: "Culture" };
  }
  if (has("science", "space", "weather", "climate")) return { hex: "#9eff8a", key: "science", label: "Science" };
  if (has("games", "esports")) return { hex: "#ffd779", key: "games", label: "Games" };
  return { hex: "#8aa0ff", key: "other", label: "Other" };
}

export const CATEGORY_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "politics", label: "Politics" },
  { key: "crypto", label: "Crypto" },
  { key: "sports", label: "Sports" },
  { key: "geo", label: "Geopolitics" },
  { key: "tech", label: "Tech" },
  { key: "culture", label: "Culture" },
  { key: "games", label: "Games" },
  { key: "science", label: "Science" },
];

/** Stable PRNG seeded by string id. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
