/**
 * Server-side MES store.
 * All state is persisted to SQLite via db.ts — survives cold starts and hot reloads.
 * In-memory copies are kept for API latency; every mutation is write-through to the DB.
 */
import type { AdminLineConfig, LineComments, LineSchedule, LineState, ScanEvent } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";
import {
  dbGetAllScans,
  dbGetAllQueues,
  dbGetAllAdminConfig,
  dbGetAllComments,
  dbGetAllScrapEntries,
  dbInsertScan,
  dbInsertScansBatch,
  dbSetQueue,
  dbDeleteQueue,
  dbSetAdminConfig,
  dbSetComment,
  dbDeleteComment,
  dbInsertScrap,
  dbGetKickedLids,
  dbGetSimClock,
  dbSetSimClock,
  dbResetAll,
  getSerialCounter,
  setSerialCounter,
} from "./db";

// ── In-memory cache (write-through to DB on every mutation) ────────────────────

let _queues:      Record<string, LineSchedule[]> = {};
let _scanLog:     ScanEvent[]                   = [];
let _adminConfig: Record<string, AdminLineConfig> = {};
let _comments:    Record<string, LineComments>   = {};
let _scrapLog:    ScrapEntry[]                 = [];
let _scrapSerial: number                        = 0;
let _simClock:   Date | null                   = null;
let _simRunning: boolean                        = false;
let _simSpeed:   number                        = 60;

let _initialized = false;

