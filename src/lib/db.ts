/**
 * SQLite persistence layer using better-sqlite3.
 * All data that must survive a cold start lives here.
 *
 * Migrations run on every import — use IF NOT EXISTS / ADD COLUMN
 * patterns to stay safe across hot reloads.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { AdminLineConfig, LineSchedule, ScanEvent } from "./mesTypes";
import type { LineComments } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";

// ── Path setup ────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH  = path.join(DATA_DIR, "ops.db");

let _db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  return _db;
}

// ── Migrations ────────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      line_id     TEXT NOT NULL,
      shift       TEXT NOT NULL,
      part_number TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scan_line     ON scan_events(line_id);
    CREATE INDEX IF NOT EXISTS idx_scan_shift   ON scan_events(line_id, shift);

    CREATE TABLE IF NOT EXISTS line_queues (
      line_id  TEXT PRIMARY KEY,
      queue    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      line_id   TEXT PRIMARY KEY,
      target    REAL,
      headcount INTEGER,
      is_running INTEGER DEFAULT 1
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
      timestamp   TEXT NOT NULL
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
  `);
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

export function getSerialCounter(key: string): number {
  const row = getDb()
    .prepare("SELECT value FROM db_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export function setSerialCounter(key: string, value: number): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)")
    .run(key, String(value));
}

// ── Scan events ───────────────────────────────────────────────────────────────

export function dbInsertScan(event: ScanEvent): void {
  getDb()
    .prepare(
      "INSERT INTO scan_events (id, timestamp, line_id, shift, part_number) VALUES (?, ?, ?, ?, ?)"
    )
    .run(event.id, event.timestamp, event.lineId, event.shift, event.partNumber);
}

export function dbInsertScansBatch(events: ScanEvent[]): void {
  if (events.length === 0) return;
  const stmt = getDb().prepare(
    "INSERT INTO scan_events (id, timestamp, line_id, shift, part_number) VALUES (?, ?, ?, ?, ?)"
  );
  const insertMany = getDb().transaction((evts: ScanEvent[]) => {
    for (const e of evts) stmt.run(e.id, e.timestamp, e.lineId, e.shift, e.partNumber);
  });
  insertMany(events);
}

export function dbGetAllScans(): ScanEvent[] {
  return getDb()
    .prepare("SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events")
    .all() as ScanEvent[];
}

export function dbGetScansByLine(lineId: string): ScanEvent[] {
  return getDb()
    .prepare(
      "SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events WHERE line_id = ?"
    )
    .all(lineId) as ScanEvent[];
}

export function dbGetScansByLineShift(lineId: string, shift: string): ScanEvent[] {
  return getDb()
    .prepare(
      "SELECT id, timestamp, line_id AS lineId, shift, part_number AS partNumber FROM scan_events WHERE line_id = ? AND shift = ?"
    )
    .all(lineId, shift) as ScanEvent[];
}

export function dbGetDistinctScanLineIds(): string[] {
  return (getDb().prepare("SELECT DISTINCT line_id FROM scan_events").all() as { line_id: string }[]).map(
    (r) => r.line_id
  );
}

export function dbClearScans(): void {
  getDb().prepare("DELETE FROM scan_events").run();
}

// ── Queues ────────────────────────────────────────────────────────────────────

export function dbGetQueue(lineId: string): LineSchedule[] | undefined {
  const row = getDb()
    .prepare("SELECT queue FROM line_queues WHERE line_id = ?")
    .get(lineId) as { queue: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.queue) as LineSchedule[];
}

export function dbGetAllQueues(): Record<string, LineSchedule[]> {
  const rows = getDb()
    .prepare("SELECT line_id, queue FROM line_queues")
    .all() as { line_id: string; queue: string }[];
  const out: Record<string, LineSchedule[]> = {};
  for (const r of rows) out[r.line_id] = JSON.parse(r.queue) as LineSchedule[];
  return out;
}

export function dbSetQueue(lineId: string, queue: LineSchedule[]): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO line_queues (line_id, queue) VALUES (?, ?)")
    .run(lineId, JSON.stringify(queue));
}

export function dbDeleteQueue(lineId: string): void {
  getDb().prepare("DELETE FROM line_queues WHERE line_id = ?").run(lineId);
}

export function dbClearQueues(): void {
  getDb().prepare("DELETE FROM line_queues").run();
}

// ── Admin config ──────────────────────────────────────────────────────────────

export function dbGetAdminConfig(lineId: string): AdminLineConfig {
  const row = getDb()
    .prepare("SELECT target, headcount, is_running FROM admin_config WHERE line_id = ?")
    .get(lineId) as
    | { target: number | null; headcount: number | null; is_running: number | null }
    | undefined;
  if (!row) return {};
  return {
    ...(row.target !== null ? { target: row.target } : {}),
    ...(row.headcount !== null ? { headcount: row.headcount } : {}),
    ...(row.is_running !== null ? { isRunning: row.is_running !== 0 } : {}),
  };
}

export function dbGetAllAdminConfig(): Record<string, AdminLineConfig> {
  const rows = getDb()
    .prepare("SELECT line_id, target, headcount, is_running FROM admin_config")
    .all() as {
    line_id: string;
    target: number | null;
    headcount: number | null;
    is_running: number | null;
  }[];
  const out: Record<string, AdminLineConfig> = {};
  for (const r of rows) {
    out[r.line_id] = {
      ...(r.target !== null ? { target: r.target } : {}),
      ...(r.headcount !== null ? { headcount: r.headcount } : {}),
      ...(r.is_running !== null ? { isRunning: r.is_running !== 0 } : {}),
    };
  }
  return out;
}

export function dbSetAdminConfig(lineId: string, config: AdminLineConfig): void {
  const existing = dbGetAdminConfig(lineId);
  const merged = { ...existing, ...config };
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO admin_config (line_id, target, headcount, is_running) VALUES (?, ?, ?, ?)"
    )
    .run(
      lineId,
      merged.target ?? null,
      merged.headcount ?? null,
      merged.isRunning !== undefined ? (merged.isRunning ? 1 : 0) : null
    );
}

// ── Comments ────────────────────────────────────────────────────────────────────

export function dbGetComments(lineId: string): LineComments {
  const rows = getDb()
    .prepare("SELECT hour, comment FROM line_comments WHERE line_id = ?")
    .all(lineId) as { hour: string; comment: string }[];
  const out: LineComments = {};
  for (const r of rows) out[r.hour] = r.comment;
  return out;
}

export function dbGetAllComments(): Record<string, LineComments> {
  const rows = getDb()
    .prepare("SELECT line_id, hour, comment FROM line_comments")
    .all() as { line_id: string; hour: string; comment: string }[];
  const out: Record<string, LineComments> = {};
  for (const r of rows) {
    if (!out[r.line_id]) out[r.line_id] = {};
    out[r.line_id][r.hour] = r.comment;
  }
  return out;
}

export function dbSetComment(lineId: string, hour: string, comment: string): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO line_comments (line_id, hour, comment) VALUES (?, ?, ?)"
    )
    .run(lineId, hour, comment);
}

export function dbDeleteComment(lineId: string, hour: string): void {
  getDb()
    .prepare("DELETE FROM line_comments WHERE line_id = ? AND hour = ?")
    .run(lineId, hour);
}

export function dbClearComments(): void {
  getDb().prepare("DELETE FROM line_comments").run();
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export function dbInsertScrap(entry: ScrapEntry): void {
  const extra: Record<string, unknown> = {};
  if (entry.kind === "scrapped-panel") {
    extra.stationFound = entry.stationFound;
    extra.howDamaged   = entry.howDamaged;
  } else {
    extra.affectedArea     = entry.affectedArea;
    extra.auditorInitials = entry.auditorInitials;
  }

  getDb()
    .prepare(
      `INSERT INTO scrap_log
        (id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.id,
      entry.lineId,
      entry.shift,
      entry.model,
      entry.panel,
      entry.damageType,
      entry.boughtIn ? 1 : 0,
      entry.kind,
      JSON.stringify(extra),
      entry.timestamp
    );
}

function _parseScrapRow(r: {
  id: string;
  line_id: string;
  shift: "day" | "night";
  model: string;
  panel: string;
  damage_type: string;
  bought_in: number;
  kind: string;
  extra: string;
  timestamp: string;
}): ScrapEntry {
  const extra      = JSON.parse(r.extra) as Record<string, unknown>;
  const panel      = r.panel as ScrapEntry["panel"];
  const damageType = r.damage_type as ScrapEntry["damageType"];
  if (r.kind === "scrapped-panel") {
    return {
      id: r.id, lineId: r.line_id, shift: r.shift, model: r.model,
      panel, damageType, boughtIn: !!r.bought_in,
      kind: "scrapped-panel", stationFound: String(extra.stationFound ?? ""),
      howDamaged: String(extra.howDamaged ?? ""), timestamp: r.timestamp,
    };
  } else {
    return {
      id: r.id, lineId: r.line_id, shift: r.shift, model: r.model,
      panel, damageType, boughtIn: !!r.bought_in,
      kind: "kicked-lid", affectedArea: String(extra.affectedArea ?? "") as "panel" | "extrusion",
      auditorInitials: String(extra.auditorInitials ?? ""), timestamp: r.timestamp,
    };
  }
}

export function dbGetScrapEntries(lineId: string, shift: string): ScrapEntry[] {
  type Row = { id: string; line_id: string; shift: "day" | "night"; model: string; panel: string; damage_type: string; bought_in: number; kind: string; extra: string; timestamp: string; };
  const rows = getDb()
    .prepare(
      `SELECT id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp
       FROM scrap_log WHERE line_id = ? AND shift = ?`
    )
    .all(lineId, shift) as Row[];
  return rows.map(_parseScrapRow);
}

export function dbGetAllScrapEntries(): ScrapEntry[] {
  type Row = { id: string; line_id: string; shift: "day" | "night"; model: string; panel: string; damage_type: string; bought_in: number; kind: string; extra: string; timestamp: string; };
  const rows = getDb()
    .prepare(
      `SELECT id, line_id, shift, model, panel, damage_type, bought_in, kind, extra, timestamp
       FROM scrap_log`
    )
    .all() as Row[];
  return rows.map(_parseScrapRow);
}

export function dbGetKickedLids(lineId: string, shift: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS cnt FROM scrap_log WHERE line_id = ? AND shift = ? AND kind = 'kicked-lid'"
    )
    .get(lineId, shift) as { cnt: number };
  return row.cnt;
}

export function dbClearScrap(): void {
  getDb().prepare("DELETE FROM scrap_log").run();
}

// ── Sim clock ─────────────────────────────────────────────────────────────────

export function dbGetSimClock(): {
  clock: Date | null;
  running: boolean;
  speed: number;
} {
  const row = getDb()
    .prepare("SELECT clock, running, speed FROM sim_clock WHERE id = 1")
    .get() as { clock: string | null; running: number; speed: number } | undefined;
  if (!row) return { clock: null, running: false, speed: 60 };
  return {
    clock:   row.clock ? new Date(row.clock) : null,
    running: !!row.running,
    speed:   row.speed,
  };
}

export function dbSetSimClock(clock: Date | null, running: boolean, speed: number): void {
  getDb()
    .prepare("UPDATE sim_clock SET clock = ?, running = ?, speed = ? WHERE id = 1")
    .run(clock ? clock.toISOString() : null, running ? 1 : 0, speed);
}

export function dbClearSimClock(): void {
  getDb()
    .prepare("UPDATE sim_clock SET clock = NULL, running = 0, speed = 60 WHERE id = 1")
    .run();
}

// ── Full reset ─────────────────────────────────────────────────────────────────

export function dbResetAll(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM scan_events;
    DELETE FROM line_queues;
    DELETE FROM admin_config;
    DELETE FROM line_comments;
    DELETE FROM scrap_log;
    DELETE FROM db_meta;
  `);
  dbSetSimClock(null, false, 60);
}
