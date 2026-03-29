import { NextRequest, NextResponse } from "next/server";
import {
  tickLine,
  getAllLineStates,
  advanceSimClock,
  getSimRunning,
  getSimClock,
  addScrapEntry,
  getSimSpeed,
} from "@/lib/mesStore";
import { getShiftWindows } from "@/lib/shiftTime";
import type { ShiftName } from "@/lib/types";
import { PANEL_OPTIONS, pickDefectType } from "@/lib/reworkTypes";
import type { KickedLid } from "@/lib/reworkTypes";

interface TickBody {
  /** Specific line to tick. Omit when all=true. */
  lineId?: string;
  /** When true, tick every line that has a schedule loaded. */
  all?: boolean;
  /** Number of scan events (units) to emit per line. */
  units: number;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * M17.6 — Compute production rate multiplier based on simulated shift elapsed time.
 * First 30 min  → 60% rate (ramp-up)
 * Last 30 min   → 75% rate (wind-down)
 * Middle        → 100% rate
 *
 * Returns multiplier and the actual units to produce this tick.
 */
function getRateMultiplier(simClock: Date): { multiplier: number; actualUnits: number; shiftMinutes: number } {
  const hour      = simClock.getHours() + simClock.getMinutes() / 60 + simClock.getSeconds() / 3600;
  const shiftName: ShiftName = hour >= 6 && hour < 18 ? "day" : "night";
  const win       = getShiftWindows(shiftName);
  const totalWorkMinutes = win.totalWorkMinutes; // 525

  // Elapsed shift minutes (fractional clock hours since shift start, converted to minutes)
  let elapsedMinutes: number;
  if (hour >= win.startHour) {
    elapsedMinutes = (hour - win.startHour) * 60;
  } else {
    // Night shift: wraps past midnight
    elapsedMinutes = (hour + 24 - win.startHour) * 60;
  }
  elapsedMinutes = Math.max(0, Math.min(totalWorkMinutes, elapsedMinutes));

  // M17.6 ramp-up / wind-down
  let multiplier = 1;
  if (elapsedMinutes < 30)          multiplier = 0.6;
  else if (elapsedMinutes > totalWorkMinutes - 30) multiplier = 0.75;

  return { multiplier, actualUnits: 0, shiftMinutes: elapsedMinutes };
}

// ── M17.3: Multi-defect scrap injection ─────────────────────────────────────────

const AFFECTED_AREAS: Array<"panel" | "extrusion"> = ["panel", "extrusion"];

/**
 * M17.3 — Inject a random defect for one active line using weighted defect pool.
 * Fires with ~5% probability per tick — produces ~5% FPY defect rate.
 * Uses VS2-aware weights (more weld/electrical defects on revolver lines).
 */
function maybeInjectDefect(
  activeLines: { lineId: string; currentOrder: string | null }[]
) {
  if (activeLines.length === 0) return;
  if (Math.random() < 0.005) return; // 0.5% chance — ~0.4% per line → FPY ≈ 99.6% baseline

  const line = randomChoice(activeLines);
  const now  = getSimClock() ?? new Date();
  const hour = now.getHours();
  const shift: ShiftName = hour >= 6 && hour < 18 ? "day" : "night";
  const isVS2 = line.lineId.toLowerCase().includes("vs2");

  const defectType = pickDefectType(isVS2);
  const panel = randomChoice(PANEL_OPTIONS);
  const affectedArea: "panel" | "extrusion" =
    defectType === "kicked-lid" ? randomChoice(AFFECTED_AREAS) : "panel";

  addScrapEntry({
    kind:            "kicked-lid",
    lineId:          line.lineId,
    shift,
    model:           line.currentOrder ?? "UNKNOWN",
    panel,
    damageType:      defectType as KickedLid["damageType"],
    affectedArea,
    auditorInitials: "SYS",
    boughtIn:        false,
  } as Omit<KickedLid, "id" | "timestamp">);
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Advance simulated clock if running (fires every real second)
  if (getSimRunning()) {
    advanceSimClock();
  }

  const body = await request.json() as TickBody;

  if (body.all) {
    const states     = getAllLineStates();
    const activeLines = states.filter((s) => s.schedule !== null);
    let scansAdded = 0;

    // M17.6 — compute rate multiplier once per tick (all lines share the sim clock)
    const simClock  = getSimClock() ?? new Date();
    const { multiplier } = getRateMultiplier(simClock);

    // Production rate is calibrated from simSpeed so that a full shift produces close
    // to the configured target (VS1≈225 / VS2≈200 units):
    //   ceil(simSpeed / 15) × multiplier
    // At 1×: ceil(1/15)=1  → 216 units/shift (≈target)
    // At 5×: ceil(5/15)=1  → same pace, shift finishes 5× faster in real time
    // At 15×: ceil(15/15)=1 → 1 unit/tick; busier visual
    // At 60×: ceil(60/15)=4 → fast-forward feel
    const simSpeed   = getSimSpeed();
    const actualUnits = Math.max(1, Math.round((simSpeed / 15) * multiplier));

    for (const state of activeLines) {
      tickLine(state.lineId, actualUnits);
      scansAdded += actualUnits;
    }

    // M17.3 — random multi-defect injection
    maybeInjectDefect(activeLines.map((s) => ({ lineId: s.lineId, currentOrder: s.currentOrder })));

    return NextResponse.json({ scansAdded });
  }

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId or all=true required" }, { status: 400 });
  }

  // M17.6 — single-line ramp-up / wind-down
  const simClock = getSimClock() ?? new Date();
  const { multiplier } = getRateMultiplier(simClock);
  const simSpeed = getSimSpeed();
  const actualUnits = Math.max(1, Math.round((simSpeed / 15) * multiplier));

  tickLine(body.lineId, actualUnits);
  return NextResponse.json({ scansAdded: actualUnits });
}