function ensureInit(): void {
  if (_initialized) return;

  // Load from DB into memory
  const allScans    = dbGetAllScans();
  const allQueues   = dbGetAllQueues();
  const allConfig   = dbGetAllAdminConfig();
  const allComments = dbGetAllComments();
  const allScrap    = dbGetAllScrapEntries();
  const sim         = dbGetSimClock();

  _scanLog     = allScans;
  _queues      = allQueues;
  _adminConfig = allConfig;
  _comments    = allComments;
  _scrapLog    = allScrap;
  _scrapSerial = getSerialCounter("scrap_serial");
  _simClock    = sim.clock;
  _simRunning  = sim.running;
  _simSpeed    = sim.speed;

  _initialized = true;
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

function bumpScrapSerial(): string {
  _scrapSerial += 1;
  setSerialCounter("scrap_serial", _scrapSerial);
  return `SCR-${String(_scrapSerial).padStart(3, "0")}`;
}

function bumpMesSerial(): string {
  const current = getSerialCounter("mes_serial");
  const next = current + 1;
  setSerialCounter("mes_serial", next);
  return `BK${String(next).padStart(7, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shiftForHour(hour: number): "day" | "night" {
  return hour >= 6 && hour < 18 ? "day" : "night";
}

function advanceQueue(lineId: string): void {
  const queue = _queues[lineId];
  if (!queue || queue.length <= 1) return;
  while (
    queue.length > 1 &&
    queue[0].items
      .filter((it) => !it.skipped)
      .every((it) => it.completed >= it.qty)
  ) {
    queue.shift();
  }
  dbSetQueue(lineId, queue); // persist after mutation
}

// ── Schedule management ───────────────────────────────────────────────────────

/** Replace the entire queue with a single schedule. */
export function setSchedule(lineId: string, schedule: LineSchedule): void {
  ensureInit();
  const queue = [{ ...schedule, items: schedule.items.map((i) => ({ ...i })) }];
  _queues[lineId] = queue;
  dbSetQueue(lineId, queue);
}

/** Append a schedule to the end of the queue without disturbing the active one. */
export function enqueueSchedule(lineId: string, schedule: LineSchedule): void {
  ensureInit();
  if (!_queues[lineId]) _queues[lineId] = [];
  const queue = [
    ..._queues[lineId],
    { ...schedule, items: schedule.items.map((i) => ({ ...i })) },
  ];
  _queues[lineId] = queue;
  dbSetQueue(lineId, queue);
}

export function getSchedule(lineId: string): LineSchedule | undefined {
  ensureInit();
  return _queues[lineId]?.[0];
}

/** Remove all schedules (active + queued) for a line. */
export function clearLine(lineId: string): void {
  ensureInit();
  delete _queues[lineId];
  dbDeleteQueue(lineId);
}

/**
 * Remove a queued (non-active) schedule by its position in the queue.
 * index 1 = first queued item (behind the active schedule at index 0).
 * Returns false if out of range or if attempting to remove index 0.
 */
export function removeFromQueue(lineId: string, index: number): boolean {
  ensureInit();
  const queue = _queues[lineId];
  if (!queue || index < 1 || index >= queue.length) return false;
  queue.splice(index, 1);
  _queues[lineId] = queue;
  dbSetQueue(lineId, queue);
  return true;
}

/** Skip an order — marks it so tickLine bypasses it. Saved for later. */
export function skipOrder(lineId: string, model: string): boolean {
  ensureInit();
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && !it.skipped);
  if (!item) return false;
  item.skipped = true;
  dbSetQueue(lineId, queue); // persist after mutation
  return true;
}

/** Re-activate a previously skipped order. */
export function unskipOrder(lineId: string, model: string): boolean {
  ensureInit();
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && it.skipped);
  if (!item) return false;
  item.skipped = false;
  dbSetQueue(lineId, queue);
  return true;
}

// ── Simulation ────────────────────────────────────────────────────────────────

/**
 * Emit `units` scan events for `lineId`, filling orders FIFO.
 * Auto-advances to the next queued schedule when the current one completes.
 * Uses simulated clock when active.
 */
export function tickLine(lineId: string, units: number, now?: Date): void {
  ensureInit();
  const effectiveNow = _simRunning && _simClock ? _simClock : now ?? new Date();
  advanceQueue(lineId);
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return;

  const schedule = queue[0];
  const shift    = shiftForHour(effectiveNow.getHours());
  let remaining  = units;
  const newEvents: ScanEvent[] = [];

  for (const item of schedule.items) {
    if (remaining <= 0) break;
    if (item.skipped) continue;
    const capacity = item.qty - item.completed;
    if (capacity <= 0) continue;

    const toAdd = Math.min(remaining, capacity);
    item.completed += toAdd;
    remaining -= toAdd;

    for (let i = 0; i < toAdd; i++) {
      const event: ScanEvent = {
        id: bumpMesSerial(),
        timestamp: effectiveNow.toISOString(),
        lineId,
        shift,
        partNumber: item.model,
      };
      newEvents.push(event);
      _scanLog.push(event);
    }
  }

  // Persist queue state (completed counts may have changed)
  dbSetQueue(lineId, queue);
  // Batch-insert scan events
  dbInsertScansBatch(newEvents);
}

// ── State derivation ──────────────────────────────────────────────────────────

export function getLineState(lineId: string): LineState {
  ensureInit();
  advanceQueue(lineId);
  const queue       = _queues[lineId] ?? [];
  const schedule    = queue[0] ?? null;
  const queuedCount = Math.max(0, queue.length - 1);

  const lineScans = _scanLog.filter((s) => s.lineId === lineId);

  const hourlyOutput: Record<string, number> = {};
  for (const scan of lineScans) {
    const h   = new Date(scan.timestamp).getHours();
    const key = `${String(h).padStart(2, "0")}:00`;
    hourlyOutput[key] = (hourlyOutput[key] ?? 0) + 1;
  }

  const totalOutput = lineScans.length;

  let currentOrder:      string | null = null;
  let remainingOnOrder   = 0;
  let completedOrders    = 0;

  if (schedule) {
    completedOrders = schedule.items.filter((it) => it.completed >= it.qty).length;
    const incomplete = schedule.items.find((it) => !it.skipped && it.completed < it.qty);
    if (incomplete) {
      currentOrder    = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    } else if (schedule.items.some((it) => !it.skipped)) {
      const lastActive = [...schedule.items].reverse().find((it) => !it.skipped);
      currentOrder    = lastActive?.model ?? null;
      remainingOnOrder = 0;
    }
  }

  const remainingOnRunSheet = schedule
    ? Math.max(0, schedule.totalTarget - totalOutput)
    : 0;

  const skippedItems = schedule
    ? schedule.items.filter((it) => it.skipped)
    : [];

  return {
    lineId, schedule, totalOutput,
    currentOrder, remainingOnOrder, remainingOnRunSheet,
    completedOrders, queuedCount,
    queue: queue.slice(1),
    hourlyOutput,
    skippedItems,
  };
}

export function getAllLineStates(): LineState[] {
  ensureInit();
  const allIds = new Set([
    ...Object.keys(_queues),
    ..._scanLog.map((s) => s.lineId),
  ]);
  return Array.from(allIds).map(getLineState);
}

export function getOutputForLine(lineId: string): number {
  ensureInit();
  return _scanLog.filter((s) => s.lineId === lineId).length;
}

// ── Admin config ──────────────────────────────────────────────────────────────

export function setAdminConfig(lineId: string, config: AdminLineConfig): void {
  ensureInit();
  const merged = { ..._adminConfig[lineId], ...config };
  _adminConfig[lineId] = merged;
  dbSetAdminConfig(lineId, merged);
}

export function getAdminConfig(lineId: string): AdminLineConfig {
  ensureInit();
  return _adminConfig[lineId] ?? {};
}

export function getAllAdminConfig(): Record<string, AdminLineConfig> {
  ensureInit();
  return { ..._adminConfig };
}

// ── Comments ───────────────────────────────────────────────────────────────────

export function getLineComments(lineId: string): LineComments {
  ensureInit();
  return _comments[lineId] ?? {};
}

export function setLineComment(lineId: string, hour: string, comment: string): void {
  ensureInit();
  if (!_comments[lineId]) _comments[lineId] = {};
  if (comment.trim() === "") {
    delete _comments[lineId][hour];
    dbDeleteComment(lineId, hour);
  } else {
    _comments[lineId][hour] = comment.trim();
    dbSetComment(lineId, hour, comment.trim());
  }
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export function addScrapEntry(entry: Omit<ScrapEntry, "id" | "timestamp">): ScrapEntry {
  ensureInit();
  const full = {
    ...entry,
    id: bumpScrapSerial(),
    timestamp: new Date().toISOString(),
  } as ScrapEntry;
  _scrapLog.push(full);
  dbInsertScrap(full);
  return full;
}

export function getScrapEntries(lineId: string, shift: "day" | "night"): ScrapEntry[] {
  ensureInit();
  return _scrapLog.filter((e) => e.lineId === lineId && e.shift === shift);
}

export function getScrapStats(lineId: string, shift: "day" | "night") {
  ensureInit();
  const entries = getScrapEntries(lineId, shift);
  return {
    kickedLids:    entries.filter((e) => e.kind === "kicked-lid").length,
    scrappedPanels: entries.filter((e) => e.kind === "scrapped-panel").length,
    totalBoughtIn: entries.filter((e) => e.boughtIn).length,
  };
}

export function getKickedLidsForLineShift(lineId: string, shift: "day" | "night"): number {
  ensureInit();
  // Use the DB count directly for accuracy
  return dbGetKickedLids(lineId, shift);
}

// ── Simulated clock ─────────────────────────────────────────────────────────────

export function getSimClock(): Date | null {
  ensureInit();
  return _simRunning ? _simClock : null;
}

export function setSimClock(time: Date | null): void {
  ensureInit();
  _simClock = time;
  dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

export function setSimRunning(running: boolean, speed?: number): void {
  ensureInit();
  _simRunning = running;
  if (speed !== undefined) _simSpeed = speed;
  dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

export function getSimRunning(): boolean {
  ensureInit();
  return _simRunning;
}

export function getSimSpeed(): number {
  ensureInit();
  return _simSpeed;
}

export function advanceSimClock(): void {
  ensureInit();
  if (!_simRunning || !_simClock) return;
  _simClock = new Date(_simClock.getTime() + _simSpeed * 1000);
  dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetAll(): void {
  _queues      = {};
  _scanLog     = [];
  _adminConfig = {};
  _comments    = {};
  _scrapLog    = [];
  _scrapSerial = 0;
  _simClock    = null;
  _simRunning  = false;
  _simSpeed    = 60;
  _initialized = true; // prevent re-init from overwriting cleared state
  dbResetAll();
}
