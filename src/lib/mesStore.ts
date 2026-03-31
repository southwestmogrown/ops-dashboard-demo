/**
 * Server-side MES store.
 * All state is persisted to Turso (libSQL) via db.ts — survives cold starts.
 * In-memory copies are kept for API latency; every mutation is write-through to the DB.
 * All exports are async to accommodate the async db layer.
 *
 * Cache is stored on globalThis so it survives Next.js HMR in dev mode
 * and is shared across all module evaluations (turbopack can re-evaluate
 * route modules independently).
 */
import type {
  AdminLineConfig,
  ChangeoverEvent,
  LineComments,
  LineSchedule,
  LineState,
  ScanEvent,
} from "./mesTypes";
import type { NewScrapEntry, ScrapEntry } from "./reworkTypes";
import type { DowntimeEntry } from "./downtimeTypes";
import { getShiftWindows } from "./shiftTime";
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
  dbResetSimulationData,
  getSerialCounter,
  setSerialCounter,
  dbInsertDowntime,
  dbGetAllDowntimeEntries,
  dbCloseDowntime,
  dbInsertChangeover,
  dbGetAllChangeovers,
} from "./db";

// ── Cache shape ──────────────────────────────────────────────────────────────

interface MesCache {
  queues: Record<string, LineSchedule[]>;
  scanLog: ScanEvent[];
  adminConfig: Record<string, AdminLineConfig>;
  comments: Record<string, LineComments>;
  scrapLog: ScrapEntry[];
  scrapSerial: number;
  downtimeLog: DowntimeEntry[];
  downtimeSerial: number;
  changeoverLog: ChangeoverEvent[];
  changeoverSerial: number;
  simClock: Date | null;
  simRunning: boolean;
  simSpeed: number;
  unitCarryover: Record<string, number>;
  changeoverRemaining: Record<string, number>;
  failureAccumulator: Record<string, number>;
  repairRemaining: Record<string, number>;
  initialized: boolean;
  initPromise: Promise<void> | null;
}

// ── globalThis singleton (survives HMR + shared across module evals) ─────────

const _G = globalThis as unknown as { __mes_cache__?: MesCache };

function _c(): MesCache {
  if (!_G.__mes_cache__) {
    _G.__mes_cache__ = {
      queues: {},
      scanLog: [],
      adminConfig: {},
      comments: {},
      scrapLog: [],
      scrapSerial: 0,
      downtimeLog: [],
      downtimeSerial: 0,
      changeoverLog: [],
      changeoverSerial: 0,
      simClock: null,
      simRunning: false,
      simSpeed: 60,
      unitCarryover: {},
      changeoverRemaining: {},
      failureAccumulator: {},
      repairRemaining: {},
      initialized: false,
      initPromise: null,
    };
  }
  return _G.__mes_cache__!;
}

/** Default MTBF in hours per value stream. */
const MTBF_VS1 = 4;
const MTBF_VS2 = 5;

async function _hydrateFromDb(): Promise<void> {
  const c = _c();

  const [
    allScans,
    allQueues,
    allConfig,
    allComments,
    allScrap,
    sim,
    allDowntime,
    allChangeovers,
    scrapSerial,
    downtimeSerial,
    changeoverSerial,
  ] = await Promise.all([
    dbGetAllScans(),
    dbGetAllQueues(),
    dbGetAllAdminConfig(),
    dbGetAllComments(),
    dbGetAllScrapEntries(),
    dbGetSimClock(),
    dbGetAllDowntimeEntries(),
    dbGetAllChangeovers(),
    getSerialCounter("scrap_serial"),
    getSerialCounter("downtime_serial"),
    getSerialCounter("changeover_serial"),
  ]);

  c.scanLog = allScans;
  c.queues = allQueues;
  c.adminConfig = allConfig;
  c.comments = allComments;
  c.scrapLog = allScrap;
  c.scrapSerial = scrapSerial;
  c.downtimeLog = allDowntime;
  c.downtimeSerial = downtimeSerial;
  c.changeoverLog = allChangeovers;
  c.changeoverSerial = changeoverSerial;
  c.simClock = sim.clock;
  c.simRunning = sim.running;
  c.simSpeed = sim.speed;
}

