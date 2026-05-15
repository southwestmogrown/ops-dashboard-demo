import { getDefaultTarget } from "./generateMetrics";
import type { EOSFormData } from "./types/eos";
import type { ShiftMetrics, ShiftName } from "./types/core";
import type { ScrapEntry } from "./types/quality";
import type {
  ShiftHistoryLineRecord,
  ShiftHistoryRecord,
  ShiftHistoryStreamId,
  ShiftHistorySummary,
} from "./types/history";

const VALUE_STREAM_NAMES = {
  vs1: "HFC (Hard Folding Covers)",
  vs2: "HRC (Hard Rolling Cover)",
} as const;

function toShiftName(shift: EOSFormData["shift"] | ShiftName): ShiftName {
  return String(shift).toLowerCase() === "night" ? "night" : "day";
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineKeyToMeta(lineKey: string): {
  vsId: "vs1" | "vs2";
  vsName: string;
  line: string;
  lineId: string;
} {
  const [streamPart = "vs1", ...lineParts] = lineKey.split(":");
  const vsId = streamPart === "vs2" ? "vs2" : "vs1";
  const line = lineParts.join(":") || lineKey;
  const lineNumber = line.match(/Line\s+(\d+)/i)?.[1] ?? "1";

  return {
    vsId,
    vsName: VALUE_STREAM_NAMES[vsId],
    line,
    lineId: `${vsId}-l${lineNumber}`,
  };
}

function calculateAttainment(output: number, target: number): number {
  if (target <= 0) return 0;
  return round((output / target) * 100, 1);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeLines(lines: ShiftHistoryLineRecord[]): ShiftHistorySummary {
  const output = lines.reduce((sum, line) => sum + line.output, 0);
  const target = lines.reduce((sum, line) => sum + line.target, 0);

  return {
    output,
    target,
    attainment: calculateAttainment(output, target),
    avgFpy: round(average(lines.map((line) => line.fpy)), 1),
    avgHpu: round(average(lines.map((line) => line.hpu)), 2),
    avgOee: round(average(lines.map((line) => line.oee)), 1),
    avgAvailability: round(average(lines.map((line) => line.availability)), 1),
    avgPerformance: round(average(lines.map((line) => line.performance)), 1),
    headcount: lines.reduce((sum, line) => sum + line.headcount, 0),
    changeovers: lines.reduce((sum, line) => sum + line.changeovers, 0),
    downtimeMinutes: lines.reduce((sum, line) => sum + line.downtimeMinutes, 0),
    downtimeUnitsLost: lines.reduce(
      (sum, line) => sum + line.downtimeUnitsLost,
      0,
    ),
    downtimeCount: lines.reduce((sum, line) => sum + line.downtimeCount, 0),
    openDowntimeCount: lines.reduce(
      (sum, line) => sum + line.openDowntimeCount,
      0,
    ),
    scrapPanels: lines.reduce((sum, line) => sum + line.scrapPanels, 0),
    kickedLids: lines.reduce((sum, line) => sum + line.kickedLids, 0),
    totalScrap: lines.reduce((sum, line) => sum + line.totalScrap, 0),
    activeLineCount: lines.length,
  };
}

function getVisibleLines(
  record: ShiftHistoryRecord,
  streamId: ShiftHistoryStreamId = "all",
): ShiftHistoryLineRecord[] {
  return record.lines.filter(
    (line) =>
      !line.hidden &&
      !line.omitted &&
      (streamId === "all" || line.vsId === streamId),
  );
}

export function summarizeShiftHistoryRecord(
  record: ShiftHistoryRecord,
  streamId: ShiftHistoryStreamId = "all",
): ShiftHistorySummary {
  return summarizeLines(getVisibleLines(record, streamId));
}

export function sortShiftHistoryRecords(
  records: ShiftHistoryRecord[],
): ShiftHistoryRecord[] {
  return [...records].sort((a, b) => {
    if (a.productionDate !== b.productionDate) {
      return a.productionDate.localeCompare(b.productionDate);
    }
    if (a.shift === b.shift) return 0;
    return a.shift === "day" ? -1 : 1;
  });
}

export function mergeShiftHistoryRecords(
  records: ShiftHistoryRecord[],
  currentRecord?: ShiftHistoryRecord | null,
): ShiftHistoryRecord[] {
  const merged = new Map(records.map((record) => [record.contextKey, record]));
  if (currentRecord) {
    merged.set(currentRecord.contextKey, currentRecord);
  }
  return sortShiftHistoryRecords([...merged.values()]);
}

export function formatShiftHistoryLabel(record: ShiftHistoryRecord): string {
  const shortDate = record.productionDate.slice(5);
  return `${shortDate} ${record.shift === "day" ? "D" : "N"}`;
}

export function buildShiftHistoryRecord(args: {
  formData: EOSFormData;
  hiddenLines: Iterable<string>;
  omittedLines: Iterable<string>;
  metrics?: ShiftMetrics | null;
  scrapEntries?: ScrapEntry[];
  submittedAt: string;
}): ShiftHistoryRecord {
  const hidden = new Set(args.hiddenLines);
  const omitted = new Set(args.omittedLines);
  const shift = toShiftName(args.formData.shift);
  const metricMap = new Map(
    (args.metrics?.lines ?? []).map((line) => [line.id, line]),
  );
  const scrapByLine = new Map<
    string,
    { scrapPanels: number; kickedLids: number }
  >();

  for (const entry of args.scrapEntries ?? []) {
    if (entry.voidReason) continue;
    const current = scrapByLine.get(entry.lineId) ?? {
      scrapPanels: 0,
      kickedLids: 0,
    };

    if (entry.kind === "scrapped-panel") {
      current.scrapPanels += entry.quantity;
    } else {
      current.kickedLids += entry.quantity;
    }

    scrapByLine.set(entry.lineId, current);
  }

  const lines = Object.entries(args.formData.lines).map(
    ([lineKey, lineEntry]): ShiftHistoryLineRecord => {
      const meta = lineKeyToMeta(lineKey);
      const metricsLine = metricMap.get(meta.lineId);
      const scrap = scrapByLine.get(meta.lineId) ?? {
        scrapPanels: 0,
        kickedLids: 0,
      };
      const output = toNumber(lineEntry.output);
      const target = metricsLine?.target ?? getDefaultTarget(meta.lineId);
      const fpy =
        metricsLine?.fpy ??
        (output > 0
          ? round(((output - scrap.kickedLids) / output) * 100, 1)
          : 100);
      const availability = round(metricsLine?.availability ?? 100, 1);
      const performance = round(metricsLine?.performance ?? 100, 1);
      const oee = round(
        typeof metricsLine?.oee === "number"
          ? metricsLine.oee * 100
          : (availability / 100) * (performance / 100) * (fpy / 100) * 100,
        1,
      );

      return {
        lineKey,
        lineId: meta.lineId,
        line: meta.line,
        vsId: meta.vsId,
        vsName: meta.vsName,
        output,
        target,
        attainment: calculateAttainment(output, target),
        fpy,
        hpu: round(metricsLine?.hpu ?? toNumber(lineEntry.hpu), 2),
        headcount: toNumber(lineEntry.headcount),
        changeovers: toNumber(lineEntry.changeovers),
        downtimeMinutes: toNumber(lineEntry.downtimeMinutes),
        downtimeUnitsLost: toNumber(lineEntry.downtimeUnitsLost),
        downtimeCount: toNumber(lineEntry.downtimeCount),
        openDowntimeCount: toNumber(lineEntry.openDowntimeCount),
        latestDowntimeReason: lineEntry.latestDowntimeReason,
        scrapPanels: scrap.scrapPanels,
        kickedLids: scrap.kickedLids,
        totalScrap: scrap.scrapPanels + scrap.kickedLids,
        availability,
        performance,
        oee,
        orderAtPackout: lineEntry.orderAtPackout,
        remainingOnOrder: toNumber(lineEntry.remainingOnOrder),
        remainingOnRunSheet: toNumber(lineEntry.remainingOnRunSheet),
        lineNotes: lineEntry.lineNotes,
        hidden: hidden.has(lineKey),
        omitted: omitted.has(lineKey),
      };
    },
  );

  const visibleLines = lines.filter((line) => !line.hidden && !line.omitted);

  return {
    contextKey: `${args.formData.date}:${shift}`,
    productionDate: args.formData.date,
    shift,
    supervisor: args.formData.supervisor,
    notes: args.formData.notes,
    submittedAt: args.submittedAt,
    lines,
    summary: summarizeLines(visibleLines),
  };
}

function escapeCsv(value: string | number): string {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

export function generateShiftHistoryCSV(
  records: ShiftHistoryRecord[],
  streamId: ShiftHistoryStreamId = "all",
): string {
  const headers = [
    "Date",
    "Shift",
    "Value Stream",
    "Line",
    "Supervisor",
    "Output",
    "Target",
    "Attainment (%)",
    "FPY (%)",
    "HPU",
    "Headcount",
    "Changeovers",
    "Downtime (min)",
    "Downtime Units Lost",
    "Stops",
    "Open Stops",
    "Latest Downtime",
    "Scrapped Panels",
    "Kicked Lids",
    "Total Scrap",
    "Availability (%)",
    "Performance (%)",
    "OEE (%)",
    "Order at Packout",
    "Remaining on Order",
    "Remaining on Run Sheet",
    "Line Notes",
    "Top Issue Today",
    "Resolved During Shift",
    "Open Items Next Shift",
    "Equipment Concerns",
    "General Notes",
    "Submitted At",
  ];

  const rows = sortShiftHistoryRecords(records).flatMap((record) =>
    getVisibleLines(record, streamId).map((line) =>
      [
        record.productionDate,
        record.shift === "day" ? "Day" : "Night",
        line.vsName,
        line.line,
        record.supervisor,
        line.output,
        line.target,
        line.attainment,
        line.fpy,
        line.hpu,
        line.headcount,
        line.changeovers,
        line.downtimeMinutes,
        line.downtimeUnitsLost,
        line.downtimeCount,
        line.openDowntimeCount,
        line.latestDowntimeReason,
        line.scrapPanels,
        line.kickedLids,
        line.totalScrap,
        line.availability,
        line.performance,
        line.oee,
        line.orderAtPackout,
        line.remainingOnOrder,
        line.remainingOnRunSheet,
        line.lineNotes,
        record.notes.topIssueToday,
        record.notes.resolvedDuringShiftEnabled
          ? record.notes.resolvedDuringShift
          : "",
        record.notes.openItemsNextShiftEnabled
          ? record.notes.openItemsNextShift
          : "",
        record.notes.equipmentConcernsEnabled
          ? record.notes.equipmentConcerns
          : "",
        record.notes.generalNotes,
        record.submittedAt,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function isShiftHistoryRecord(value: unknown): value is ShiftHistoryRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    contextKey?: unknown;
    productionDate?: unknown;
    shift?: unknown;
    supervisor?: unknown;
    notes?: unknown;
    submittedAt?: unknown;
    lines?: unknown;
    summary?: unknown;
  };

  return (
    typeof candidate.contextKey === "string" &&
    typeof candidate.productionDate === "string" &&
    (candidate.shift === "day" || candidate.shift === "night") &&
    typeof candidate.supervisor === "string" &&
    typeof candidate.notes === "object" &&
    candidate.notes !== null &&
    typeof candidate.submittedAt === "string" &&
    Array.isArray(candidate.lines) &&
    typeof candidate.summary === "object" &&
    candidate.summary !== null
  );
}
