import type { ShiftName } from "./types";

// Day shift: 06:00–16:00 (10 h). Night shift: 18:00–04:00 (10 h).
const TOTAL_HOURS = 10;
const SHIFT_START_HOUR: Record<ShiftName, number> = { day: 6, night: 18 };

export interface ShiftProgress {
  elapsedHours: number;
  remainingHours: number;
  totalHours: number;
  elapsedFraction: number; // 0–1
}

export function getShiftProgress(shift: ShiftName, now: Date): ShiftProgress {
  const startHour = SHIFT_START_HOUR[shift];
  const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  let elapsed: number;
  if (shift === "day") {
    elapsed = nowH - startHour;
  } else {
    // Night crosses midnight: 18→24→04
    elapsed = nowH >= startHour ? nowH - startHour : nowH + (24 - startHour);
  }

  const elapsedHours = Math.max(0, Math.min(TOTAL_HOURS, elapsed));
  const remainingHours = Math.max(0, TOTAL_HOURS - elapsedHours);

  return {
    elapsedHours,
    remainingHours,
    totalHours: TOTAL_HOURS,
    elapsedFraction: elapsedHours / TOTAL_HOURS,
  };
}

/** Format decimal hours as "3h 24m" (or "45m" if < 1 h, or "10h" if no minutes). */
export function formatShiftTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
