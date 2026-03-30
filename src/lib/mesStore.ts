/**
 * Server-side MES store.
 * All state is persisted to Turso (libSQL) via db.ts — survives cold starts.
 * In-memory copies are kept for API latency; every mutation is write-through to the DB.
 * All exports are async to accommodate the async db layer.
 */
import type { AdminLineConfig, LineComments, LineSchedule, LineState, ScanEvent } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";
import type { DowntimeEntry } from "./downtimeTypes";
import {
  runMigrations,
  dbGetAllScans,
  dbGetAllQueues,
  dbGetAllAdminConfig,
  dbGetAllComments,
  dbGetAllScrapEntries,
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
} from "./db";

// ── In-memory cache (write-through to DB on every mutation) ────────────────────

let _queues:      Record<string, LineSchedule[]>  = {};
let _scanLog:     ScanEvent[]                     = [];
let _adminConfig: Record<string, AdminLineConfig> = {};
let _comments:    Record<string, LineComments>    = {};
let _scrapLog:    ScrapEntry[]                    = [];
let _scrapSerial: number                          = 0;
let _downtimeLog:    DowntimeEntry[]              = [];
let _downtimeSerial: number                       = 0;
let _simClock:   Date | null = null;
let _simRunning: boolean     = false;
let _simSpeed:   number      = 60;

// M17.2 — per-line changeover minutes remaining (transient sim state)
let _changeoverRemaining: Record<string, number> = {};

// M17.7 — per-line equipment failure state (transient sim state)
let _failureAccumulator: Record<string, number> = {};
let _repairRemaining:    Record<string, number> = {};

/** Default MTBF in hours per value stream. */
const MTBF_VS1 = 4;
const MTBF_VS2 = 5;

let _initialized   = false;
let _initPromise: Promise<void> | null = null;

async function _doInit(): Promise<void> {
  await runMigrations();

  const [allScans, allQueues, allConfig, allComments, allScrap, sim, allDowntime, scrapSerial, downtimeSerial] =
    await Promise.all([
      dbGetAllScans(),
      dbGetAllQueues(),
      dbGetAllAdminConfig(),
      dbGetAllComments(),
      dbGetAllScrapEntries(),
      dbGetSimClock(),
      dbGetAllDowntimeEntries(),
      getSerialCounter("scrap_serial"),
      getSerialCounter("downtime_serial"),
    ]);

  _scanLog        = allScans;
  _queues         = allQueues;
  _adminConfig    = allConfig;
  _comments       = allComments;
  _scrapLog       = allScrap;
  _scrapSerial    = scrapSerial;
  _downtimeLog    = allDowntime;
  _downtimeSerial = downtimeSerial;
  _simClock       = sim.clock;
  _simRunning     = sim.running;
  _simSpeed       = sim.speed;

  _initialized = true;
}

