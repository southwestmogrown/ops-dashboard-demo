import { Line, ShiftMetrics, ShiftName, TimePoint } from "./types";

// Mulberry32 — a fast, seedable pseudo-random number generator.
// Returns a function that, when called, produces the next number
// in the sequence between 0 and 1.
function createRng(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns a random number between min and max using the provided rng.
// This is a pure utility — it doesn't know or care about shifts or lines.
function randBetween(rng: () => number, min: number, max: number): number {
  return parseFloat((min + rng() * (max - min)).toFixed(2));
}

// The seed values for each shift. These are arbitrary numbers —
// what matters is that they're different from each other.
const SHIFT_SEEDS: Record<ShiftName, number> = {
  day: 1001,
  night: 3003,
};

// Line definitions. id is unique across the whole dashboard.
// valueStream and name are for display only.
const LINE_DEFINITIONS = [
  { id: "vs1-l1", name: "Line 1", valueStream: "VS1" },
  { id: "vs1-l2", name: "Line 2", valueStream: "VS1" },
  { id: "vs1-l3", name: "Line 3", valueStream: "VS1" },
  { id: "vs1-l4", name: "Line 4", valueStream: "VS1" },
  { id: "vs2-l1", name: "Line 1", valueStream: "VS2" },
  { id: "vs2-l2", name: "Line 2", valueStream: "VS2" },
];

// Generates a full ShiftMetrics payload.
// If overrideSeed is provided (from DEMO_SEED env var), it takes
// priority over the shift's default seed.
export function generateMetrics(
  shift: ShiftName,
  overrideSeed?: number
): ShiftMetrics {
  const seed = overrideSeed ?? SHIFT_SEEDS[shift];
  const rng = createRng(seed);

  // Generate per-line metrics
  const lines: Line[] = LINE_DEFINITIONS.map((def) => {
    const target = Math.round(randBetween(rng, 180, 240));
    const outputPct = randBetween(rng, 0.55, 0.95); // how far through the shift target
    const output = Math.round(target * outputPct);

    return {
      id: def.id,
      name: def.name,
      valueStream: def.valueStream,
      output,
      target,
      fpy: 100.0,
      hpu: 0.0,
      headcount: Math.round(randBetween(rng, 6, 14)),
      changeovers: Math.round(randBetween(rng, 0, 3)),
    };
  });

  // Generate time-series trend data — 16 points = 8 hours in 30-min intervals
  const INTERVALS = 16;
  const trend: TimePoint[] = [];

  // Shift start hours for the x-axis labels
  const startHour: Record<ShiftName, number> = {
    day: 6,
    night: 17,
  };

  let vs1Cumulative = 0;
  let vs2Cumulative = 0;

  for (let i = 0; i < INTERVALS; i++) {
    const totalMinutes = startHour[shift] * 60 + i * 30;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    // VS1 has 3 lines, VS2 has 2 — scale the per-interval output accordingly
    vs1Cumulative += Math.round(randBetween(rng, 18, 32));
    vs2Cumulative += Math.round(randBetween(rng, 12, 22));

    trend.push({ time, vs1Output: vs1Cumulative, vs2Output: vs2Cumulative });
  }

  return {
    shift,
    generatedAt: new Date().toISOString(),
    lines,
    trend,
  };
}

/**
 * Default headcount by line type.
 * Folding lines (VS1): 45
 * Revolver lines (VS2): 40
 */
export function getDefaultHeadcount(lineId: string): number {
  return lineId.startsWith("vs1-") ? 45 : 40;
}

/**
 * Default daily target by line type.
 * Folding lines (VS1): 225
 * Revolver lines (VS2): 200
 */
export function getDefaultTarget(lineId: string): number {
  return lineId.startsWith("vs1-") ? 225 : 200;
}