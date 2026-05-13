import type { ShiftName } from "./types";

export interface ShiftWindow {
  startHour: number;
  endHour: number;
  totalClockMinutes: number;
  totalWorkMinutes: number;
  breakWindows: { start: number; end: number; paid: boolean }[];
}

export interface ShiftProgress {
  elapsedHours: number;
  remainingHours: number;
  totalHours: number;
  elapsedFraction: number;
}

export interface ShiftContext extends ShiftProgress {
  shift: ShiftName;
  productionDate: string;
  contextKey: string;
  shiftStart: Date;
  shiftEnd: Date;
  currentTime: Date;
  isActive: boolean;
  isHandoffGap: boolean;
}

const SHIFT_CONFIG: Record<
  ShiftName,
  Omit<ShiftWindow, "totalClockMinutes" | "totalWorkMinutes">
> = {
  day: {
    startHour: 6,
    endHour: 16.5,
    breakWindows: [
      { start: 8, end: 8.25, paid: true },
      { start: 10, end: 10.25, paid: true },
      { start: 12, end: 12.5, paid: false },
      { start: 14, end: 14.25, paid: true },
    ],
  },
  night: {
    startHour: 17,
    endHour: 27.5,
    breakWindows: [
      { start: 19, end: 19.25, paid: true },
      { start: 21.5, end: 22, paid: false },
      { start: 25, end: 25.25, paid: true },
      { start: 26, end: 26.25, paid: true },
    ],
  },
};

const DAY_START_HOUR = SHIFT_CONFIG.day.startHour;

function createDateAt(
  base: Date,
  hour: number,
  useUtc: boolean,
): Date {
  const out = new Date(base);
  if (useUtc) {
    out.setUTCHours(0, 0, 0, 0);
  } else {
    out.setHours(0, 0, 0, 0);
  }

  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  out.setTime(out.getTime() + (wholeHours * 60 + minutes) * 60_000);
  return out;
}

function shiftDate(base: Date, days: number, useUtc: boolean): Date {
  const out = new Date(base);
  if (useUtc) {
    out.setUTCDate(out.getUTCDate() + days);
  } else {
    out.setDate(out.getDate() + days);
  }
  return out;
}

function formatDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatProductionDate(
  date: Date,
  options?: { useUtc?: boolean },
): string {
  const useUtc = options?.useUtc ?? false;
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = useUtc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = useUtc ? date.getUTCDate() : date.getDate();
  return `${year}-${formatDatePart(month)}-${formatDatePart(day)}`;
}

export function parseProductionDate(
  productionDate: string,
  options?: { useUtc?: boolean },
): Date {
  const useUtc = options?.useUtc ?? false;
  const [year, month, day] = productionDate.split("-").map(Number);
  return useUtc
    ? new Date(Date.UTC(year, month - 1, day))
    : new Date(year, month - 1, day);
}

export function getShiftWindows(shift: ShiftName): ShiftWindow {
  const cfg = SHIFT_CONFIG[shift];
  const totalClockMinutes = (cfg.endHour - cfg.startHour) * 60;
  const breakMinutes = cfg.breakWindows.reduce(
    (sum, current) => sum + (current.end - current.start) * 60,
    0,
  );
  return {
    ...cfg,
    totalClockMinutes,
    totalWorkMinutes: totalClockMinutes - breakMinutes,
  };
}

function getDecimalHours(now: Date, useUtc: boolean): number {
  const hours = useUtc ? now.getUTCHours() : now.getHours();
  const minutes = useUtc ? now.getUTCMinutes() : now.getMinutes();
  const seconds = useUtc ? now.getUTCSeconds() : now.getSeconds();
  return hours + minutes / 60 + seconds / 3600;
}

export function getProductionDateForTime(
  now: Date,
  options?: { useUtc?: boolean },
): string {
  const useUtc = options?.useUtc ?? false;
  const decimalHour = getDecimalHours(now, useUtc);
  const baseDate = decimalHour < DAY_START_HOUR ? shiftDate(now, -1, useUtc) : now;
  return formatProductionDate(baseDate, { useUtc });
}

export function getShiftContext(
  shift: ShiftName,
  now: Date,
  options?: { useUtc?: boolean; productionDate?: string },
): ShiftContext {
  const useUtc = options?.useUtc ?? false;
  const productionDate =
    options?.productionDate ?? getProductionDateForTime(now, { useUtc });
  const baseDate = parseProductionDate(productionDate, { useUtc });
  const win = getShiftWindows(shift);
  const shiftStart = createDateAt(baseDate, win.startHour, useUtc);
  const shiftEnd = createDateAt(baseDate, win.endHour, useUtc);
  const totalHours = win.totalClockMinutes / 60;
  const elapsedMs = now.getTime() - shiftStart.getTime();
  const elapsedHours = Math.max(
    0,
    Math.min(totalHours, elapsedMs / 3_600_000),
  );
  const remainingHours = Math.max(0, totalHours - elapsedHours);
  const isActive = now >= shiftStart && now < shiftEnd;

  return {
    shift,
    productionDate,
    contextKey: `${productionDate}:${shift}`,
    shiftStart,
    shiftEnd,
    currentTime: now,
    elapsedHours,
    remainingHours,
    totalHours,
    elapsedFraction: totalHours > 0 ? elapsedHours / totalHours : 0,
    isActive,
    isHandoffGap: false,
  };
}

export function getShiftForTime(
  now: Date,
  options?: { useUtc?: boolean },
): ShiftName | null {
  const useUtc = options?.useUtc ?? false;
  const productionDate = getProductionDateForTime(now, { useUtc });
  const dayContext = getShiftContext("day", now, { useUtc, productionDate });
  if (dayContext.isActive) return "day";
  const nightContext = getShiftContext("night", now, { useUtc, productionDate });
  if (nightContext.isActive) return "night";
  return null;
}

export function getCurrentShiftContext(
  now: Date,
  options?: { useUtc?: boolean },
): ShiftContext | null {
  const useUtc = options?.useUtc ?? false;
  const currentShift = getShiftForTime(now, { useUtc });
  if (!currentShift) return null;
  return getShiftContext(currentShift, now, { useUtc });
}

export function getNextShift(shift: ShiftName): ShiftName {
  return shift === "day" ? "night" : "day";
}

export function getShiftProgress(
  shift: ShiftName,
  now: Date,
  options?: { useUtc?: boolean; productionDate?: string },
): ShiftProgress {
  const context = getShiftContext(shift, now, options);
  return {
    elapsedHours: context.elapsedHours,
    remainingHours: context.remainingHours,
    totalHours: context.totalHours,
    elapsedFraction: context.elapsedFraction,
  };
}

export function formatShiftTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
