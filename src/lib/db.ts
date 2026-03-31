/**
 * Persistence layer using @libsql/client (Turso / libSQL).
 * Connects to TURSO_DATABASE_URL — cloud-hosted on Vercel, file: locally.
 * All functions are async; state survives cold starts and serverless restarts.
 */

import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import type { AdminLineConfig, LineSchedule, ScanEvent } from "./mesTypes";
import type { LineComments } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";
import type { DowntimeEntry } from "./downtimeTypes";

// ── Client singleton (globalThis survives HMR in dev mode) ───────────────────

const _G = globalThis as unknown as { __turso_client__?: Client };

export function getClient(): Client {
  if (_G.__turso_client__) return _G.__turso_client__;
  _G.__turso_client__ = createClient({
    url:       process.env.TURSO_DATABASE_URL ?? "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _G.__turso_client__;
}

// ── Migrations ────────────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  await getClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      line_id     TEXT NOT NULL,
      shift       TEXT NOT NULL,
      part_number TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scan_line  ON scan_events(line_id);
    CREATE INDEX IF NOT EXISTS idx_scan_shift ON scan_events(line_id, shift);

    CREATE TABLE IF NOT EXISTS line_queues (
      line_id  TEXT PRIMARY KEY,
      queue    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      line_id           TEXT PRIMARY KEY,
      target            REAL,
      headcount         INTEGER,
      is_running        INTEGER DEFAULT 1,
      operator_name     TEXT,
      team_lead_contact TEXT
    );

    CREATE TABLE IF NOT EXISTS line_comments (
      line_id  TEXT NOT NULL,
      hour     TEXT NOT NULL,
      comment  TEXT NOT NULL,
      PRIMARY KEY (line_id, hour)
    );

    CREATE TABLE IF NOT EXISTS scrap_log (
      id          TEXT PRIMARY KEY,
      line_id     TEXT NOT NULL,
      shift       TEXT NOT NULL,
      model       TEXT NOT NULL,
      panel       TEXT NOT NULL,
      damage_type TEXT NOT NULL,
      bought_in   INTEGER DEFAULT 0,
      kind        TEXT NOT NULL,
      extra       TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      void_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scrap_shift ON scrap_log(line_id, shift);

    CREATE TABLE IF NOT EXISTS sim_clock (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      clock   TEXT,
      running INTEGER DEFAULT 0,
      speed   REAL    DEFAULT 60
    );
    INSERT OR IGNORE INTO sim_clock (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS db_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downtime_log (
      id         TEXT PRIMARY KEY,
      line_id    TEXT NOT NULL,
      shift      TEXT NOT NULL,
      reason     TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT,
      units_lost INTEGER DEFAULT 0,
      notes      TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_downtime_shift ON downtime_log(line_id, shift);
  `);
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

export async function getSerialCounter(key: string): Promise<number> {
  const result = await getClient().execute({
    sql:  "SELECT value FROM db_meta WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0] as unknown as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export async function setSerialCounter(key: string, value: number): Promise<void> {
  await getClient().execute({
    sql:  "INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)",
    args: [key, String(value)],
  });
}

// ── Scan events ───────────────────────────────────────────────────────────────

export async function dbInsertScan(event: ScanEvent): Promise<void> {
  await getClient().execute({
    sql:  "INSERT INTO scan_events (id, timestamp, line_id, shift, part_number) VALUES (?, ?, ?, ?, ?)",
    args: [event.id, event.timestamp, event.lineId, event.shift, event.partNumber],
  });
}

export async function dbInsertScansBatch(events: ScanEvent[]): Promise<void> {
  if (events.length === 0) return;
  await getClient().batch(
    events.map((e) => ({
      sql:  "INSERT INTO scan_events (id, timestamp, line_id, shift, part_number) VALUES (?, ?, ?, ?, ?)",
      args: [e.id, e.timestamp, e.lineId, e.shift, e.partNumber],
    })),
    "write"
  );
}

export async function dbGetAllScans(): Promise<ScanEvent[]> {
  const result = await getClient().execute(
    "SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events"
  );
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetScansByLine(lineId: string): Promise<ScanEvent[]> {
  const result = await getClient().execute({
    sql:  "SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events WHERE line_id = ?",
    args: [lineId],
  });
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetScansByLineShift(lineId: string, shift: string): Promise<ScanEvent[]> {
  const result = await getClient().execute({
    sql:  "SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events WHERE line_id = ? AND shift = ?",
    args: [lineId, shift],
  });
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetDistinctScanLineIds(): Promise<string[]> {
  const result = await getClient().execute("SELECT DISTINCT line_id FROM scan_events");
  return (result.rows as unknown as { line_id: string }[]).map((r) => r.line_id);
}

export async function dbClearScans(): Promise<void> {
  await getClient().execute("DELETE FROM scan_events");
}

// ── Queues ────────────────────────────────────────────────────────────────────

export async function dbGetQueue(lineId: string): Promise<LineSchedule[] | undefined> {
  const result = await getClient().execute({
    sql:  "SELECT queue FROM line_queues WHERE line_id = ?",
    args: [lineId],
  });
  const row = result.rows[0] as unknown as { queue: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.queue) as LineSchedule[];
}

export async function dbGetAllQueues(): Promise<Record<string, LineSchedule[]>> {
  const result = await getClient().execute("SELECT line_id, queue FROM line_queues");
  const rows = result.rows as unknown as { line_id: string; queue: string }[];
  const out: Record<string, LineSchedule[]> = {};
  for (const r of rows) out[r.line_id] = JSON.parse(r.queue) as LineSchedule[];
  return out;
}

export async function dbSetQueue(lineId: string, queue: LineSchedule[]): Promise<void> {
  await getClient().execute({
    sql:  "INSERT OR REPLACE INTO line_queues (line_id, queue) VALUES (?, ?)",
    args: [lineId, JSON.stringify(queue)],
  });
}

export async function dbDeleteQueue(lineId: string): Promise<void> {
  await getClient().execute({
    sql:  "DELETE FROM line_queues WHERE line_id = ?",
    args: [lineId],
  });
}

export async function dbClearQueues(): Promise<void> {
  await getClient().execute("DELETE FROM line_queues");
}

// ── Admin config ──────────────────────────────────────────────────────────────

export async function dbGetAdminConfig(lineId: string): Promise<AdminLineConfig> {
  const result = await getClient().execute({
    sql:  "SELECT target, headcount, is_running, operator_name, team_lead_contact FROM admin_config WHERE line_id = ?",
    args: [lineId],
  });
  const row = result.rows[0] as unknown as {
    target: number | null; headcount: number | null; is_running: number | null;
    operator_name: string | null; team_lead_contact: string | null;
  } | undefined;
  if (!row) return {};
  return {
    ...(row.target           !== null ? { target:          row.target }              : {}),
    ...(row.headcount        !== null ? { headcount:       row.headcount }           : {}),
    ...(row.is_running       !== null ? { isRunning:       row.is_running !== 0 }    : {}),
    ...(row.operator_name    !== null ? { supervisorName:  row.operator_name }       : {}),
  };
}

export async function dbGetAllAdminConfig(): Promise<Record<string, AdminLineConfig>> {
  const result = await getClient().execute(
    "SELECT line_id, target, headcount, is_running, operator_name, team_lead_contact FROM admin_config"
  );
  const rows = result.rows as unknown as {
    line_id: string; target: number | null; headcount: number | null;
    is_running: number | null; operator_name: string | null; team_lead_contact: string | null;
  }[];
  const out: Record<string, AdminLineConfig> = {};
  for (const r of rows) {
    out[r.line_id] = {
      ...(r.target           !== null ? { target:          r.target }            : {}),
      ...(r.headcount        !== null ? { headcount:       r.headcount }         : {}),
      ...(r.is_running       !== null ? { isRunning:       r.is_running !== 0 }  : {}),
      ...(r.operator_name    !== null ? { supervisorName:  r.operator_name }     : {}),
    };
  }
  return out;
}

export async function dbSetAdminConfig(lineId: string, config: AdminLineConfig): Promise<void> {
  const existing = await dbGetAdminConfig(lineId);
  const merged = { ...existing, ...config };
  await getClient().execute({
    sql:  "INSERT OR REPLACE INTO admin_config (line_id, target, headcount, is_running, operator_name, team_lead_contact) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      lineId,
      merged.target          ?? null,
      merged.headcount       ?? null,
      merged.isRunning !== undefined ? (merged.isRunning ? 1 : 0) : null,
      merged.supervisorName  ?? null,
      null,
    ],
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function dbGetComments(lineId: string): Promise<LineComments> {
  const result = await getClient().execute({
    sql:  "SELECT hour, comment FROM line_comments WHERE line_id = ?",
    args: [lineId],
  });
  const rows = result.rows as unknown as { hour: string; comment: string }[];
  const out: LineComments = {};
  for (const r of rows) out[r.hour] = r.comment;
  return out;
}

export async function dbGetAllComments(): Promise<Record<string, LineComments>> {
  const result = await getClient().execute("SELECT line_id, hour, comment FROM line_comments");
  const rows = result.rows as unknown as { line_id: string; hour: string; comment: string }[];
  const out: Record<string, LineComments> = {};
  for (const r of rows) {
    if (!out[r.line_id]) out[r.line_id] = {};
    out[r.line_id][r.hour] = r.comment;
  }
  return out;
}

export async function dbSetComment(lineId: string, hour: string, comment: string): Promise<void> {
  await getClient().execute({
    sql:  "INSERT OR REPLACE INTO line_comments (line_id, hour, comment) VALUES (?, ?, ?)",
    args: [lineId, hour, comment],
  });
}

export async function dbDeleteComment(lineId: string, hour: string): Promise<void> {
  await getClient().execute({
    sql:  "DELETE FROM line_comments WHERE line_id = ? AND hour = ?",
    args: [lineId, hour],
  });
}

export async function dbClearComments(): Promise<void> {
  await getClient().execute("DELETE FROM line_comments");
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export async function dbInsertScrap(entry: ScrapEntry): Promise<void> {
  const extra: Record<string, unknown> = {};
  if (entry.kind === "scrapped-panel") {
    extra.stationFound = entry.stationFound;
    extra.howDamaged   = entry.howDamaged;
  } else {
    extra.affectedArea    = entry.affectedArea;
    extra.auditorInitials = entry.auditorInitials;
  }
  await getClient().execute({
    sql: `INSERT INTO scrap_log
            (id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id, entry.lineId, entry.shift, entry.model, entry.panel,
      entry.damageType, entry.boughtIn ? 1 : 0, entry.kind,
      JSON.stringify(extra), entry.timestamp,
    ],
  });
}

type ScrapRow = {
  id: string; line_id: string; shift: "day" | "night"; model: string; panel: string;
  damage_type: string; bought_in: number; kind: string; extra: string;
  timestamp: string; void_reason: string | null;
};

function _parseScrapRow(r: ScrapRow): ScrapEntry {
  const extra      = JSON.parse(r.extra) as Record<string, unknown>;
  const panel      = r.panel as ScrapEntry["panel"];
  const damageType = r.damage_type as ScrapEntry["damageType"];
  if (r.kind === "scrapped-panel") {
    return {
      id: r.id, lineId: r.line_id, shift: r.shift, model: r.model,
      panel, damageType, boughtIn: !!r.bought_in,
      kind: "scrapped-panel", stationFound: String(extra.stationFound ?? ""),
      howDamaged: String(extra.howDamaged ?? ""), timestamp: r.timestamp,
      voidReason: r.void_reason ?? undefined,
    };
  } else {
    return {
      id: r.id, lineId: r.line_id, shift: r.shift, model: r.model,
      panel, damageType, boughtIn: !!r.bought_in,
      kind: "kicked-lid", affectedArea: String(extra.affectedArea ?? "") as "panel" | "extrusion",
      auditorInitials: String(extra.auditorInitials ?? ""), timestamp: r.timestamp,
      voidReason: r.void_reason ?? undefined,
    };
  }
}

export async function dbGetScrapEntries(lineId: string, shift: string): Promise<ScrapEntry[]> {
  const result = await getClient().execute({
    sql: `SELECT id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp, void_reason
          FROM scrap_log WHERE line_id = ? AND shift = ?`,
    args: [lineId, shift],
  });
  return (result.rows as unknown as ScrapRow[]).map(_parseScrapRow);
}

export async function dbGetAllScrapEntries(): Promise<ScrapEntry[]> {
  const result = await getClient().execute(
    "SELECT id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp, void_reason FROM scrap_log"
  );
  return (result.rows as unknown as ScrapRow[]).map(_parseScrapRow);
}

export async function dbGetKickedLids(lineId: string, shift: string): Promise<number> {
  const result = await getClient().execute({
    sql:  "SELECT COUNT(*) AS cnt FROM scrap_log WHERE line_id = ? AND shift = ? AND kind = 'kicked-lid' AND void_reason IS NULL",
    args: [lineId, shift],
  });
  const row = result.rows[0] as unknown as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export async function dbUpdateScrapEntry(id: string, updates: {
  model?: string; panel?: string; damageType?: string; boughtIn?: boolean;
}): Promise<void> {
  const result = await getClient().execute({
    sql:  "SELECT extra, kind FROM scrap_log WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0] as unknown as { extra: string; kind: string } | undefined;
  if (!row) return;
  const extra = JSON.parse(row.extra) as Record<string, unknown>;
  if (updates.model)                     extra["model"]      = updates.model;
  if (updates.panel)                     extra["panel"]      = updates.panel;
  if (updates.damageType)                extra["damageType"] = updates.damageType;
  if (updates.boughtIn !== undefined)    extra["boughtIn"]   = updates.boughtIn;
  await getClient().execute({
    sql: `UPDATE scrap_log
          SET model       = COALESCE(?, model),
              panel       = COALESCE(?, panel),
              damage_type = COALESCE(?, damage_type),
              bought_in   = COALESCE(?, bought_in),
              extra       = ?
          WHERE id = ?`,
    args: [
      updates.model      ?? null,
      updates.panel      ?? null,
      updates.damageType ?? null,
      updates.boughtIn !== undefined ? (updates.boughtIn ? 1 : 0) : null,
      JSON.stringify(extra),
      id,
    ],
  });
}

export async function dbVoidScrapEntry(id: string, voidReason: string): Promise<void> {
  await getClient().execute({
    sql:  "UPDATE scrap_log SET void_reason = ? WHERE id = ?",
    args: [voidReason, id],
  });
}

export async function dbClearScrap(): Promise<void> {
  await getClient().execute("DELETE FROM scrap_log");
}

// ── Sim clock ─────────────────────────────────────────────────────────────────

export async function dbGetSimClock(): Promise<{ clock: Date | null; running: boolean; speed: number }> {
  const result = await getClient().execute("SELECT clock, running, speed FROM sim_clock WHERE id = 1");
  const row = result.rows[0] as unknown as { clock: string | null; running: number; speed: number } | undefined;
  if (!row) return { clock: null, running: false, speed: 60 };
  return {
    clock:   row.clock ? new Date(row.clock) : null,
    running: !!row.running,
    speed:   row.speed,
  };
}

export async function dbSetSimClock(clock: Date | null, running: boolean, speed: number): Promise<void> {
  await getClient().execute({
    sql:  "UPDATE sim_clock SET clock = ?, running = ?, speed = ? WHERE id = 1",
    args: [clock ? clock.toISOString() : null, running ? 1 : 0, speed],
  });
}

export async function dbClearSimClock(): Promise<void> {
  await getClient().execute(
    "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60 WHERE id = 1"
  );
}

export async function dbResetSimulationData(): Promise<void> {
  await getClient().batch(
    [
      { sql: "DELETE FROM scan_events", args: [] },
      { sql: "DELETE FROM scrap_log", args: [] },
      { sql: "DELETE FROM downtime_log", args: [] },
      { sql: "DELETE FROM db_meta", args: [] },
      { sql: "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60 WHERE id = 1", args: [] },
    ],
    "write"
  );
}

// ── Full reset ─────────────────────────────────────────────────────────────────

export async function dbResetAll(): Promise<void> {
  await getClient().batch(
    [
      { sql: "DELETE FROM scan_events",  args: [] },
      { sql: "DELETE FROM line_queues",  args: [] },
      { sql: "DELETE FROM line_comments", args: [] },
      { sql: "DELETE FROM scrap_log",    args: [] },
      { sql: "DELETE FROM downtime_log", args: [] },
      { sql: "DELETE FROM db_meta",      args: [] },
      // Null out target/headcount overrides so lines revert to seeded defaults after a reset.
      // isRunning is preserved — structural floor layout survives a sim reset.
      { sql: "UPDATE admin_config SET target = NULL, headcount = NULL", args: [] },
      { sql: "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60 WHERE id = 1", args: [] },
    ],
    "write"
  );
}

// ── Downtime log ──────────────────────────────────────────────────────────────

type DowntimeRow = {
  id: string; line_id: string; shift: "day" | "night"; reason: string;
  start_time: string; end_time: string | null; units_lost: number;
  notes: string; created_by: string | null; created_at: string;
};

function _parseDowntimeRow(r: DowntimeRow): DowntimeEntry {
  return {
    id: r.id, lineId: r.line_id, shift: r.shift,
    reason: r.reason as DowntimeEntry["reason"],
    startTime: r.start_time, endTime: r.end_time,
    unitsLost: r.units_lost, notes: r.notes,
    createdBy: r.created_by ?? undefined,
  };
}

export async function dbInsertDowntime(entry: DowntimeEntry): Promise<void> {
  await getClient().execute({
    sql: `INSERT INTO downtime_log
            (id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id, entry.lineId, entry.shift, entry.reason,
      entry.startTime, entry.endTime ?? null,
      entry.unitsLost, entry.notes,
      entry.createdBy ?? null, entry.startTime,
    ],
  });
}

export async function dbGetDowntimeEntries(lineId: string, shift: string): Promise<DowntimeEntry[]> {
  const result = await getClient().execute({
    sql: `SELECT id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at
          FROM downtime_log WHERE line_id = ? AND shift = ? ORDER BY start_time DESC`,
    args: [lineId, shift],
  });
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbGetDowntimeEntriesByShift(shift: string): Promise<DowntimeEntry[]> {
  const result = await getClient().execute({
    sql: `SELECT id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at
          FROM downtime_log WHERE shift = ? ORDER BY start_time DESC`,
    args: [shift],
  });
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbGetAllDowntimeEntries(): Promise<DowntimeEntry[]> {
  const result = await getClient().execute(
    `SELECT id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at
     FROM downtime_log ORDER BY start_time DESC`
  );
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbCloseDowntime(id: string, endTime: string): Promise<void> {
  await getClient().execute({
    sql:  "UPDATE downtime_log SET end_time = ? WHERE id = ? AND end_time IS NULL",
    args: [endTime, id],
  });
}

export async function dbGetOpenDowntime(lineId: string): Promise<DowntimeEntry | null> {
  const result = await getClient().execute({
    sql: `SELECT id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at
          FROM downtime_log WHERE line_id = ? AND end_time IS NULL LIMIT 1`,
    args: [lineId],
  });
  const row = result.rows[0] as unknown as DowntimeRow | undefined;
  return row ? _parseDowntimeRow(row) : null;
}

export async function dbGetTotalDowntimeMinutes(lineId: string, shift: string): Promise<number> {
  const result = await getClient().execute({
    sql:  "SELECT start_time, end_time FROM downtime_log WHERE line_id = ? AND shift = ?",
    args: [lineId, shift],
  });
  const rows = result.rows as unknown as { start_time: string; end_time: string | null }[];
  let total = 0;
  const now = Date.now();
  for (const r of rows) {
    const start = new Date(r.start_time).getTime();
    const end   = r.end_time ? new Date(r.end_time).getTime() : now;
    total += Math.floor((end - start) / 60000);
  }
  return total;
}
