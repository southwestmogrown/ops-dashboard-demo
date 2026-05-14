import { NextRequest, NextResponse } from "next/server";
import {
  tickLine,
  getAllLineStates,
  advanceSimClock,
  getSimRunning,
  getSimClock,
  getSimState,
  addScrapEntry,
  addDowntimeEntry,
  getOpenDowntime,
  getSimSpeed,
  claimSimUnits,
  refreshCacheFromDb,
  getAdminConfig,
} from "@/lib/mesStore";
import { getCurrentShiftContext, getShiftWindows } from "@/lib/shiftTime";
import type { ShiftName } from "@/lib/types/core";
import { PANEL_OPTIONS, pickDefectType } from "@/lib/types/quality";
import {
  ACTIVE_DOWNTIME_REASONS,
  type DowntimeReason,
} from "@/lib/types/downtime";
import { requireRole } from "@/lib/apiAuth";
import { isLineRunningForShift } from "@/lib/adminConfig";

interface TickBody {
  lineId?: string;
  all?: boolean;
  units: number;
}

const DOWNTIME_SKIP_PROBABILITY = 0.08;
const DEFECT_INJECTION_PROBABILITY = 0.08;
const KICKED_LID_INJECTION_PROBABILITY = 0.03;
const DOWNTIME_EVENT_PROBABILITY = 0.35;

const DOWNTIME_REASONS: DowntimeReason[] = ACTIVE_DOWNTIME_REASONS;

function getShiftTimelineHour(simClock: Date, shift: ShiftName): number {
  const hours = simClock.getUTCHours() + simClock.getUTCMinutes() / 60;
  const shiftWindow = getShiftWindows(shift);
  // Night shift spans midnight, so post-midnight hours must be projected onto
  // the same 24+ hour timeline as the 17:00 start (e.g. 01:00 → 25:00).
  if (shift === "night" && hours < shiftWindow.startHour) {
    return hours + 24;
  }
  return hours;
}

/**
 * Converts elapsed clock time into productive work minutes for the active shift.
 * Break windows are subtracted from the elapsed span, and `isOnBreak` reports
 * whether the current simulated time falls inside one of those windows.
 */
function getElapsedWorkMinutes(
  simClock: Date,
  shift: ShiftName,
): { elapsedWorkMinutes: number; isOnBreak: boolean } {
  const context = getCurrentShiftContext(simClock, { useUtc: true });
  const shiftWindow = getShiftWindows(shift);
  const timelineHour = getShiftTimelineHour(simClock, shift);
  const elapsedClockMinutes = context
    ? Math.max(
        0,
        Math.min(
          shiftWindow.totalClockMinutes,
          (simClock.getTime() - context.shiftStart.getTime()) / 60_000,
        ),
      )
    : 0;

  let elapsedWorkMinutes = elapsedClockMinutes;
  let isOnBreak = false;

  for (const breakWindow of shiftWindow.breakWindows) {
    const breakStartMinutes =
      (breakWindow.start - shiftWindow.startHour) * 60;
    const breakEndMinutes = (breakWindow.end - shiftWindow.startHour) * 60;
    const elapsedBreakMinutes = Math.max(
      0,
      Math.min(elapsedClockMinutes, breakEndMinutes) - breakStartMinutes,
    );
    elapsedWorkMinutes -= elapsedBreakMinutes;

    if (timelineHour >= breakWindow.start && timelineHour < breakWindow.end) {
      isOnBreak = true;
      break;
    }
  }

  return {
    elapsedWorkMinutes: Math.max(0, elapsedWorkMinutes),
    isOnBreak,
  };
}

