/**
 * Server-side in-memory MES store.
 * Uses globalThis so state survives Next.js hot reloads in development.
 * Resets on cold start (process restart / Vercel cold invocation) — acceptable for demo.
 */
import type { LineSchedule, LineState, ScanEvent } from "./mesTypes";

export interface AdminLineConfig {
  target?:    number;
  headcount?: number;
}

// ── Persistent global state ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __mesSchedules:   Record<string, LineSchedule>    | undefined;
  // eslint-disable-next-line no-var
  var __mesScanLog:     ScanEvent[]                     | undefined;
  // eslint-disable-next-line no-var
  var __mesSerial:      number                          | undefined;
  // eslint-disable-next-line no-var
  var __mesAdminConfig: Record<string, AdminLineConfig> | undefined;
}

const schedules:   Record<string, LineSchedule>    = (globalThis.__mesSchedules   ??= {});
const scanLog:     ScanEvent[]                     = (globalThis.__mesScanLog     ??= []);
const adminConfig: Record<string, AdminLineConfig> = (globalThis.__mesAdminConfig ??= {});

function getSerial(): number { return (globalThis.__mesSerial ??= 610000); }
function bumpSerial(): string {
  globalThis.__mesSerial = getSerial() + 1;
  return `BK${String(globalThis.__mesSerial).padStart(7, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shiftForHour(hour: number): "day" | "night" {
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
 * Stops when all orders on this line are complete.
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
        id: bumpSerial(),
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

  const hourlyOutput: Record<string, number> = {};
  for (const scan of lineScans) {
    const h = new Date(scan.timestamp).getHours();
    const key = `${String(h).padStart(2, "0")}:00`;
    hourlyOutput[key] = (hourlyOutput[key] ?? 0) + 1;
  }

  const totalOutput = lineScans.length;

  let currentOrder: string | null = null;
  let remainingOnOrder = 0;
  let completedOrders = 0;

  if (schedule) {
    completedOrders = schedule.items.filter((it) => it.completed >= it.qty).length;
    const incomplete = schedule.items.find((it) => it.completed < it.qty);
    if (incomplete) {
      // Sheet still in progress — point to the active order
      currentOrder = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    } else if (schedule.items.length > 0) {
      // Sheet fully complete — use the last order so EOS still has something to show
      currentOrder = schedule.items[schedule.items.length - 1].model;
      remainingOnOrder = 0;
    }
  }

  const remainingOnRunSheet = schedule
    ? Math.max(0, schedule.totalTarget - totalOutput)
    : 0;

  return { lineId, schedule, totalOutput, currentOrder, remainingOnOrder, remainingOnRunSheet, completedOrders, hourlyOutput };
}

export function getAllLineStates(): LineState[] {
  const allIds = new Set([
    ...Object.keys(schedules),
    ...scanLog.map((s) => s.lineId),
  ]);
  return Array.from(allIds).map(getLineState);
}

export function getOutputForLine(lineId: string): number {
  return scanLog.filter((s) => s.lineId === lineId).length;
}

// ── Admin config ──────────────────────────────────────────────────────────────

export function setAdminConfig(lineId: string, config: AdminLineConfig): void {
  adminConfig[lineId] = { ...adminConfig[lineId], ...config };
}

export function getAdminConfig(lineId: string): AdminLineConfig {
  return adminConfig[lineId] ?? {};
}

export function getAllAdminConfig(): Record<string, AdminLineConfig> {
  return { ...adminConfig };
}

export function resetAll(): void {
  for (const key of Object.keys(schedules)) delete schedules[key];
  scanLog.length = 0;
  globalThis.__mesSerial = 610000;
}