async function ensureInit(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise; // dedup concurrent cold-start requests
  _initPromise = _doInit();
  return _initPromise;
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

async function bumpScrapSerial(): Promise<string> {
  _scrapSerial += 1;
  await setSerialCounter("scrap_serial", _scrapSerial);
  return `SCR-${String(_scrapSerial).padStart(3, "0")}`;
}

async function bumpDowntimeSerial(): Promise<string> {
  _downtimeSerial += 1;
  await setSerialCounter("downtime_serial", _downtimeSerial);
  return `DT-${String(_downtimeSerial).padStart(3, "0")}`;
}

async function bumpMesSerial(): Promise<string> {
  const current = await getSerialCounter("mes_serial");
  const next = current + 1;
  await setSerialCounter("mes_serial", next);
  return `BK${String(next).padStart(7, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shiftForHour(hour: number): "day" | "night" {
  return hour >= 6 && hour < 18 ? "day" : "night";
}

async function advanceQueue(lineId: string): Promise<void> {
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
  await dbSetQueue(lineId, queue);
}

// ── Schedule management ───────────────────────────────────────────────────────

export async function setSchedule(lineId: string, schedule: LineSchedule): Promise<void> {
  await ensureInit();
  const queue = [{ ...schedule, items: schedule.items.map((i) => ({ ...i })) }];
  _queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
}

export async function enqueueSchedule(lineId: string, schedule: LineSchedule): Promise<void> {
  await ensureInit();
  if (!_queues[lineId]) _queues[lineId] = [];
  const queue = [
    ..._queues[lineId],
    { ...schedule, items: schedule.items.map((i) => ({ ...i })) },
  ];
  _queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
}

export async function getSchedule(lineId: string): Promise<LineSchedule | undefined> {
  await ensureInit();
  return _queues[lineId]?.[0];
}

export async function clearLine(lineId: string): Promise<void> {
  await ensureInit();
  delete _queues[lineId];
  await dbDeleteQueue(lineId);
}

export async function removeFromQueue(lineId: string, index: number): Promise<boolean> {
  await ensureInit();
  const queue = _queues[lineId];
  if (!queue || index < 1 || index >= queue.length) return false;
  queue.splice(index, 1);
  _queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
  return true;
}

export async function skipOrder(lineId: string, model: string): Promise<boolean> {
  await ensureInit();
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && !it.skipped);
  if (!item) return false;
  item.skipped = true;
  await dbSetQueue(lineId, queue);
  return true;
}

export async function unskipOrder(lineId: string, model: string): Promise<boolean> {
  await ensureInit();
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && it.skipped);
  if (!item) return false;
  item.skipped = false;
  await dbSetQueue(lineId, queue);
  return true;
}

// ── Simulation ────────────────────────────────────────────────────────────────

export async function tickLine(lineId: string, units: number, now?: Date): Promise<void> {
  await ensureInit();
  const effectiveNow    = _simRunning && _simClock ? _simClock : now ?? new Date();
  const simMinsPerTick  = _simSpeed / 60;
  const simHoursPerTick = _simSpeed / 3600;

  if (!_changeoverRemaining[lineId]) _changeoverRemaining[lineId] = 0;
  if (!_failureAccumulator[lineId])  _failureAccumulator[lineId]  = 0;
  if (_repairRemaining[lineId] === undefined) _repairRemaining[lineId] = 0;

  // M17.7 — equipment failure: line is down during repair
  if (_repairRemaining[lineId] > 0) {
    _repairRemaining[lineId] = Math.max(0, _repairRemaining[lineId] - simMinsPerTick);
    return;
  }

  _failureAccumulator[lineId] += simHoursPerTick;
  const isVS2 = lineId.toLowerCase().includes("vs2");
  const mtbf  = isVS2 ? MTBF_VS2 : MTBF_VS1;

  if (_failureAccumulator[lineId] >= mtbf) {
    _failureAccumulator[lineId] = 0;
    _repairRemaining[lineId] = 10 + Math.random() * 20;
    return;
  }

  // M17.2 — changeover: line is paused between orders
  if (_changeoverRemaining[lineId] > 0) {
    _changeoverRemaining[lineId] = Math.max(0, _changeoverRemaining[lineId] - simMinsPerTick);
    return;
  }

  await advanceQueue(lineId);
  const queue = _queues[lineId];
  if (!queue || queue.length === 0) return;

  const schedule = queue[0];
  const shift    = shiftForHour(effectiveNow.getHours());

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
        id: await bumpMesSerial(),
        timestamp: effectiveNow.toISOString(),
        lineId,
        shift,
        partNumber: item.model,
      };
      newEvents.push(event);
      _scanLog.push(event);
    }
  }

  await dbSetQueue(lineId, queue);
  await dbInsertScansBatch(newEvents);

  if (orderWillComplete) {
    const totalRemaining = schedule.items
      .filter((it) => !it.skipped)
      .reduce((sum, it) => sum + Math.max(0, it.qty - it.completed), 0);
    if (totalRemaining > 0) {
      _changeoverRemaining[lineId] = 15 + Math.random() * 30;
    }
  }
}

// ── State derivation ──────────────────────────────────────────────────────────

export async function getLineState(lineId: string): Promise<LineState> {
  await ensureInit();
  await advanceQueue(lineId);
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

  let currentOrder:    string | null = null;
  let remainingOnOrder = 0;
  let completedOrders  = 0;

  if (schedule) {
    completedOrders = schedule.items.filter((it) => it.completed >= it.qty).length;
    const incomplete = schedule.items.find((it) => !it.skipped && it.completed < it.qty);
    if (incomplete) {
      currentOrder     = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    } else if (schedule.items.some((it) => !it.skipped)) {
      const lastActive = [...schedule.items].reverse().find((it) => !it.skipped);
      currentOrder     = lastActive?.model ?? null;
      remainingOnOrder = 0;
    }
  }

  const remainingOnRunSheet = schedule
    ? Math.max(0, schedule.totalTarget - totalOutput)
    : 0;

  const skippedItems = schedule ? schedule.items.filter((it) => it.skipped) : [];

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

export async function getAllLineStates(): Promise<LineState[]> {
  await ensureInit();
  const allIds = new Set([
    ...Object.keys(_queues),
    ..._scanLog.map((s) => s.lineId),
  ]);
  return Promise.all(Array.from(allIds).map(getLineState));
}

export async function getOutputForLine(lineId: string): Promise<number> {
  await ensureInit();
  return _scanLog.filter((s) => s.lineId === lineId).length;
}

// ── Admin config ──────────────────────────────────────────────────────────────

export async function setAdminConfig(lineId: string, config: AdminLineConfig): Promise<void> {
  await ensureInit();
  const merged = { ..._adminConfig[lineId], ...config };
  _adminConfig[lineId] = merged;
  await dbSetAdminConfig(lineId, merged);
}

export async function getAdminConfig(lineId: string): Promise<AdminLineConfig> {
  await ensureInit();
  return _adminConfig[lineId] ?? {};
}

export async function getAllAdminConfig(): Promise<Record<string, AdminLineConfig>> {
  await ensureInit();
  return { ..._adminConfig };
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getLineComments(lineId: string): Promise<LineComments> {
  await ensureInit();
  return _comments[lineId] ?? {};
}

export async function setLineComment(lineId: string, hour: string, comment: string): Promise<void> {
  await ensureInit();
  if (!_comments[lineId]) _comments[lineId] = {};
  if (comment.trim() === "") {
    delete _comments[lineId][hour];
    await dbDeleteComment(lineId, hour);
  } else {
    _comments[lineId][hour] = comment.trim();
    await dbSetComment(lineId, hour, comment.trim());
  }
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export async function addScrapEntry(entry: Omit<ScrapEntry, "id" | "timestamp">): Promise<ScrapEntry> {
  await ensureInit();
  const full = {
    ...entry,
    id:        await bumpScrapSerial(),
    timestamp: new Date().toISOString(),
  } as ScrapEntry;
  _scrapLog.push(full);
  await dbInsertScrap(full);
  return full;
}

export async function getScrapEntries(lineId: string, shift: "day" | "night"): Promise<ScrapEntry[]> {
  await ensureInit();
  return _scrapLog.filter((e) => e.lineId === lineId && e.shift === shift);
}

export async function getAllScrapEntries(shift: "day" | "night"): Promise<ScrapEntry[]> {
  await ensureInit();
  return _scrapLog.filter((e) => e.shift === shift);
}

export async function getScrapStats(lineId: string, shift: "day" | "night") {
  await ensureInit();
  const entries = (await getScrapEntries(lineId, shift)).filter((e) => !e.voidReason);
  return {
    kickedLids:     entries.filter((e) => e.kind === "kicked-lid").length,
    scrappedPanels: entries.filter((e) => e.kind === "scrapped-panel").length,
    totalBoughtIn:  entries.filter((e) => e.boughtIn).length,
  };
}

export async function getKickedLidsForLineShift(lineId: string, shift: "day" | "night"): Promise<number> {
  await ensureInit();
  return dbGetKickedLids(lineId, shift);
}

export async function voidScrapEntry(id: string, voidReason: string): Promise<boolean> {
  await ensureInit();
  const entry = _scrapLog.find((e) => e.id === id);
  if (!entry) return false;
  (entry as unknown as Record<string, unknown>).voidReason = voidReason;
  await dbVoidScrapEntry(id, voidReason);
  return true;
}

export async function updateScrapEntry(id: string, updates: {
  model?: string; panel?: string; damageType?: string; boughtIn?: boolean;
}): Promise<ScrapEntry | null> {
  await ensureInit();
  const entry = _scrapLog.find((e) => e.id === id);
  if (!entry) return null;
  if (updates.model)                   (entry as unknown as Record<string, unknown>).model      = updates.model;
  if (updates.panel)                   (entry as unknown as Record<string, unknown>).panel      = updates.panel;
  if (updates.damageType)              (entry as unknown as Record<string, unknown>).damageType = updates.damageType;
  if (updates.boughtIn !== undefined)  (entry as unknown as Record<string, unknown>).boughtIn   = updates.boughtIn;
  await dbUpdateScrapEntry(id, updates);
  return entry;
}

// ── Downtime log ──────────────────────────────────────────────────────────────

export async function addDowntimeEntry(entry: Omit<DowntimeEntry, "id">): Promise<DowntimeEntry> {
  await ensureInit();
  const full: DowntimeEntry = { ...entry, id: await bumpDowntimeSerial() };
  _downtimeLog.push(full);
  await dbInsertDowntime(full);
  return full;
}

export async function getDowntimeEntries(lineId: string, shift: "day" | "night"): Promise<DowntimeEntry[]> {
  await ensureInit();
  return _downtimeLog.filter((e) => e.lineId === lineId && e.shift === shift);
}

export async function getAllDowntimeEntriesForShift(shift: "day" | "night"): Promise<DowntimeEntry[]> {
  await ensureInit();
  return _downtimeLog.filter((e) => e.shift === shift);
}

export async function closeDowntimeEntry(id: string, endTime: string): Promise<void> {
  await ensureInit();
  const entry = _downtimeLog.find((e) => e.id === id);
  if (entry) {
    entry.endTime = endTime;
    await dbCloseDowntime(id, endTime);
  }
}

export async function getOpenDowntime(lineId: string): Promise<DowntimeEntry | null> {
  await ensureInit();
  return _downtimeLog.find((e) => e.lineId === lineId && e.endTime === null) ?? null;
}

export async function getTotalDowntimeMinutes(lineId: string, shift: "day" | "night"): Promise<number> {
  await ensureInit();
  const entries = await getDowntimeEntries(lineId, shift);
  const now = Date.now();
  let total = 0;
  for (const e of entries) {
    const start = new Date(e.startTime).getTime();
    const end   = e.endTime ? new Date(e.endTime).getTime() : now;
    total += Math.floor((end - start) / 60000);
  }
  return total;
}

// ── Simulated clock ───────────────────────────────────────────────────────────

export async function getSimClock(): Promise<Date | null> {
  await ensureInit();
  return _simRunning ? _simClock : null;
}

export async function setSimClock(time: Date | null): Promise<void> {
  await ensureInit();
  _simClock = time;
  await dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

export async function setSimRunning(running: boolean, speed?: number): Promise<void> {
  await ensureInit();
  _simRunning = running;
  if (speed !== undefined) _simSpeed = speed;
  await dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

export async function getSimRunning(): Promise<boolean> {
  await ensureInit();
  return _simRunning;
}

export async function getSimSpeed(): Promise<number> {
  await ensureInit();
  return _simSpeed;
}

export async function advanceSimClock(): Promise<void> {
  await ensureInit();
  if (!_simRunning || !_simClock) return;
  _simClock = new Date(_simClock.getTime() + _simSpeed * 1000);
  await dbSetSimClock(_simClock, _simRunning, _simSpeed);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export async function resetAll(): Promise<void> {
  _queues         = {};
  _scanLog        = [];
  _comments       = {};
  _scrapLog       = [];
  _scrapSerial    = 0;
  _downtimeLog    = [];
  _downtimeSerial = 0;
  _simClock       = null;
  _simRunning     = false;
  _simSpeed       = 60;
  _changeoverRemaining = {};
  _failureAccumulator  = {};
  _repairRemaining     = {};
  _initialized = true; // prevent re-init overwriting cleared state
  _initPromise = null;
  await dbResetAll();
  // Re-load admin config so user settings survive the reset
  _adminConfig = await dbGetAllAdminConfig();
}
