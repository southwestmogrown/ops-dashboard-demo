import { NextRequest, NextResponse } from "next/server";
import {
  generateMetrics,
  getDefaultHeadcount,
  getDefaultTarget,
} from "@/lib/generateMetrics";
import {
  getAdminConfig,
  getAllLineStates,
  getDowntimeEntries,
  getKickedLidsForLineShift,
  getOperatingTime,
  getOutputForLineShift,
  refreshCacheFromDb,
} from "@/lib/mesStore";
import { getShiftContext } from "@/lib/shiftTime";
import type { DowntimeEntry } from "@/lib/types/downtime";
import type { TimePoint, ShiftName } from "@/lib/types/core";

export const dynamic = "force-dynamic";

const VALID_SHIFTS: ShiftName[] = ["day", "night"];

/**
 * "baseline" = seeded demo metrics only.
 * "live" = shift-scoped telemetry from MES/simulator state for the active production context.
 */
function determineMetricsMode(args: {
  timeSource: "realtime" | "simulated";
  telemetry: Array<{
    lineId: string;
    output: number;
    kickedLids: number;
    downtimeEntries: DowntimeEntry[];
  }>;
  scheduledLineIds: Set<string>;
}): "baseline" | "live" {
  if (args.timeSource === "simulated") return "live";
  return args.telemetry.some(
    (entry) =>
      entry.output > 0 ||
      entry.kickedLids > 0 ||
      entry.downtimeEntries.length > 0 ||
      args.scheduledLineIds.has(entry.lineId),
  )
    ? "live"
    : "baseline";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await refreshCacheFromDb();

  const { searchParams } = new URL(request.url);
  const shiftParam = searchParams.get("shift");

  if (!shiftParam || !VALID_SHIFTS.includes(shiftParam as ShiftName)) {
    return NextResponse.json(
      { error: "Invalid or missing shift parameter. Use: day, night" },
      { status: 400 },
    );
  }

  const shift = shiftParam as ShiftName;
  const envSeed = process.env.DEMO_SEED;
  const overrideSeed = envSeed ? parseInt(envSeed, 10) : undefined;
  const operatingTime = await getOperatingTime();
  const shiftContext = getShiftContext(shift, operatingTime.now, {
    useUtc: true,
    productionDate: operatingTime.productionDate,
  });

  const metrics = generateMetrics(shift, overrideSeed);
  metrics.generatedAt = shiftContext.currentTime.toISOString();
  metrics.productionDate = shiftContext.productionDate;
  metrics.contextKey = shiftContext.contextKey;
  metrics.timeSource = operatingTime.timeSource;

  const states = await getAllLineStates({
    shift,
    productionDate: shiftContext.productionDate,
  });
  const stateMap = new Map(states.map((state) => [state.lineId, state]));

  const liveTelemetry = await Promise.all(
    metrics.lines.map(async (line) => ({
      lineId: line.id,
      admin: await getAdminConfig(line.id),
      output: await getOutputForLineShift(line.id, shift, shiftContext.productionDate),
      kickedLids: await getKickedLidsForLineShift(
        line.id,
        shift,
        shiftContext.productionDate,
      ),
      downtimeEntries: await getDowntimeEntries(
        line.id,
        shift,
        shiftContext.productionDate,
      ),
    })),
  );
  const telemetryMap = new Map(liveTelemetry.map((entry) => [entry.lineId, entry]));
  const metricsMode = determineMetricsMode({
    timeSource: operatingTime.timeSource,
    telemetry: liveTelemetry,
    scheduledLineIds: new Set(
      states.filter((state) => state.schedule !== null).map((state) => state.lineId),
    ),
  });
  const hasLiveContextData = metricsMode === "live";

  for (const line of metrics.lines) {
    const telemetry = telemetryMap.get(line.id);
    const state = stateMap.get(line.id);
    const output = telemetry?.output ?? 0;
    const kickedLids = telemetry?.kickedLids ?? 0;
    const downtimeEntries = telemetry?.downtimeEntries ?? [];

    line.target = telemetry?.admin.target ?? getDefaultTarget(line.id);
    line.headcount = telemetry?.admin.headcount ?? getDefaultHeadcount(line.id);

    if (!hasLiveContextData || !telemetry) {
      continue;
    }

    line.output = output;
    line.changeovers = state?.totalChangeovers ?? 0;
    line.fpy =
      output > 0
        ? Math.min(
            100,
            Math.round(((output - kickedLids) / output) * 1000) / 10,
          )
        : 100;

    let downtimeMinutes = 0;
    for (const entry of downtimeEntries) {
      const entryStart = new Date(entry.startTime);
      const entryEnd = entry.endTime
        ? new Date(entry.endTime)
        : shiftContext.currentTime;
      const clampedStart =
        entryStart < shiftContext.shiftStart ? shiftContext.shiftStart : entryStart;
      const clampedEnd =
        entryEnd > shiftContext.shiftEnd ? shiftContext.shiftEnd : entryEnd;
      if (clampedEnd > clampedStart) {
        downtimeMinutes += (clampedEnd.getTime() - clampedStart.getTime()) / 60000;
      }
    }

    const availability =
      shiftContext.totalHours > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                (1 -
                  downtimeMinutes / (shiftContext.totalHours * 60)) *
                  1000,
              ) / 10,
            ),
          )
        : 100;
    const actualUpH =
      shiftContext.elapsedHours > 0 ? output / shiftContext.elapsedHours : 0;
    const standardUpH =
      shiftContext.totalHours > 0 ? line.target / shiftContext.totalHours : 0;
    const performance =
      standardUpH > 0
        ? Math.min(100, Math.round((actualUpH / standardUpH) * 1000) / 10)
        : 100;

    line.availability = availability;
    line.performance = performance;
    line.quality = line.fpy;
    line.hpu =
      output > 0 && shiftContext.elapsedHours > 0
        ? Math.round(
            ((line.headcount * shiftContext.elapsedHours) / output) * 100,
          ) / 100
        : 0;
    line.oee =
      output === 0
        ? 1
        : Math.round(
            (availability / 100) *
              (performance / 100) *
              (line.fpy / 100) *
              10000,
          ) / 10000;
  }

  metrics.mode = metricsMode;

  if (!hasLiveContextData) {
    return NextResponse.json(metrics);
  }

  // Two 30-minute buckets per hour, plus one final point so the trend includes
  // both the shift start and the shift end.
  const intervalCount = Math.round(shiftContext.totalHours * 2) + 1;
  const liveTrend: TimePoint[] = [];

  for (let i = 0; i < intervalCount; i += 1) {
    const pointTime = new Date(
      shiftContext.shiftStart.getTime() + i * 30 * 60_000,
    );
    const time = pointTime.toISOString().slice(11, 16);
    let vs1Output = 0;
    let vs2Output = 0;
    const cutoffHourIndex = time.endsWith(":00") ? i / 2 : Math.floor(i / 2);

    for (const state of states) {
      for (let h = 0; h <= cutoffHourIndex; h += 1) {
        const bucketTime = new Date(
          shiftContext.shiftStart.getTime() + h * 60 * 60_000,
        );
        const hourKey = bucketTime.toISOString().slice(11, 16);
        const hourOutput = state.hourlyOutput[hourKey] ?? 0;
        if (state.lineId.startsWith("vs1-")) vs1Output += hourOutput;
        if (state.lineId.startsWith("vs2-")) vs2Output += hourOutput;
      }
    }

    liveTrend.push({ time, vs1Output, vs2Output });
  }

  metrics.trend = liveTrend;
  return NextResponse.json(metrics);
}
