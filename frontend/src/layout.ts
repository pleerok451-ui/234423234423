import type { PolymarketEvent } from "./types";
import { num, seededRandom } from "./utils";

export interface PlacedEvent {
  event: PolymarketEvent;
  position: [number, number, number];
  radius: number;
  color: string;
  speed: number;       // orbit speed
  spin: number;        // self-spin
  ring: boolean;       // whether to draw an orbital ring
  pulse: number;       // 0..1 pulse intensity (volume-driven)
  phase: number;       // animation phase offset
}

/**
 * Lay out events on a tilted spiral disk. The brightest (highest 24h volume)
 * events sit near the galactic core, the long-tail trails out into the arms.
 */
export function placeEvents(
  events: PolymarketEvent[],
  colorOf: (e: PolymarketEvent) => string,
): PlacedEvent[] {
  if (events.length === 0) return [];

  // Sort by 24h volume desc; we use the rank to place events outward.
  const ranked = [...events].sort((a, b) => num(b.volume24hr) - num(a.volume24hr));

  // Volume domain for log-scaled sizing.
  const maxVol = Math.max(...ranked.map((e) => num(e.volume24hr) || 1));
  const minVol = Math.max(1, Math.min(...ranked.map((e) => num(e.volume24hr) || 1)));
  const logMax = Math.log10(maxVol + 1);
  const logMin = Math.log10(minVol + 1);

  // Spiral parameters.
  const armCount = 4;
  const armSpread = 0.75;         // randomness around each arm
  const innerRadius = 4.5;
  const radiusGrowth = 0.32;       // radius grows with sqrt(rank)

  return ranked.map((event, idx) => {
    const rng = seededRandom(event.id);
    const arm = idx % armCount;
    const baseAngle = (arm / armCount) * Math.PI * 2;
    const spiralOffset = Math.sqrt(idx) * 0.55 + (rng() - 0.5) * armSpread;
    const angle = baseAngle + spiralOffset;
    const radius = innerRadius + Math.sqrt(idx) * radiusGrowth + (rng() - 0.5) * 0.6;

    // Slight vertical wobble — disk thickness grows outward.
    const yJitter = (rng() - 0.5) * (0.6 + Math.sqrt(idx) * 0.08);

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = yJitter;

    // Planet size scaled by log(volume24hr); featured events get a small bonus.
    const v = num(event.volume24hr);
    const t = logMax === logMin ? 1 : (Math.log10(v + 1) - logMin) / (logMax - logMin);
    const sizeBoost = event.featured ? 1.15 : 1.0;
    const radiusPlanet = (0.18 + t * 0.62) * sizeBoost;

    // Pulse intensity follows volume.
    const pulse = 0.45 + t * 0.55;

    return {
      event,
      position: [x, y, z],
      radius: radiusPlanet,
      color: colorOf(event),
      speed: 0.04 + (1 - t) * 0.05 + rng() * 0.02,
      spin: 0.2 + rng() * 0.6,
      ring: t > 0.65 || event.featured === true,
      pulse,
      phase: rng() * Math.PI * 2,
    };
  });
}