async function _doInit(): Promise<void> {
  const c = _c();
  await runMigrations();
  await _hydrateFromDb();

  c.initialized = true;
}

async function ensureInit(): Promise<void> {
  const c = _c();
  if (c.initialized) return;
  if (c.initPromise) return c.initPromise;
  c.initPromise = _doInit();
  return c.initPromise;
}

export async function refreshCacheFromDb(): Promise<void> {
  await ensureInit();
  await _hydrateFromDb();
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

async function bumpScrapSerial(): Promise<string> {
  const c = _c();
  c.scrapSerial += 1;
  await setSerialCounter("scrap_serial", c.scrapSerial);
  return `SCR-${String(c.scrapSerial).padStart(3, "0")}`;
}

async function bumpDowntimeSerial(): Promise<string> {
  const c = _c();
  c.downtimeSerial += 1;
  await setSerialCounter("downtime_serial", c.downtimeSerial);
  return `DT-${String(c.downtimeSerial).padStart(3, "0")}`;
}

async function bumpMesSerial(): Promise<string> {
  const current = await getSerialCounter("mes_serial");
  const next = current + 1;
  await setSerialCounter("mes_serial", next);
  return `BK${String(next).padStart(7, "0")}`;
}

async function bumpChangeoverSerial(): Promise<string> {
  const c = _c();
  c.changeoverSerial += 1;
  await setSerialCounter("changeover_serial", c.changeoverSerial);
  return `CHG-${String(c.changeoverSerial).padStart(3, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shiftForHour(hour: number): "day" | "night" {
  return hour >= 6 && hour < 18 ? "day" : "night";
}

async function advanceQueue(lineId: string): Promise<void> {
  const c = _c();
  const queue = c.queues[lineId];
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

export async function setSchedule(
  lineId: string,
  schedule: LineSchedule,
): Promise<void> {
  await ensureInit();
  const c = _c();
  const queue = [{ ...schedule, items: schedule.items.map((i) => ({ ...i })) }];
  c.queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
}

export async function enqueueSchedule(
  lineId: string,
  schedule: LineSchedule,
): Promise<void> {
  await ensureInit();
  const c = _c();
  if (!c.queues[lineId]) c.queues[lineId] = [];
  const queue = [
    ...c.queues[lineId],
    { ...schedule, items: schedule.items.map((i) => ({ ...i })) },
  ];
  c.queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
}

export async function getSchedule(
  lineId: string,
): Promise<LineSchedule | undefined> {
  await ensureInit();
  return _c().queues[lineId]?.[0];
}

export async function clearLine(lineId: string): Promise<void> {
  await ensureInit();
  delete _c().queues[lineId];
  await dbDeleteQueue(lineId);
}

export async function removeFromQueue(
  lineId: string,
  index: number,
): Promise<boolean> {
  await ensureInit();
  const c = _c();
  const queue = c.queues[lineId];
  if (!queue || index < 1 || index >= queue.length) return false;
  queue.splice(index, 1);
  c.queues[lineId] = queue;
  await dbSetQueue(lineId, queue);
  return true;
}

export async function skipOrder(
  lineId: string,
  model: string,
): Promise<boolean> {
  await ensureInit();
  const c = _c();
  const queue = c.queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && !it.skipped);
  if (!item) return false;
  item.skipped = true;
  await dbSetQueue(lineId, queue);
  return true;
}

export async function unskipOrder(
  lineId: string,
  model: string,
): Promise<boolean> {
  await ensureInit();
  const c = _c();
  const queue = c.queues[lineId];
  if (!queue || queue.length === 0) return false;
  const item = queue[0].items.find((it) => it.model === model && it.skipped);
  if (!item) return false;
  item.skipped = false;
  await dbSetQueue(lineId, queue);
  return true;
}

// ── Simulation ────────────────────────────────────────────────────────────────

export async function tickLine(
  lineId: string,
  units: number,
  now?: Date,
): Promise<void> {
  await ensureInit();
  const c = _c();
  const effectiveNow =
    c.simRunning && c.simClock ? c.simClock : (now ?? new Date());
  const simMinsPerTick = c.simSpeed / 60;
  const simHoursPerTick = c.simSpeed / 3600;

  if (!c.changeoverRemaining[lineId]) c.changeoverRemaining[lineId] = 0;
  if (!c.failureAccumulator[lineId]) c.failureAccumulator[lineId] = 0;
  if (c.repairRemaining[lineId] === undefined) c.repairRemaining[lineId] = 0;

  // M17.7 — equipment failure: line is down during repair
  if (c.repairRemaining[lineId] > 0) {
    c.repairRemaining[lineId] = Math.max(
      0,
      c.repairRemaining[lineId] - simMinsPerTick,
    );
    return;
  }

  c.failureAccumulator[lineId] += simHoursPerTick;
  const isVS2 = lineId.toLowerCase().includes("vs2");
  const mtbf = isVS2 ? MTBF_VS2 : MTBF_VS1;

  if (c.failureAccumulator[lineId] >= mtbf) {
    c.failureAccumulator[lineId] = 0;
    c.repairRemaining[lineId] = 10 + Math.random() * 20;
    return;
  }

  // M17.2 — changeover: line is paused between orders
  if (c.changeoverRemaining[lineId] > 0) {
    c.changeoverRemaining[lineId] = Math.max(
      0,
      c.changeoverRemaining[lineId] - simMinsPerTick,
    );
    return;
  }

  await advanceQueue(lineId);
  const queue = c.queues[lineId];
  if (!queue || queue.length === 0) return;

  const schedule = queue[0];
  const shift = shiftForHour(effectiveNow.getUTCHours());

  const firstIncomplete = schedule.items.find(
    (it) => !it.skipped && it.completed < it.qty,
  );
  const orderWillComplete =
    firstIncomplete !== undefined &&
    firstIncomplete.completed + units >= firstIncomplete.qty;

  let remaining = units;
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
      c.scanLog.push(event);
    }
  }

  await dbSetQueue(lineId, queue);
  await dbInsertScansBatch(newEvents);

  if (orderWillComplete) {
    const nextIncomplete = schedule.items.find(
      (it) => !it.skipped && it.completed < it.qty,
    );
    if (
      firstIncomplete?.model &&
      nextIncomplete &&
      nextIncomplete.model !== firstIncomplete.model
    ) {
      const changeover: ChangeoverEvent = {
        id: await bumpChangeoverSerial(),
        timestamp: effectiveNow.toISOString(),
        lineId,
        shift,
        completedModel: firstIncomplete.model,
        nextModel: nextIncomplete.model,
      };
      c.changeoverLog.push(changeover);
      await dbInsertChangeover(changeover);
    }

    const totalRemaining = schedule.items
      .filter((it) => !it.skipped)
      .reduce((sum, it) => sum + Math.max(0, it.qty - it.completed), 0);
    if (totalRemaining > 0) {
      c.changeoverRemaining[lineId] = 15 + Math.random() * 30;
    }
  }
}

// ── State derivation ──────────────────────────────────────────────────────────

export async function getLineState(lineId: string): Promise<LineState> {
  await ensureInit();
  const c = _c();
  await advanceQueue(lineId);
  const queue = c.queues[lineId] ?? [];
  const schedule = queue[0] ?? null;
  const queuedCount = Math.max(0, queue.length - 1);

  const lineScans = c.scanLog.filter((s) => s.lineId === lineId);
  const lineChangeovers = c.changeoverLog.filter((e) => e.lineId === lineId);

  const hourlyOutput: Record<string, number> = {};
  for (const scan of lineScans) {
    const h = new Date(scan.timestamp).getUTCHours();
    const key = `${String(h).padStart(2, "0")}:00`;
    hourlyOutput[key] = (hourlyOutput[key] ?? 0) + 1;
  }

  const totalOutput = lineScans.length;

  const hourlyChangeovers: Record<string, number> = {};
  for (const event of lineChangeovers) {
    const h = new Date(event.timestamp).getUTCHours();
    const key = `${String(h).padStart(2, "0")}:00`;
    hourlyChangeovers[key] = (hourlyChangeovers[key] ?? 0) + 1;
  }

  let currentOrder: string | null = null;
  let remainingOnOrder = 0;
  let completedOrders = 0;

  if (schedule) {
    completedOrders = schedule.items.filter(
      (it) => it.completed >= it.qty,
    ).length;
    const incomplete = schedule.items.find(
      (it) => !it.skipped && it.completed < it.qty,
    );
    if (incomplete) {
      currentOrder = incomplete.model;
      remainingOnOrder = incomplete.qty - incomplete.completed;
    } else if (schedule.items.some((it) => !it.skipped)) {
      const lastActive = [...schedule.items]
        .reverse()
        .find((it) => !it.skipped);
      currentOrder = lastActive?.model ?? null;
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
    lineId,
    schedule,
    totalOutput,
    currentOrder,
    remainingOnOrder,
    remainingOnRunSheet,
    completedOrders,
    queuedCount,
    queue: queue.slice(1),
    hourlyOutput,
    hourlyChangeovers,
    skippedItems,
    changeoverRemaining: c.changeoverRemaining[lineId] ?? 0,
    repairRemaining: c.repairRemaining[lineId] ?? 0,
  };
}

export async function getAllLineStates(): Promise<LineState[]> {
  await ensureInit();
  const c = _c();
  const allIds = new Set([
    ...Object.keys(c.queues),
    ...c.scanLog.map((s) => s.lineId),
    ...c.changeoverLog.map((e) => e.lineId),
  ]);
  return Promise.all(Array.from(allIds).map(getLineState));
}

export async function getOutputForLine(lineId: string): Promise<number> {
  await ensureInit();
  return _c().scanLog.filter((s) => s.lineId === lineId).length;
}

// ── Admin config ──────────────────────────────────────────────────────────────

export async function setAdminConfig(
  lineId: string,
  config: AdminLineConfig,
): Promise<void> {
  await ensureInit();
  const c = _c();
  const merged = { ...c.adminConfig[lineId], ...config };
  c.adminConfig[lineId] = merged;
  await dbSetAdminConfig(lineId, merged);
}

export async function getAdminConfig(lineId: string): Promise<AdminLineConfig> {
  await ensureInit();
  return _c().adminConfig[lineId] ?? {};
}

export async function getAllAdminConfig(): Promise<
  Record<string, AdminLineConfig>
> {
  await ensureInit();
  return { ..._c().adminConfig };
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getLineComments(lineId: string): Promise<LineComments> {
  await ensureInit();
  return _c().comments[lineId] ?? {};
}

export async function setLineComment(
  lineId: string,
  hour: string,
  comment: string,
): Promise<void> {
  await ensureInit();
  const c = _c();
  if (!c.comments[lineId]) c.comments[lineId] = {};
  if (comment.trim() === "") {
    delete c.comments[lineId][hour];
    await dbDeleteComment(lineId, hour);
  } else {
    c.comments[lineId][hour] = comment.trim();
    await dbSetComment(lineId, hour, comment.trim());
  }
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export async function addScrapEntry(entry: NewScrapEntry): Promise<ScrapEntry> {
  await ensureInit();
  const c = _c();
  const full = {
    ...entry,
    id: await bumpScrapSerial(),
    timestamp: new Date().toISOString(),
  } as ScrapEntry;
  c.scrapLog.push(full);
  await dbInsertScrap(full);
  return full;
}

export async function getScrapEntries(
  lineId: string,
  shift: "day" | "night",
): Promise<ScrapEntry[]> {
  await ensureInit();
  return _c().scrapLog.filter((e) => e.lineId === lineId && e.shift === shift);
}

export async function getAllScrapEntries(
  shift: "day" | "night",
): Promise<ScrapEntry[]> {
  await ensureInit();
  return _c().scrapLog.filter((e) => e.shift === shift);
}

export async function getScrapStats(lineId: string, shift: "day" | "night") {
  await ensureInit();
  const entries = (await getScrapEntries(lineId, shift)).filter(
    (e) => !e.voidReason,
  );
  return {
    kickedLids: entries.filter((e) => e.kind === "kicked-lid").length,
    scrappedPanels: entries.filter((e) => e.kind === "scrapped-panel").length,
    totalBoughtIn: entries.filter((e) => e.boughtIn).length,
  };
}

export async function getKickedLidsForLineShift(
  lineId: string,
  shift: "day" | "night",
): Promise<number> {
  await ensureInit();
  return dbGetKickedLids(lineId, shift);
}

export async function voidScrapEntry(
  id: string,
  voidReason: string,
): Promise<boolean> {
  await ensureInit();
  const entry = _c().scrapLog.find((e) => e.id === id);
  if (!entry) return false;
  (entry as unknown as Record<string, unknown>).voidReason = voidReason;
  await dbVoidScrapEntry(id, voidReason);
  return true;
}

export async function updateScrapEntry(
  id: string,
  updates: {
    model?: string;
    panel?: string;
    damageType?: string;
    boughtIn?: boolean;
  },
): Promise<ScrapEntry | null> {
  await ensureInit();
  const entry = _c().scrapLog.find((e) => e.id === id);
  if (!entry) return null;
  if (updates.model)
    (entry as unknown as Record<string, unknown>).model = updates.model;
  if (updates.panel)
    (entry as unknown as Record<string, unknown>).panel = updates.panel;
  if (updates.damageType)
    (entry as unknown as Record<string, unknown>).damageType =
      updates.damageType;
  if (updates.boughtIn !== undefined)
    (entry as unknown as Record<string, unknown>).boughtIn = updates.boughtIn;
  await dbUpdateScrapEntry(id, updates);
  return entry;
}

// ── Downtime log ──────────────────────────────────────────────────────────────

export async function addDowntimeEntry(
  entry: Omit<DowntimeEntry, "id">,
): Promise<DowntimeEntry> {
  await ensureInit();
  const c = _c();
  const full: DowntimeEntry = { ...entry, id: await bumpDowntimeSerial() };
  c.downtimeLog.push(full);
  await dbInsertDowntime(full);
  return full;
}

export async function getDowntimeEntries(
  lineId: string,
  shift: "day" | "night",
): Promise<DowntimeEntry[]> {
  await ensureInit();
  return _c().downtimeLog.filter(
    (e) => e.lineId === lineId && e.shift === shift,
  );
}

export async function getAllDowntimeEntriesForShift(
  shift: "day" | "night",
): Promise<DowntimeEntry[]> {
  await ensureInit();
  return _c().downtimeLog.filter((e) => e.shift === shift);
}

export async function closeDowntimeEntry(
  id: string,
  endTime: string,
): Promise<void> {
  await ensureInit();
  const entry = _c().downtimeLog.find((e) => e.id === id);
  if (entry) {
    entry.endTime = endTime;
    await dbCloseDowntime(id, endTime);
  }
}

export async function getOpenDowntime(
  lineId: string,
): Promise<DowntimeEntry | null> {
  await ensureInit();
  return (
    _c().downtimeLog.find((e) => e.lineId === lineId && e.endTime === null) ??
    null
  );
}

export async function getTotalDowntimeMinutes(
  lineId: string,
  shift: "day" | "night",
): Promise<number> {
  await ensureInit();
  const entries = await getDowntimeEntries(lineId, shift);
  const now = Date.now();
  let total = 0;
  for (const e of entries) {
    const start = new Date(e.startTime).getTime();
    const end = e.endTime ? new Date(e.endTime).getTime() : now;
    total += Math.floor((end - start) / 60000);
  }
  return total;
}

// ── Simulated clock ───────────────────────────────────────────────────────────

export async function getSimClock(): Promise<Date | null> {
  await ensureInit();
  return _c().simClock;
}

export async function setSimClock(time: Date | null): Promise<void> {
  await ensureInit();
  const c = _c();
  c.simClock = time;
  await dbSetSimClock(c.simClock, c.simRunning, c.simSpeed);
}

export async function setSimRunning(
  running: boolean,
  speed?: number,
): Promise<void> {
  await ensureInit();
  const c = _c();
  c.simRunning = running;
  if (speed !== undefined) c.simSpeed = speed;
  await dbSetSimClock(c.simClock, c.simRunning, c.simSpeed);
}

export async function getSimRunning(): Promise<boolean> {
  await ensureInit();
  return _c().simRunning;
}

export async function getSimSpeed(): Promise<number> {
  await ensureInit();
  return _c().simSpeed;
}

export async function claimSimUnits(
  lineId: string,
  requestedUnits: number,
): Promise<number> {
  await ensureInit();
  const c = _c();
  const total = (c.unitCarryover[lineId] ?? 0) + requestedUnits;
  const wholeUnits = Math.floor(total);
  c.unitCarryover[lineId] = total - wholeUnits;
  return wholeUnits;
}

export async function advanceSimClock(): Promise<void> {
  await ensureInit();
  const c = _c();
  if (!c.simRunning || !c.simClock) return;
  c.simClock = new Date(c.simClock.getTime() + c.simSpeed * 1000);

  // Auto-stop when the simulated clock reaches the end of the current shift.
  const h =
    c.simClock.getUTCHours() +
    c.simClock.getUTCMinutes() / 60 +
    c.simClock.getUTCSeconds() / 3600;
  const shiftName = h >= 6 && h < 17 ? "day" : "night";
  const win = getShiftWindows(shiftName);
  // Night shift crosses midnight: normalise hours past midnight to 24+
  const normalized = shiftName === "night" && h < win.startHour ? h + 24 : h;
  if (normalized >= win.endHour) {
    c.simRunning = false;
  }

  await dbSetSimClock(c.simClock, c.simRunning, c.simSpeed);
}

function resetQueueProgress(queue: LineSchedule[]): LineSchedule[] {
  return queue.map((schedule) => ({
    ...schedule,
    items: schedule.items.map((item) => ({
      ...item,
      completed: 0,
    })),
  }));
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export async function resetSimulation(): Promise<void> {
  await ensureInit();
  const c = _c();

  const resetQueues = Object.fromEntries(
    Object.entries(c.queues).map(([lineId, queue]) => [lineId, resetQueueProgress(queue)])
  );

  c.queues = resetQueues;
  c.scanLog = [];
  c.scrapLog = [];
  c.scrapSerial = 0;
  c.downtimeLog = [];
  c.downtimeSerial = 0;
  c.changeoverLog = [];
  c.changeoverSerial = 0;
  c.simClock = null;
  c.simRunning = false;
  c.simSpeed = 60;
  c.unitCarryover = {};
  c.changeoverRemaining = {};
  c.failureAccumulator = {};
  c.repairRemaining = {};

  await dbResetSimulationData();
  await Promise.all(
    Object.entries(resetQueues).map(([lineId, queue]) => dbSetQueue(lineId, queue))
  );
}

export async function resetAll(): Promise<void> {
  const c = _c();
  c.queues = {};
  c.scanLog = [];
  c.comments = {};
  c.scrapLog = [];
  c.scrapSerial = 0;
  c.downtimeLog = [];
  c.downtimeSerial = 0;
  c.changeoverLog = [];
  c.changeoverSerial = 0;
  c.simClock = null;
  c.simRunning = false;
  c.simSpeed = 60;
  c.unitCarryover = {};
  c.changeoverRemaining = {};
  c.failureAccumulator = {};
  c.repairRemaining = {};
  c.initialized = true; // prevent re-init overwriting cleared state
  c.initPromise = null;
  await dbResetAll();
  // Re-load admin config — target/headcount are now NULL so lines fall back to seeded defaults;
  // isRunning flags are preserved so floor layout is unchanged.
  c.adminConfig = await dbGetAllAdminConfig();
}
