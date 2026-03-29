/**
 * Server-side MES store.
 * All state is persisted to SQLite via db.ts — survives cold starts and hot reloads.
 * In-memory copies are kept for API latency; every mutation is write-through to the DB.
 */
import type { AdminLineConfig, LineComments, LineSchedule, LineState, ScanEvent } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";
import type { DowntimeEntry } from "./downtimeTypes";
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
  dbUpdateScrapEntry,
  dbVoidScrapEntry,
  dbGetSimClock,
  dbSetSimClock,
  dbResetAll,
  getSerialCounter,
  setSerialCounter,
  dbInsertDowntime,
  dbGetAllDowntimeEntries,
  dbCloseDowntime,
  dbGetOpenDowntime,
  dbGetTotalDowntimeMinutes,
} from "./db";

// ── In-memory cache (write-through to DB on every mutation) ────────────────────

let _queues:      Record<string, LineSchedule[]> = {};
let _scanLog:     ScanEvent[]                   = [];
let _adminConfig: Record<string, AdminLineConfig> = {};
let _comments:    Record<string, LineComments>   = {};
let _scrapLog:    ScrapEntry[]                 = [];
let _scrapSerial: number                        = 0;
let _downtimeLog:  DowntimeEntry[]               = [];
let _downtimeSerial: number                      = 0;
let _simClock:   Date | null                   = null;
let _simRunning: boolean                        = false;
let _simSpeed:   number                        = 60;

// M17.2 — per-line changeover minutes remaining (transient sim state)
let _changeoverRemaining: Record<string, number> = {};

// M17.7 — per-line equipment failure state (transient sim state)
let _failureAccumulator: Record<string, number>  = {}; // hours accumulated toward next failure
let _repairRemaining:    Record<string, number>  = {}; // minutes of active repair, line is down

/** Default MTBF in hours per value stream. Override via admin config when needed. */
const MTBF_VS1 = 4; // VS1/folding
const MTBF_VS2 = 5; // VS2/revolver

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
  _downtimeLog    = dbGetAllDowntimeEntries();
  _downtimeSerial = getSerialCounter("downtime_serial");
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

