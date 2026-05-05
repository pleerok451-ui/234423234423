import type { EventsResponse, PolymarketEvent } from "./types";

const API_URL = "/api/events";

export async function fetchEvents(signal?: AbortSignal): Promise<PolymarketEvent[]> {
  const res = await fetch(API_URL, { signal });
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  const data = (await res.json()) as EventsResponse;
  return data.events;
}
