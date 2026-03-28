import { NextRequest, NextResponse } from "next/server";
import {
  tickLine,
  getAllLineStates,
  advanceSimClock,
  getSimRunning,
  getSimClock,
  addScrapEntry,
} from "@/lib/mesStore";
import type { ShiftName } from "@/lib/types";
import { PANEL_OPTIONS, DAMAGE_TYPES } from "@/lib/reworkTypes";
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
 * Inject a random "kicked lid" defect for one active line.
 * Fires with ~5% probability per tick — produces ~5% FPY defect rate.
 * Directly writes to the scrap log (no HTTP round-trip).
 */
function maybeInjectKickedPanel(activeLines: { lineId: string; currentOrder: string | null }[]) {
  if (activeLines.length === 0) return;
  if (Math.random() > 0.05) return; // 5% chance

  const line = randomChoice(activeLines);
  const now = getSimClock() ?? new Date();
  const hour = now.getHours();
  const shift: ShiftName = hour >= 6 && hour < 18 ? "day" : "night";

  addScrapEntry({
    kind: "kicked-lid",
    lineId: line.lineId,
    shift,
    model: line.currentOrder ?? "UNKNOWN",
    panel: randomChoice(PANEL_OPTIONS),
    damageType: randomChoice(DAMAGE_TYPES),
    affectedArea: randomChoice(["panel", "extrusion"] as const),
    auditorInitials: "SYS",
    boughtIn: false,
  } as Omit<KickedLid, "id" | "timestamp">);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Advance simulated clock if running (fires every real second)
  if (getSimRunning()) {
    advanceSimClock();
  }

  const body = await request.json() as TickBody;
  const baseUnits = Math.max(1, Math.floor(body.units ?? 1));

  if (body.all) {
    const states = getAllLineStates();
    const activeLines = states.filter((s) => s.schedule !== null);
    let scansAdded = 0;

    for (const state of activeLines) {
      // ~20% chance of downtime / break — no production this tick
      const isDown = Math.random() < 0.2;
      if (!isDown) {
        tickLine(state.lineId, baseUnits);
        scansAdded += baseUnits;
      }
    }

    // Random kicked panel defect
    maybeInjectKickedPanel(activeLines.map((s) => ({ lineId: s.lineId, currentOrder: s.currentOrder })));

    return NextResponse.json({ scansAdded });
  }

  if (!body.lineId) {
    return NextResponse.json({ error: "lineId or all=true required" }, { status: 400 });
  }

  const isDown = Math.random() < 0.2;
  if (!isDown) {
    tickLine(body.lineId, baseUnits);
  }
  return NextResponse.json({ scansAdded: isDown ? 0 : baseUnits });
}