function bumpDowntimeSerial(): string {
  _downtimeSerial += 1;
  setSerialCounter("downtime_serial", _downtimeSerial);
  return `DT-${String(_downtimeSerial).padStart(3, "0")}`;
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
 *
 * M17.2 — pauses output during changeover time (order-to-order gap).
 * M17.7 — equipment failure model: accumulates damage hours, triggers random
 * failures with a repair window before resuming.
 */
export function tickLine(lineId: string, units: number, now?: Date): void {
  ensureInit();
  const effectiveNow = _simRunning && _simClock ? _simClock : now ?? new Date();
  const simMinsPerTick  = _simSpeed / 60;
  const simHoursPerTick = _simSpeed / 3600;

  // Initialise accumulators on first use
  if (!_changeoverRemaining[lineId]) _changeoverRemaining[lineId] = 0;
  if (!_failureAccumulator[lineId])  _failureAccumulator[lineId]  = 0;
  if (_repairRemaining[lineId] === undefined) _repairRemaining[lineId] = 0;

  // M17.7 — Equipment failure: line is down during repair
  if (_repairRemaining[lineId] > 0) {
    _repairRemaining[lineId] = Math.max(0, _repairRemaining[lineId] - simMinsPerTick);
    return;
  }

  // Accumulate damage toward next failure (M17.7)
  _failureAccumulator[lineId] += simHoursPerTick;
  const isVS2 = lineId.toLowerCase().includes("vs2");
  const mtbf  = isVS2 ? MTBF_VS2 : MTBF_VS1;

  if (_failureAccumulator[lineId] >= mtbf) {
    _failureAccumulator[lineId] = 0;
    _repairRemaining[lineId] = 10 + Math.random() * 20; // 10–30 min random repair
    return;
  }

  // M17.2 — Changeover: line is paused between orders
  if (_changeoverRemaining[lineId] > 0) {
    _changeoverRemaining[lineId] = Math.max(0, _changeoverRemaining[lineId] - simMinsPerTick);
    return;
  }

  // Normal production
  advanceQueue(lineId);
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return;

  const schedule = queue[0];
  const shift    = shiftForHour(effectiveNow.getHours());

  // Detect if the first incomplete order will finish this tick (M17.2 trigger)
  const firstIncomplete = schedule.items.find((it) => !it.skipped && it.completed < it.qty);
  const orderWillComplete = firstIncomplete !== undefined &&
    firstIncomplete.completed + units >= firstIncomplete.qty;

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

  dbSetQueue(lineId, queue);
  dbInsertScansBatch(newEvents);

  // M17.2 — Inject changeover penalty when an order finishes but more remain
  if (orderWillComplete) {
    const totalRemaining = schedule.items
      .filter((it) => !it.skipped)
      .reduce((sum, it) => sum + Math.max(0, it.qty - it.completed), 0);

    if (totalRemaining > 0) {
      _changeoverRemaining[lineId] = 15 + Math.random() * 30; // 15–45 min
    }
  }
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
    changeoverRemaining: _changeoverRemaining[lineId] ?? 0,
    repairRemaining:     _repairRemaining[lineId]    ?? 0,
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

// ── Admin config ─────────────────────────────────────────────────────────────

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

export function getAllScrapEntries(shift: "day" | "night"): ScrapEntry[] {
  ensureInit();
  return _scrapLog.filter((e) => e.shift === shift);
}

export function getScrapStats(lineId: string, shift: "day" | "night") {
  ensureInit();
  const entries = getScrapEntries(lineId, shift).filter((e) => !e.voidReason);
  return {
    kickedLids:    entries.filter((e) => e.kind === "kicked-lid").length,
    scrappedPanels: entries.filter((e) => e.kind === "scrapped-panel").length,
    totalBoughtIn: entries.filter((e) => e.boughtIn).length,
  };
}

export function getKickedLidsForLineShift(lineId: string, shift: "day" | "night"): number {
  ensureInit();
  // Use the DB count directly for accuracy — already excludes voided via IS NULL filter
  return dbGetKickedLids(lineId, shift);
}

/** Void a scrap entry — marks it as corrected; excluded from stats but kept for audit. */
export function voidScrapEntry(id: string, voidReason: string): boolean {
  ensureInit();
  const entry = _scrapLog.find((e) => e.id === id);
  if (!entry) return false;
  (entry as unknown as Record<string, unknown>).voidReason = voidReason;
  dbVoidScrapEntry(id, voidReason);
  return true;
}

/** Update editable fields on a scrap entry. */
export function updateScrapEntry(id: string, updates: {
  model?: string;
  panel?: string;
  damageType?: string;
  boughtIn?: boolean;
}): ScrapEntry | null {
  ensureInit();
  const entry = _scrapLog.find((e) => e.id === id);
  if (!entry) return null;
  if (updates.model)      (entry as unknown as Record<string, unknown>).model      = updates.model;
  if (updates.panel)      (entry as unknown as Record<string, unknown>).panel      = updates.panel;
  if (updates.damageType)(entry as unknown as Record<string, unknown>).damageType = updates.damageType;
  if (updates.boughtIn !== undefined) (entry as unknown as Record<string, unknown>).boughtIn = updates.boughtIn;
  dbUpdateScrapEntry(id, updates);
  return entry;
}

// ── Downtime log ─────────────────────────────────────────────────────────────────

export function addDowntimeEntry(entry: Omit<DowntimeEntry, "id">): DowntimeEntry {
  ensureInit();
  const full: DowntimeEntry = {
    ...entry,
    id: bumpDowntimeSerial(),
  };
  _downtimeLog.push(full);
  dbInsertDowntime(full);
  return full;
}

export function getDowntimeEntries(lineId: string, shift: "day" | "night"): DowntimeEntry[] {
  ensureInit();
  return _downtimeLog.filter((e) => e.lineId === lineId && e.shift === shift);
}

export function getAllDowntimeEntriesForShift(shift: "day" | "night"): DowntimeEntry[] {
  ensureInit();
  return _downtimeLog.filter((e) => e.shift === shift);
}

export function closeDowntimeEntry(id: string, endTime: string): void {
  ensureInit();
  const entry = _downtimeLog.find((e) => e.id === id);
  if (entry) {
    entry.endTime = endTime;
    dbCloseDowntime(id, endTime);
  }
}

export function getOpenDowntime(lineId: string): DowntimeEntry | null {
  ensureInit();
  return _downtimeLog.find((e) => e.lineId === lineId && e.endTime === null) ?? null;
}

export function getTotalDowntimeMinutes(lineId: string, shift: "day" | "night"): number {
  ensureInit();
  const entries = getDowntimeEntries(lineId, shift);
  const now = Date.now();
  let total = 0;
  for (const e of entries) {
    const start = new Date(e.startTime).getTime();
    const end   = e.endTime ? new Date(e.endTime).getTime() : now;
    total += Math.floor((end - start) / 60000);
  }
  return total;
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
  _comments    = {};
  _scrapLog    = [];
  _scrapSerial = 0;
  _downtimeLog    = [];
  _downtimeSerial = 0;
  _simClock    = null;
  _simRunning  = false;
  _simSpeed    = 60;
  _changeoverRemaining   = {};
  _failureAccumulator    = {};
  _repairRemaining      = {};
  _initialized = true; // prevent re-init from overwriting cleared state
  dbResetAll();
  // Re-load admin config from DB so user settings survive the reset
  _adminConfig = dbGetAllAdminConfig();
}
