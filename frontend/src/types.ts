export interface PolymarketTag {
  label: string;
  slug: string | null;
}

export interface PolymarketMarket {
  id: string | null;
  question: string | null;
  slug: string | null;
  outcomes: string | null;       // JSON string e.g. "[\"Yes\",\"No\"]"
  outcomePrices: string | null;  // JSON string e.g. "[\"0.55\",\"0.45\"]"
  volume: string | null;
  groupItemTitle: string | null;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  icon: string | null;
  endDate: string | null;
  startDate: string | null;
  volume: number | string | null;
  volume24hr: number | string | null;
  liquidity: number | string | null;
  openInterest: number | string | null;
  competitive: number | null;
  featured: boolean | null;
  commentCount: number | null;
  tags: PolymarketTag[];
  markets: PolymarketMarket[];
}

export interface EventsResponse {
  events: PolymarketEvent[];
  count: number;
}
