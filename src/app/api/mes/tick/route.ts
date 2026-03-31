import { NextRequest, NextResponse } from "next/server";
import {
  tickLine,
  getAllLineStates,
  advanceSimClock,
  getSimRunning,
  getSimClock,
  addScrapEntry,
  getSimSpeed,
  refreshCacheFromDb,
} from "@/lib/mesStore";
import { getShiftWindows } from "@/lib/shiftTime";
import type { ShiftName } from "@/lib/types";
import { PANEL_OPTIONS, pickDefectType } from "@/lib/reworkTypes";
import type { KickedLid } from "@/lib/reworkTypes";

interface TickBody {
  lineId?: string;
  all?: boolean;
  units: number;
}

const DOWNTIME_SKIP_PROBABILITY = 0.12;
const DEFECT_INJECTION_PROBABILITY = 0.003;

function unitsForSpeed(speed: number): number {
  return Math.max(1, Math.round(speed / 90));
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stochasticRound(value: number): number {
  if (value <= 0) return 0;
  const whole = Math.floor(value);
  const frac = value - whole;
  return whole + (Math.random() < frac ? 1 : 0);
}

/**
 * M17.6 — Compute production rate multiplier based on simulated shift elapsed time.
 * First 30 min  → 60% rate (ramp-up)
 * Last 30 min   → 75% rate (wind-down)
 * Middle        → 100% rate
 */
function getRateMultiplier(simClock: Date): { multiplier: number; actualUnits: number; shiftMinutes: number } {
  const hour      = simClock.getHours() + simClock.getMinutes() / 60 + simClock.getSeconds() / 3600;
  const shiftName: ShiftName = hour >= 6 && hour < 18 ? "day" : "night";
  const win       = getShiftWindows(shiftName);
  const totalWorkMinutes = win.totalWorkMinutes;

  let elapsedMinutes: number;
  if (hour >= win.startHour) {
    elapsedMinutes = (hour - win.startHour) * 60;
  } else {
    elapsedMinutes = (hour + 24 - win.startHour) * 60;
  }
  elapsedMinutes = Math.max(0, Math.min(totalWorkMinutes, elapsedMinutes));

  let multiplier = 1;
  if (elapsedMinutes < 30)                            multiplier = 0.6;
  else if (elapsedMinutes > totalWorkMinutes - 30)    multiplier = 0.75;

  return { multiplier, actualUnits: 0, shiftMinutes: elapsedMinutes };
}

// ── M17.3: Multi-defect scrap injection ──────────────────────────────────────

const AFFECTED_AREAS: Array<"panel" | "extrusion"> = ["panel", "extrusion"];

async function maybeInjectDefect(
  activeLines: { lineId: string; currentOrder: string | null }[]
): Promise<void> {
  if (activeLines.length === 0) return;
  if (Math.random() >= DEFECT_INJECTION_PROBABILITY) return;

  const line  = randomChoice(activeLines);
  const now   = (await getSimClock()) ?? new Date();
  const hour  = now.getHours();
  const shift: ShiftName = hour >= 6 && hour < 18 ? "day" : "night";
  const isVS2 = line.lineId.toLowerCase().includes("vs2");

  const defectType  = pickDefectType(isVS2);
  const panel       = randomChoice(PANEL_OPTIONS);
  const affectedArea: "panel" | "extrusion" =
    defectType === "kicked-lid" ? randomChoice(AFFECTED_AREAS) : "panel";

  await addScrapEntry({
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
  await refreshCacheFromDb();

  if (await getSimRunning()) {
    await advanceSimClock();
  }

  const body = await request.json() as TickBody;

  if (body.all) {
    const states      = await getAllLineStates();
    const activeLines = states.filter((s) => s.schedule !== null);
    let scansAdded = 0;

    const simClock = (await getSimClock()) ?? new Date();
    const { multiplier } = getRateMultiplier(simClock);

    const simSpeed = await getSimSpeed();
    const requestedUnits = body.units > 0 ? body.units : unitsForSpeed(simSpeed);
    const actualUnits = stochasticRound(requestedUnits * multiplier);

    if (actualUnits <= 0) {
      return NextResponse.json({ scansAdded: 0 });
    }

    for (const state of activeLines) {
      // Simulate brief line stops/changeover interruptions.
      if (Math.random() < DOWNTIME_SKIP_PROBABILITY) continue;
      await tickLine(state.lineId, actualUnits);
      scansAdded += actualUnits;
    }

    await maybeInjectDefect(activeLines.map((s) => ({ lineId: s.lineId, currentOrder: s.currentOrder })));

    return NextResponse.json({ scansAdded });
  }

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId or all=true required" }, { status: 400 });
  }

  const simClock = (await getSimClock()) ?? new Date();
  const { multiplier } = getRateMultiplier(simClock);
  const simSpeed = await getSimSpeed();
  const requestedUnits = body.units > 0 ? body.units : unitsForSpeed(simSpeed);
  const actualUnits = stochasticRound(requestedUnits * multiplier);

  if (actualUnits <= 0) {
    return NextResponse.json({ scansAdded: 0 });
  }

  if (Math.random() < DOWNTIME_SKIP_PROBABILITY) {
    return NextResponse.json({ scansAdded: 0 });
  }

  await tickLine(body.lineId, actualUnits);
  return NextResponse.json({ scansAdded: actualUnits });
}