function unitsForSpeed(speed: number, shift: ShiftName): number {
  const shiftWindow = getShiftWindows(shift);
  const workMinuteCompensation =
    shiftWindow.totalClockMinutes / shiftWindow.totalWorkMinutes;
  return (speed / 100) * workMinuteCompensation;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * M17.6 — Compute production rate multiplier based on simulated shift elapsed time.
 * First 30 min  → 60% rate (ramp-up)
 * Last 30 min   → 75% rate (wind-down)
 * Middle        → 100% rate
 */
function getRateMultiplier(simClock: Date): {
  multiplier: number;
  isProductionPaused: boolean;
  shiftMinutes: number;
  shift: ShiftName | null;
} {
  const context = getCurrentShiftContext(simClock, { useUtc: true });
  if (!context) {
    return {
      multiplier: 0,
      isProductionPaused: true,
      shiftMinutes: 0,
      shift: null,
    };
  }

  const totalWorkMinutes = getShiftWindows(context.shift).totalWorkMinutes;
  const { elapsedWorkMinutes, isOnBreak } = getElapsedWorkMinutes(
    simClock,
    context.shift,
  );

  let multiplier = 1;
  if (elapsedWorkMinutes < 30) multiplier = 0.6;
  else if (elapsedWorkMinutes > totalWorkMinutes - 30) multiplier = 0.75;

  return {
    multiplier: isOnBreak ? 0 : multiplier,
    isProductionPaused: isOnBreak,
    shiftMinutes: elapsedWorkMinutes,
    shift: context.shift,
  };
}

// ── M17.3: Multi-defect scrap injection ──────────────────────────────────────

const AFFECTED_AREAS: Array<"panel" | "extrusion"> = ["panel", "extrusion"];

async function maybeInjectDefect(
  activeLines: { lineId: string; currentOrder: string | null }[],
): Promise<void> {
  if (activeLines.length === 0) return;

  const line = randomChoice(activeLines);
  const now = (await getSimClock()) ?? new Date();
  const context = getCurrentShiftContext(now, { useUtc: true });
  const shift: ShiftName = context?.shift ?? "day";
  const productionDate = context?.productionDate ?? "unknown";
  const isVS2 = line.lineId.toLowerCase().includes("vs2");

  if (Math.random() < KICKED_LID_INJECTION_PROBABILITY) {
    await addScrapEntry({
      kind: "kicked-lid",
      lineId: line.lineId,
      shift,
      productionDate,
      model: line.currentOrder ?? "UNKNOWN",
      panel: randomChoice(PANEL_OPTIONS),
      damageType: "kicked-lid",
      affectedArea: randomChoice(AFFECTED_AREAS),
      auditorInitials: "SYS",
      boughtIn: false,
    });
    return;
  }

  if (Math.random() >= DEFECT_INJECTION_PROBABILITY) return;

  let defectType = pickDefectType(isVS2);
  while (defectType === "kicked-lid") {
    defectType = pickDefectType(isVS2);
  }

  await addScrapEntry({
    kind: "scrapped-panel",
    lineId: line.lineId,
    shift,
    productionDate,
    model: line.currentOrder ?? "UNKNOWN",
    panel: randomChoice(PANEL_OPTIONS),
    damageType: defectType,
    stationFound: "Final Inspection",
    howDamaged: `Simulated defect: ${defectType}`,
    boughtIn: false,
  });
}

async function maybeInjectDowntime(
  lineId: string,
  shift: ShiftName,
  productionDate: string,
  simClock: Date,
  targetOutput: number,
): Promise<void> {
  if (Math.random() >= DOWNTIME_EVENT_PROBABILITY) return;

  const open = await getOpenDowntime(lineId, shift, productionDate);
  if (open) return;

  const durationMinutes = 2 + Math.floor(Math.random() * 7); // 2-8 min
  const end = new Date(simClock.getTime() + durationMinutes * 60_000);
  const { totalWorkMinutes } = getShiftWindows(shift);
  const unitsPerWorkMinute =
    targetOutput > 0 ? targetOutput / totalWorkMinutes : 0;
  const unitsLost =
    targetOutput > 0
      ? Math.max(1, Math.round(unitsPerWorkMinute * durationMinutes))
      : 0;

    await addDowntimeEntry({
      lineId,
      shift,
      productionDate,
      reason: randomChoice(DOWNTIME_REASONS),
    startTime: simClock.toISOString(),
    endTime: end.toISOString(),
    unitsLost,
    notes: "Auto-generated by simulator",
    createdBy: "SYS",
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireRole(request, "supervisor");
  if (authError) return authError;

  await refreshCacheFromDb();

  if (await getSimRunning()) {
    await advanceSimClock();
  }

  // If the clock advance just stopped the sim (shift end), tell the client immediately.
  const stillRunning = await getSimRunning();

  const body = (await request.json()) as TickBody;

  if (body.all) {
    if (!stillRunning)
      return NextResponse.json({ scansAdded: 0, stopped: true });

    const simState = await getSimState();
    const productionDate = simState.productionDate ?? "unknown";

    const simClock = (await getSimClock()) ?? new Date();
    const { multiplier, shift: activeShift } = getRateMultiplier(simClock);
    if (!activeShift || multiplier <= 0) {
      return NextResponse.json({ scansAdded: 0 });
    }

    const states = await getAllLineStates({ shift: activeShift, productionDate });
    const eligibleLineStates = await Promise.all(
      states
        .filter((s) => s.schedule !== null)
        .map(async (state) => ({
          state,
          config: await getAdminConfig(state.lineId),
        })),
    );
    const activeLines = eligibleLineStates
      .filter(({ config }) => isLineRunningForShift(config, activeShift))
      .map(({ state }) => state);
    let scansAdded = 0;

    const simSpeed = await getSimSpeed();
    const requestedUnits = unitsForSpeed(simSpeed, activeShift);
    const requestedTickUnits = requestedUnits * multiplier;

    if (requestedTickUnits <= 0) {
      return NextResponse.json({ scansAdded: 0 });
    }

    for (const state of activeLines) {
      const actualUnits = await claimSimUnits(state.lineId, requestedTickUnits);

      // Simulate brief line stops/changeover interruptions.
      if (Math.random() < DOWNTIME_SKIP_PROBABILITY) {
        await maybeInjectDowntime(
          state.lineId,
          activeShift,
          productionDate,
          simClock,
          state.schedule?.totalTarget ?? 0,
        );
        continue;
      }
      if (actualUnits <= 0) {
        continue;
      }
      await tickLine(state.lineId, actualUnits);
      scansAdded += actualUnits;
    }

    await maybeInjectDefect(
      activeLines.map((s) => ({
        lineId: s.lineId,
        currentOrder: s.currentOrder,
      })),
    );

    return NextResponse.json({ scansAdded });
  }

  if (!body.lineId) {
    return NextResponse.json(
      { error: "lineId or all=true required" },
      { status: 400 },
    );
  }

  const simClock = (await getSimClock()) ?? new Date();
  const { multiplier, shift } = getRateMultiplier(simClock);
  if (!shift || multiplier <= 0) {
    return NextResponse.json({ scansAdded: 0 });
  }

  const config = await getAdminConfig(body.lineId);
  if (!isLineRunningForShift(config, shift)) {
    return NextResponse.json({ scansAdded: 0 });
  }

  const simSpeed = await getSimSpeed();
  const requestedUnits =
    body.units > 0 ? body.units : unitsForSpeed(simSpeed, shift);
  const actualUnits = await claimSimUnits(
    body.lineId,
    requestedUnits * multiplier,
  );

  if (actualUnits <= 0) {
    return NextResponse.json({ scansAdded: 0 });
  }

  if (Math.random() < DOWNTIME_SKIP_PROBABILITY) {
    return NextResponse.json({ scansAdded: 0 });
  }

  await tickLine(body.lineId, actualUnits);
  return NextResponse.json({ scansAdded: actualUnits });
}
