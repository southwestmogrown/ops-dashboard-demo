/** Shared status-colour helpers — import from here, never duplicate inline. */
import type { Line } from "./types";

export const PILL_STYLE: Record<RiskLevel, { label: string; cls: string }> = {
  none:        { label: "ON TRACK",       cls: "bg-status-green/15  text-status-green  border-status-green/30" },
  amber:       { label: "WATCH",          cls: "bg-status-amber/15 text-status-amber border-status-amber/30" },
  red:         { label: "CRITICAL",       cls: "bg-status-red/15   text-status-red   border-status-red/30"   },
  unscheduled: { label: "SCHEDULE NEEDED", cls: "bg-slate-500/15  text-slate-400  border-slate-500/30"  },
};
import type { LineState } from "./mesTypes";
import type { ShiftProgress } from "./shiftTime";

export type RiskLevel = "none" | "amber" | "red" | "unscheduled";

export function getOutputColor(output: number, target: number): string {
  const pct = output / target;
  if (pct >= 0.9) return "text-status-green";
  if (pct >= 0.75) return "text-status-amber";
  return "text-status-red";
}

export function getFpyColor(fpy: number): string {
  if (fpy >= 95) return "text-status-green";
  if (fpy >= 90) return "text-status-amber";
  return "text-status-red";
}

export function getHpuColor(hpu: number): string {
  if (hpu <= 0.35) return "text-status-green";
  if (hpu <= 0.45) return "text-status-amber";
  return "text-status-red";
}

export function getPaceColor(projected: number, target: number): string {
  const ratio = projected / target;
  if (ratio >= 0.9) return "text-status-green";
  if (ratio >= 0.75) return "text-status-amber";
  return "text-status-red";
}

export function getOeeColor(oee: number): string {
  if (oee >= 85) return "text-status-green";
  if (oee >= 70) return "text-status-amber";
  return "text-status-red";
}

export function calcLinePace(
  output: number,
  elapsedHours: number,
  totalHours: number
): number | null {
  if (elapsedHours < 0.25) return null;
  return Math.round((output / elapsedHours) * totalHours);
}

/** Aggregate risk level for a line. */
export function getRiskLevel(
  line: Line,
  mesState: LineState | undefined,
  shiftProgress: ShiftProgress | undefined,
  isRunning?: boolean,
): RiskLevel {
  // Only show SCHEDULE NEEDED when the line is supposed to be running but has no schedule.
  // Lines explicitly marked as "Not Running" (isRunning=false) are excluded.
  if (!mesState?.schedule) {
    if (isRunning === false) return "none";
    return "unscheduled";
  }

  const fpyRisk = line.fpy < 90 && line.output < line.target;

  let paceLevel: RiskLevel = "none";
  const pace = shiftProgress
    ? calcLinePace(
        mesState?.schedule ? mesState.totalOutput : line.output,
        shiftProgress.elapsedHours,
        shiftProgress.totalHours
      )
    : null;
  if (pace !== null) {
    const ratio = pace / line.target;
    if (ratio < 0.75)      paceLevel = "red";
    else if (ratio < 0.9)   paceLevel = "amber";
  }

  if (fpyRisk || paceLevel === "red") return "red";
  if (paceLevel === "amber")          return "amber";
  return "none";
}

/**
 * Human-readable reason strings for every active risk signal on a line.
 * Pass `isZeroOutput=true` if the page detects the line has stalled.
 */
export function getStatusReasons(
  line: Line,
  mesState: LineState | undefined,
  shiftProgress: ShiftProgress | undefined,
  plannedHeadcount: number | undefined,
  isZeroOutput: boolean,
  isRunning?: boolean,
  openDowntime?: boolean,
): string[] {
  if (!mesState?.schedule) {
    if (isRunning === false) return [];
    return ["No schedule loaded"];
  }

  const reasons: string[] = [];

  if (openDowntime) {
    reasons.push("Line stopped");
  }

  if (isZeroOutput) {
    reasons.push("Zero output");
  }

  if (line.fpy < 90) {
    reasons.push(`FPY low (${line.fpy.toFixed(1)}%)`);
  }

  const pace = shiftProgress
    ? calcLinePace(
        mesState?.schedule ? mesState.totalOutput : line.output,
        shiftProgress.elapsedHours,
        shiftProgress.totalHours
      )
    : null;
  if (pace !== null) {
    const ratio = pace / line.target;
    if (ratio < 0.75) {
      reasons.push(`Behind pace (${Math.round(ratio * 100)}%)`);
    }
  }

  if (
    plannedHeadcount !== undefined &&
    shiftProgress &&
    shiftProgress.elapsedHours >= 0.5 &&
    line.headcount < plannedHeadcount
  ) {
    reasons.push(`HC short (${line.headcount}/${plannedHeadcount})`);
  }

  if (mesState && mesState.skippedItems.length > 0) {
    reasons.push(`Skipped orders (${mesState.skippedItems.length})`);
  }

  return reasons;
}
