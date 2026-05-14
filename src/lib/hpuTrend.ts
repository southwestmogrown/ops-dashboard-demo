import { getShiftWindows } from "./shiftTime";
import type { ShiftName } from "./types";

export interface HpuTrendPoint {
  time: string;
  hpu: number | null;
  cumulativeOutput: number;
  elapsedHours: number;
}

const HOURS_PER_DAY = 24;

function roundHpu(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildHpuTrend(
  hourlyOutput: Record<string, number>,
  shift: ShiftName,
  headcount: number,
  elapsedHours: number,
): HpuTrendPoint[] {
  const shiftWindow = getShiftWindows(shift);
  const startHour = Math.ceil(shiftWindow.startHour);
  const endHour = Math.ceil(shiftWindow.endHour);
  const points: HpuTrendPoint[] = [];
  let cumulativeOutput = 0;

  for (let rawHour = startHour; rawHour < endHour; rawHour += 1) {
    const clockHour = rawHour % HOURS_PER_DAY;
    const time = `${String(clockHour).padStart(2, "0")}:00`;
    const bucketStart = rawHour - shiftWindow.startHour;
    const bucketEnd = Math.min(rawHour + 1, shiftWindow.endHour) - shiftWindow.startHour;
    const bucketStarted = elapsedHours > bucketStart;

    if (bucketStarted) {
      cumulativeOutput += hourlyOutput[time] ?? 0;
    }

    const effectiveElapsed = bucketStarted ? Math.min(elapsedHours, bucketEnd) : 0;
    const hpu =
      bucketStarted && cumulativeOutput > 0
        ? roundHpu((headcount * effectiveElapsed) / cumulativeOutput)
        : null;

    points.push({
      time,
      hpu,
      cumulativeOutput,
      elapsedHours: roundHpu(effectiveElapsed),
    });
  }

  return points;
}
