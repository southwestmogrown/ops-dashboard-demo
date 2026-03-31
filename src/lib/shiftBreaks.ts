import type { ShiftName } from "./types";
import { getShiftWindows } from "./shiftTime";

export interface HourlyTargetRow {
  hour: string;        // "07:00", "08:00", …
  planned: number;     // target units for this hour
  actual: number;      // units produced this hour
  variance: number;    // actual − planned
  status: "green" | "amber" | "red";
  isBreak: boolean;    // true = break-only hour, all values show "—"
}

/** Overlap in hours between [aStart, aEnd) and [bStart, bEnd). Returns 0 if no overlap. */
function overlapHours(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function getHourlyTargets(
  target: number,
  shift: ShiftName,
  hourlyOutput: Record<string, number>
): HourlyTargetRow[] {
  const win = getShiftWindows(shift);
  const rows: HourlyTargetRow[] = [];

  const startH = Math.ceil(win.startHour);
  const endH   = Math.ceil(win.endHour);  // include partial final hour (e.g. 16:00–16:30)

  for (let h = startH; h < endH; h++) {
    const clockHour = h >= 24 ? h - 24 : h;
    const hourKey = `${String(Math.floor(clockHour)).padStart(2, "0")}:00`;

    // Working minutes in this shift hour (raw timeline axis, supports overnight windows).
    // Cap at the actual portion of this hour that falls within the shift.
    const hourEnd = Math.min(h + 1, win.endHour);
    let workingMins = (hourEnd - h) * 60;
    for (const bw of win.breakWindows) {
      let bStart = bw.start;
      let bEnd = bw.end;
      if (bStart < win.startHour) {
        bStart += 24;
        bEnd += 24;
      }
      const overlap = overlapHours(h, h + 1, bStart, bEnd);
      workingMins = Math.max(0, workingMins - overlap * 60);
    }

    const isBreak = workingMins === 0;
    const planned = isBreak ? 0 : Math.round((target * workingMins) / win.totalWorkMinutes);
    const actual  = hourlyOutput[hourKey] ?? 0;
    const variance = isBreak ? 0 : actual - planned;

    let status: HourlyTargetRow["status"];
    if (isBreak) {
      status = "green";
    } else if (actual >= planned) {
      status = "green";
    } else if (actual >= planned * 0.9) {
      status = "amber";
    } else {
      status = "red";
    }

    rows.push({ hour: hourKey, planned, actual, variance, status, isBreak });
  }

  return rows;
}
