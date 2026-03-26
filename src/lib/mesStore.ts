/**
 * Server-side in-memory MES store.
 * Module-level singleton — persists for the lifetime of the Node process.
 * Acceptable for demo use; resets on cold start.
 */
import type { LineSchedule, LineState, RunSheetItem, ScanEvent } from "./mesTypes";

// ── Internal state ────────────────────────────────────────────────────────────

const schedules: Record<string, LineSchedule> = {};
const scanLog: ScanEvent[] = [];
let serialCounter = 610000; // generates BK0610000, BK0610001, …

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextSerial(): string {
  serialCounter += 1;
  return `BK${String(serialCounter).padStart(7, "0")}`;
}

function shiftForHour(hour: number): "day" | "night" {
  // Day shift: 06:00 – 17:59; night shift: 18:00 – 05:59
  return hour >= 6 && hour < 18 ? "day" : "night";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setSchedule(lineId: string, schedule: LineSchedule): void {
  schedules[lineId] = { ...schedule };
}

export function getSchedule(lineId: string): LineSchedule | undefined {
  return schedules[lineId];
}

/**
 * Emit `units` scan events for `lineId`, filling orders FIFO.
 * Scans are timestamped to `now`. Stops if all orders are complete.
 */
export function tickLine(lineId: string, units: number, now = new Date()): void {
  const schedule = schedules[lineId];
  if (!schedule) return;

  const shift = shiftForHour(now.getHours());
  let remaining = units;

  for (const item of schedule.items) {
    if (remaining <= 0) break;
    const capacity = item.qty - item.completed;
    if (capacity <= 0) continue;

    const toAdd = Math.min(remaining, capacity);
    item.completed += toAdd;
    remaining -= toAdd;

    for (let i = 0; i < toAdd; i++) {
      scanLog.push({
        id: nextSerial(),
        timestamp: now.toISOString(),
        lineId,
        shift,
        partNumber: item.model,
      });
    }
  }
}

export function getLineState(lineId: string): LineState {
  const schedule = schedules[lineId] ?? null;
  const lineScans = scanLog.filter((s) => s.lineId === lineId);

  // Hourly bucket: "07:00" → count
  const hourlyOutput: Record<string, number> = {};
  for (const scan of lineScans) {
    const h = new Date(scan.timestamp).getHours();
    const key = `${String(h).padStart(2, "0")}:00`;
    hourlyOutput[key] = (hourlyOutput[key] ?? 0) + 1;
  }

  const totalOutput = lineScans.length;

  // First incomplete item
  let currentOrder: string | null = null;
  let remainingOnOrder = 0;
  if (schedule) {
    const incomplete = schedule.items.find((it) => it.completed < it.qty);
    if (incomplete) {
      currentOrder = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    }
  }

  const remainingOnRunSheet = schedule
    ? Math.max(0, schedule.totalTarget - totalOutput)
    : 0;

  return {
    lineId,
    schedule,
    totalOutput,
    currentOrder,
    remainingOnOrder,
    remainingOnRunSheet,
    hourlyOutput,
  };
}

export function getAllLineStates(): LineState[] {
  const allIds = new Set([
    ...Object.keys(schedules),
    ...scanLog.map((s) => s.lineId),
  ]);
  return Array.from(allIds).map(getLineState);
}

/** Total output across all lines for a given shift (for metrics overlay) */
export function getOutputForLine(lineId: string): number {
  return scanLog.filter((s) => s.lineId === lineId).length;
}

export function resetAll(): void {
  for (const key of Object.keys(schedules)) delete schedules[key];
  scanLog.length = 0;
  serialCounter = 610000;
}
