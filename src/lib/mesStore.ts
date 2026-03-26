/**
 * Server-side in-memory MES store.
 * Uses globalThis so state survives Next.js hot reloads in development.
 * Resets on cold start (process restart / Vercel cold invocation) — acceptable for demo.
 *
 * Each line holds a queue of LineSchedules. The first item is the active schedule.
 * When it completes, the queue auto-advances to the next on the following tick.
 */
import type { LineSchedule, LineState, ScanEvent } from "./mesTypes";

export interface AdminLineConfig {
  target?:    number;
  headcount?: number;
}

// ── Persistent global state ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __mesQueues:      Record<string, LineSchedule[]>  | undefined;
  // eslint-disable-next-line no-var
  var __mesScanLog:     ScanEvent[]                     | undefined;
  // eslint-disable-next-line no-var
  var __mesSerial:      number                          | undefined;
  // eslint-disable-next-line no-var
  var __mesAdminConfig: Record<string, AdminLineConfig> | undefined;
}

const queues:      Record<string, LineSchedule[]>  = (globalThis.__mesQueues      ??= {});
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

/**
 * Advance past any fully-completed schedules at the head of the queue,
 * as long as there is at least one more waiting behind it.
 */
function advanceQueue(lineId: string): void {
  const queue = queues[lineId];
  if (!queue || queue.length <= 1) return;
  while (
    queue.length > 1 &&
    queue[0].items.every((it) => it.completed >= it.qty)
  ) {
    queue.shift();
  }
}

// ── Schedule management ───────────────────────────────────────────────────────

/** Replace the entire queue with a single schedule. */
export function setSchedule(lineId: string, schedule: LineSchedule): void {
  queues[lineId] = [{ ...schedule, items: schedule.items.map((i) => ({ ...i })) }];
}

/** Append a schedule to the end of the queue without disturbing the active one. */
export function enqueueSchedule(lineId: string, schedule: LineSchedule): void {
  if (!queues[lineId]) queues[lineId] = [];
  queues[lineId].push({ ...schedule, items: schedule.items.map((i) => ({ ...i })) });
}

export function getSchedule(lineId: string): LineSchedule | undefined {
  return queues[lineId]?.[0];
}

/** Remove all schedules (active + queued) for a line. */
export function clearLine(lineId: string): void {
  delete queues[lineId];
}

/**
 * Remove a queued (non-active) schedule by its position in the queue.
 * index 1 = first queued item (behind the active schedule at index 0).
 * Returns false if out of range or if attempting to remove index 0.
 */
export function removeFromQueue(lineId: string, index: number): boolean {
  const queue = queues[lineId];
  if (!queue || index < 1 || index >= queue.length) return false;
  queue.splice(index, 1);
  return true;
}

// ── Simulation ────────────────────────────────────────────────────────────────

/**
 * Emit `units` scan events for `lineId`, filling orders FIFO.
 * Auto-advances to the next queued schedule when the current one completes.
 */
export function tickLine(lineId: string, units: number, now = new Date()): void {
  advanceQueue(lineId);
  const queue = queues[lineId];
  if (!queue || queue.length === 0) return;

  const schedule = queue[0];
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

// ── State derivation ──────────────────────────────────────────────────────────

export function getLineState(lineId: string): LineState {
  advanceQueue(lineId);
  const queue    = queues[lineId] ?? [];
  const schedule = queue[0] ?? null;
  const queuedCount = Math.max(0, queue.length - 1);

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
      currentOrder = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    } else if (schedule.items.length > 0) {
      currentOrder = schedule.items[schedule.items.length - 1].model;
      remainingOnOrder = 0;
    }
  }

  const remainingOnRunSheet = schedule
    ? Math.max(0, schedule.totalTarget - totalOutput)
    : 0;

  return {
    lineId, schedule, totalOutput,
    currentOrder, remainingOnOrder, remainingOnRunSheet,
    completedOrders, queuedCount,
    queue: queue.slice(1),
    hourlyOutput,
  };
}

export function getAllLineStates(): LineState[] {
  const allIds = new Set([
    ...Object.keys(queues),
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

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetAll(): void {
  for (const key of Object.keys(queues)) delete queues[key];
  scanLog.length = 0;
  globalThis.__mesSerial = 610000;
}
