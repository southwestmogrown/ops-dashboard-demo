import type { ShiftName } from "./types";

export interface ShiftWindow {
  startHour: number;           // clock hour when shift starts, e.g. 6 (day) or 17 (night)
  endHour: number;              // end hour stored as 24+ for overnight, e.g. 16.5 (day) or 27.5 (night)
  totalClockMinutes: number;    // 630
  totalWorkMinutes: number;    // 525 (totalClockMinutes minus 75 min breaks)
  breakWindows: { start: number; end: number; paid: boolean }[];
}

const SHIFT_CONFIG: Record<ShiftName, Omit<ShiftWindow, "totalClockMinutes" | "totalWorkMinutes">> = {
  day: {
    startHour: 6,
    endHour: 16.5,
    breakWindows: [
      { start:  8,  end:  8.25, paid: true  },  // 08:00–08:15
      { start: 10,  end: 10.25, paid: true  },  // 10:00–10:15
      { start: 12,  end: 12.5,  paid: false },  // 12:00–12:30  lunch
      { start: 14,  end: 14.25, paid: true  },  // 14:00–14:15
    ],
  },
  night: {
    startHour: 17,
    endHour: 27.5,   // 03:30 next day = 27.5
    breakWindows: [
      { start: 19,  end: 19.25, paid: true  },  // 19:00–19:15
      { start: 21.5,end: 22,    paid: false },  // 21:30–22:00  lunch
      { start: 25,  end: 25.25, paid: true  },  // 01:00–01:15
      { start: 26,  end: 26.25, paid: true  },  // 02:00–02:15
    ],
  },
};

export function getShiftWindows(shift: ShiftName): ShiftWindow {
  const cfg = SHIFT_CONFIG[shift];
  const totalClockMinutes = (cfg.endHour - cfg.startHour) * 60; // 630
  const breakMinutes = cfg.breakWindows.reduce((sum, b) => sum + (b.end - b.start) * 60, 0); // 75
  return {
    ...cfg,
    totalClockMinutes,
    totalWorkMinutes: totalClockMinutes - breakMinutes, // 525
  };
}

// Legacy: keep getShiftProgress working with the new windows
const TOTAL_HOURS = 10;

export interface ShiftProgress {
  elapsedHours: number;
  remainingHours: number;
  totalHours: number;
  elapsedFraction: number;
}

export function getShiftProgress(shift: ShiftName, now: Date): ShiftProgress {
  const win = getShiftWindows(shift);
  const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  let elapsed: number;
  if (nowH >= win.startHour) {
    elapsed = nowH - win.startHour;
  } else {
    // overnight: night shift starts at 17, ends at 03:30 = 27.5
    elapsed = nowH + 24 - win.startHour;
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
