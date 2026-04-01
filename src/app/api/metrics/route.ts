import { NextRequest, NextResponse } from "next/server";
import { generateMetrics, getDefaultHeadcount, getDefaultTarget } from "@/lib/generateMetrics";
import { ShiftName } from "@/lib/types/core";
import { getOutputForLine, getAdminConfig, getKickedLidsForLineShift, getAllLineStates, getDowntimeEntries, refreshCacheFromDb } from "@/lib/mesStore";
import { getShiftProgress, getShiftWindows } from "@/lib/shiftTime";
import type { TimePoint } from "@/lib/types/core";

export const dynamic = "force-dynamic";

const VALID_SHIFTS: ShiftName[] = ["day", "night"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  await refreshCacheFromDb();

  const { searchParams } = new URL(request.url);
  const shiftParam = searchParams.get("shift");

  if (!shiftParam || !VALID_SHIFTS.includes(shiftParam as ShiftName)) {
    return NextResponse.json(
      { error: "Invalid or missing shift parameter. Use: day, night" },
      { status: 400 }
    );
  }

  const envSeed = process.env.DEMO_SEED;
  const overrideSeed = envSeed ? parseInt(envSeed, 10) : undefined;

  const metrics = generateMetrics(shiftParam as ShiftName, overrideSeed);

  const { elapsedHours, totalHours } = getShiftProgress(shiftParam as ShiftName, new Date());
  const win = getShiftWindows(shiftParam as ShiftName);
  const now = new Date();

  const shiftStart = new Date(now);
  shiftStart.setHours(Math.floor(win.startHour), 0, 0, 0);
  const shiftEnd = new Date(now);
  const endHour = Math.floor(win.endHour);
  const endMin  = Math.round((win.endHour - endHour) * 60);
  shiftEnd.setHours(endHour % 24, endMin, 0, 0);
  if (win.endHour >= 24) shiftEnd.setDate(shiftEnd.getDate() + 1);

  const totalShiftMinutes = totalHours * 60;

  for (const line of metrics.lines) {
    const admin = await getAdminConfig(line.id);
    line.target    = admin.target    ?? getDefaultTarget(line.id);
    line.headcount = admin.headcount ?? getDefaultHeadcount(line.id);
    line.output    = await getOutputForLine(line.id);

    const totalOutput = line.output;
    const kickedLids  = await getKickedLidsForLineShift(line.id, shiftParam as ShiftName);
    line.fpy =
      totalOutput > 0
        ? Math.min(100, Math.round(((totalOutput - kickedLids) / totalOutput) * 1000) / 10)
        : 100;

    if (totalOutput === 0) {
      line.availability = 100;
      line.performance = 100;
      line.quality = 100;
      line.oee = 100;
      line.hpu = 0;
      continue;
    }

    const downtimeEntries = await getDowntimeEntries(line.id, shiftParam as ShiftName);
    let downtimeMinutes = 0;
    for (const entry of downtimeEntries) {
      const entryStart   = new Date(entry.startTime);
      const entryEnd     = entry.endTime ? new Date(entry.endTime) : now;
      const clampedStart = entryStart < shiftStart ? shiftStart : entryStart;
      const clampedEnd   = entryEnd   > shiftEnd   ? shiftEnd   : entryEnd;
      if (clampedEnd > clampedStart) {
        downtimeMinutes += (clampedEnd.getTime() - clampedStart.getTime()) / 60000;
      }
    }

    const uptimeMinutes = totalShiftMinutes - downtimeMinutes;
    const uptimeHours   = uptimeMinutes / 60;
    line.hpu = totalOutput > 0 && uptimeHours > 0
      ? Math.round((line.headcount * uptimeHours) / totalOutput * 100) / 100
      : 0;

    const availability = totalShiftMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((1 - downtimeMinutes / totalShiftMinutes) * 1000) / 10))
      : 100;

    const standardUpH  = line.target / totalHours;
    const actualUpH    = elapsedHours > 0 ? totalOutput / elapsedHours : 0;
    const performance  = standardUpH > 0
      ? Math.min(100, Math.round((actualUpH / standardUpH) * 1000) / 10)
      : 100;

    line.availability = availability;
    line.performance  = performance;
    line.quality      = line.fpy;
    line.oee = Math.round((availability * performance * line.fpy) / 100) / 100;
  }

  const states   = await getAllLineStates();
  const INTERVALS = Math.round(win.totalClockMinutes / 30) + 1; // 22 for a 10.5h shift
  const realTrend: TimePoint[] = [];

  for (let i = 0; i < INTERVALS; i++) {
    const totalMinutes = win.startHour * 60 + i * 30;
    const hours   = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const time    = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    let vs1Output = 0;
    let vs2Output = 0;

    // Accumulate all completed hours up to this point in the shift (cumulative total).
    // For 30-min marks the current full-hour bucket is already completed, so include it.
    // For mid-hour marks we include all hours strictly before the current one.
    const cutoffHourIndex = minutes === 0 ? i / 2 : Math.floor(i / 2); // how many full hours done
    for (const state of states) {
      for (let h = 0; h <= cutoffHourIndex; h++) {
        const shiftHour = Math.floor(win.startHour + h) % 24;
        const hourKey   = `${String(shiftHour).padStart(2, "0")}:00`;
        const hourOutput = state.hourlyOutput?.[hourKey] ?? 0;
        if (state.lineId.startsWith("vs1-"))      vs1Output += hourOutput;
        else if (state.lineId.startsWith("vs2-")) vs2Output += hourOutput;
      }
    }

    realTrend.push({ time, vs1Output, vs2Output });
  }

  const hasMesData = states.some((s) =>
    Object.values(s.hourlyOutput ?? {}).some((v) => v > 0)
  );

  metrics.trend = hasMesData ? realTrend : Array.from({ length: INTERVALS }, (_, i) => {
    const totalMinutes = win.startHour * 60 + i * 30;
    const hours   = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return { time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, vs1Output: 0, vs2Output: 0 };
  });

  return NextResponse.json(metrics);
}
