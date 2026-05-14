/**
 * Persistence layer using @libsql/client (Turso / libSQL).
 * Connects to TURSO_DATABASE_URL — cloud-hosted on Vercel, file: locally.
 * All functions are async; state survives cold starts and serverless restarts.
 */

import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import type {
  AdminLineConfig,
  ChangeoverEvent,
  LineSchedule,
  ScanEvent,
  ShiftConfig,
} from "./mesTypes";
import type { LineComments } from "./mesTypes";
import type { ScrapEntry } from "./reworkTypes";
import type { DowntimeEntry } from "./downtimeTypes";
import {
  defaultAdminLineConfig,
  defaultShiftConfig as createDefaultShiftConfig,
  withDerivedLineRunning,
} from "./adminConfig";

// ── Client singleton (globalThis survives HMR in dev mode) ───────────────────

const _G = globalThis as unknown as { __turso_client__?: Client };
const SAFE_MIGRATION_TABLES = new Set([
  "scan_events",
  "scrap_log",
  "downtime_log",
  "changeover_log",
  "sim_clock",
  "admin_config",
]);
const SAFE_MIGRATION_COLUMNS = new Set([
  "production_date",
  "session_start",
  "session_end",
  "session_start_shift",
  "handoff_count",
]);

export function getClient(): Client {
  if (_G.__turso_client__) return _G.__turso_client__;
  _G.__turso_client__ = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _G.__turso_client__;
}

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!SAFE_MIGRATION_TABLES.has(table) || !SAFE_MIGRATION_COLUMNS.has(column)) {
    throw new Error(`Unsafe migration identifier: ${table}.${column}`);
  }
  try {
    await getClient().execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("duplicate column name") &&
      !message.includes("already exists")
    ) {
      throw error;
    }
  }
}

type LegacyAdminConfig = Partial<AdminLineConfig> & {
  target?: number | null;
  headcount?: number | null;
  // Legacy flat admin config stored the operator_name column under supervisorName in app code.
  supervisorName?: string | null;
};

function resetAdminConfig(config: AdminLineConfig): AdminLineConfig {
  return withDerivedLineRunning({
    ...defaultAdminLineConfig(),
    day: {
      ...createDefaultShiftConfig(),
      isRunning: config.day?.isRunning ?? true,
    },
    night: {
      ...createDefaultShiftConfig(),
      isRunning: config.night?.isRunning ?? true,
    },
  });
}

function normalizeShiftConfig(
  shift: Partial<ShiftConfig> | undefined,
  fallback: ShiftConfig,
): ShiftConfig {
  return {
    supervisor:
      typeof shift?.supervisor === "string"
        ? shift.supervisor
        : fallback.supervisor,
    dailyTarget:
      typeof shift?.dailyTarget === "number" && Number.isFinite(shift.dailyTarget)
        ? shift.dailyTarget
        : fallback.dailyTarget,
    headcount:
      typeof shift?.headcount === "number" && Number.isFinite(shift.headcount)
        ? shift.headcount
        : fallback.headcount,
    isRunning:
      typeof shift?.isRunning === "boolean"
        ? shift.isRunning
        : fallback.isRunning,
  };
}

function normalizeAdminConfig(config?: LegacyAdminConfig | null): AdminLineConfig {
  const sharedIsRunning =
    typeof config?.isRunning === "boolean" ? config.isRunning : true;
  const sharedFallback: ShiftConfig = {
    supervisor:
      typeof config?.supervisorName === "string" ? config.supervisorName : "",
    dailyTarget:
      typeof config?.target === "number" && Number.isFinite(config.target)
        ? config.target
        : 0,
    headcount:
      typeof config?.headcount === "number" && Number.isFinite(config.headcount)
        ? config.headcount
        : 0,
    isRunning: sharedIsRunning,
  };

  return withDerivedLineRunning({
    isRunning: sharedIsRunning,
    day: normalizeShiftConfig(config?.day, sharedFallback),
    night: normalizeShiftConfig(config?.night, sharedFallback),
  });
}

async function getTableColumns(table: string): Promise<string[]> {
  if (!SAFE_MIGRATION_TABLES.has(table)) {
    throw new Error(`Unsafe migration identifier: ${table}`);
  }

  const result = await getClient().execute(`PRAGMA table_info(${table})`);
  const rows = result.rows as unknown as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

async function migrateAdminConfigV2(): Promise<void> {
  const client = getClient();
  const migrated = await client.execute(
    "SELECT value FROM db_meta WHERE key = 'admin_config_v2'",
  );
  if (migrated.rows.length > 0) return;

  const columns = await getTableColumns("admin_config");
  const hasLegacySchema = columns.includes("target");
  const hasJsonSchema = columns.includes("config");

  if (hasLegacySchema) {
    const oldRowsResult = await client.execute(
      "SELECT line_id, target, headcount, is_running, operator_name FROM admin_config",
    );
    const oldRows = oldRowsResult.rows as unknown as Array<{
      line_id: string;
      target: number | null;
      headcount: number | null;
      is_running: number | null;
      operator_name: string | null;
    }>;

    try {
      await client.execute("ALTER TABLE admin_config RENAME TO admin_config_legacy");
      await client.execute(`
        CREATE TABLE admin_config (
          line_id TEXT PRIMARY KEY,
          config  TEXT NOT NULL
        )
      `);
    } catch (error) {
      throw new Error(
        `admin_config_v2 migration failed during table rebuild: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (oldRows.length > 0) {
      await client.batch(
        oldRows.map((row) => ({
          sql: "INSERT INTO admin_config (line_id, config) VALUES (?, ?)",
          args: [
            row.line_id,
            JSON.stringify(
              normalizeAdminConfig({
                isRunning: row.is_running !== 0,
                target: row.target,
                headcount: row.headcount,
                supervisorName: row.operator_name,
              }),
            ),
          ],
        })),
        "write",
      );
    }

    try {
      await client.execute("DROP TABLE admin_config_legacy");
    } catch (error) {
      throw new Error(
        `admin_config_v2 migration failed while dropping legacy table: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else if (!hasJsonSchema) {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS admin_config (
        line_id TEXT PRIMARY KEY,
        config  TEXT NOT NULL
      )
    `);
  }

  await client.execute(
    "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('admin_config_v2', '1')",
  );
}

// ── Migrations ────────────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  await getClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      line_id     TEXT NOT NULL,
      shift       TEXT NOT NULL,
      production_date TEXT NOT NULL DEFAULT '',
      part_number TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scan_line  ON scan_events(line_id);
    CREATE INDEX IF NOT EXISTS idx_scan_shift ON scan_events(line_id, production_date, shift);

    CREATE TABLE IF NOT EXISTS line_queues (
      line_id  TEXT PRIMARY KEY,
      queue    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      line_id TEXT PRIMARY KEY,
      config  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS line_comments_context (
      line_id         TEXT NOT NULL,
      production_date TEXT NOT NULL,
      shift           TEXT NOT NULL,
      hour            TEXT NOT NULL,
      comment         TEXT NOT NULL,
      PRIMARY KEY (line_id, production_date, shift, hour)
    );

    CREATE TABLE IF NOT EXISTS scrap_log (
      id          TEXT PRIMARY KEY,
      line_id     TEXT NOT NULL,
      shift       TEXT NOT NULL,
      production_date TEXT NOT NULL DEFAULT '',
      model       TEXT NOT NULL,
      panel       TEXT NOT NULL,
      damage_type TEXT NOT NULL,
      bought_in   INTEGER DEFAULT 0,
      kind        TEXT NOT NULL,
      extra       TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      void_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scrap_shift ON scrap_log(line_id, production_date, shift);

    CREATE TABLE IF NOT EXISTS sim_clock (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      clock   TEXT,
      running INTEGER DEFAULT 0,
      speed   REAL    DEFAULT 60,
      session_start TEXT,
      session_end   TEXT,
      session_start_shift TEXT,
      handoff_count INTEGER DEFAULT 0
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
      production_date TEXT NOT NULL DEFAULT '',
      reason     TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT,
      units_lost INTEGER DEFAULT 0,
      notes      TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_downtime_shift ON downtime_log(line_id, production_date, shift);

    CREATE TABLE IF NOT EXISTS changeover_log (
      id              TEXT PRIMARY KEY,
      line_id         TEXT NOT NULL,
      shift           TEXT NOT NULL,
      production_date TEXT NOT NULL DEFAULT '',
      completed_model TEXT NOT NULL,
      next_model      TEXT,
      timestamp       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_changeover_shift ON changeover_log(line_id, production_date, shift);

  `);

  await addColumnIfMissing("scan_events", "production_date", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scrap_log", "production_date", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("downtime_log", "production_date", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("changeover_log", "production_date", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("sim_clock", "session_start", "TEXT");
  await addColumnIfMissing("sim_clock", "session_end", "TEXT");
  await addColumnIfMissing("sim_clock", "session_start_shift", "TEXT");
  await addColumnIfMissing("sim_clock", "handoff_count", "INTEGER DEFAULT 0");
  await migrateAdminConfigV2();
}

// ── Serial helpers ─────────────────────────────────────────────────────────────

export async function getSerialCounter(key: string): Promise<number> {
  const result = await getClient().execute({
    sql: "SELECT value FROM db_meta WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0] as unknown as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export async function setSerialCounter(
  key: string,
  value: number,
): Promise<void> {
  await getClient().execute({
    sql: "INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)",
    args: [key, String(value)],
  });
}

// ── Scan events ───────────────────────────────────────────────────────────────

export async function dbInsertScan(event: ScanEvent): Promise<void> {
  await getClient().execute({
    sql: "INSERT INTO scan_events (id, timestamp, line_id, shift, production_date, part_number) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      event.id,
      event.timestamp,
      event.lineId,
      event.shift,
      event.productionDate,
      event.partNumber,
    ],
  });
}

export async function dbInsertScansBatch(events: ScanEvent[]): Promise<void> {
  if (events.length === 0) return;
  await getClient().batch(
    events.map((e) => ({
      sql: "INSERT INTO scan_events (id, timestamp, line_id, shift, production_date, part_number) VALUES (?, ?, ?, ?, ?, ?)",
      args: [e.id, e.timestamp, e.lineId, e.shift, e.productionDate, e.partNumber],
    })),
    "write",
  );
}

export async function dbGetAllScans(): Promise<ScanEvent[]> {
  const result = await getClient().execute(
    "SELECT id, timestamp, line_id AS lineId, shift, production_date AS productionDate, part_number AS partNumber FROM scan_events",
  );
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetScansByLine(lineId: string): Promise<ScanEvent[]> {
  const result = await getClient().execute({
    sql: "SELECT id, timestamp, line_id AS lineId, shift, production_date AS productionDate, part_number AS partNumber FROM scan_events WHERE line_id = ?",
    args: [lineId],
  });
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetScansByLineShift(
  lineId: string,
  shift: string,
  productionDate?: string,
): Promise<ScanEvent[]> {
  const result = productionDate
    ? await getClient().execute({
        sql: "SELECT id, timestamp, line_id AS lineId, shift, production_date AS productionDate, part_number AS partNumber FROM scan_events WHERE line_id = ? AND shift = ? AND production_date = ?",
        args: [lineId, shift, productionDate],
      })
    : await getClient().execute({
        sql: "SELECT id, timestamp, line_id AS lineId, shift, production_date AS productionDate, part_number AS partNumber FROM scan_events WHERE line_id = ? AND shift = ?",
        args: [lineId, shift],
      });
  return result.rows as unknown as ScanEvent[];
}

export async function dbGetDistinctScanLineIds(): Promise<string[]> {
  const result = await getClient().execute(
    "SELECT DISTINCT line_id FROM scan_events",
  );
  return (result.rows as unknown as { line_id: string }[]).map(
    (r) => r.line_id,
  );
}

export async function dbClearScans(): Promise<void> {
  await getClient().execute("DELETE FROM scan_events");
}

// ── Queues ────────────────────────────────────────────────────────────────────

export async function dbGetQueue(
  lineId: string,
): Promise<LineSchedule[] | undefined> {
  const result = await getClient().execute({
    sql: "SELECT queue FROM line_queues WHERE line_id = ?",
    args: [lineId],
  });
  const row = result.rows[0] as unknown as { queue: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.queue) as LineSchedule[];
}

export async function dbGetAllQueues(): Promise<
  Record<string, LineSchedule[]>
> {
  const result = await getClient().execute(
    "SELECT line_id, queue FROM line_queues",
  );
  const rows = result.rows as unknown as { line_id: string; queue: string }[];
  const out: Record<string, LineSchedule[]> = {};
  for (const r of rows) out[r.line_id] = JSON.parse(r.queue) as LineSchedule[];
  return out;
}

export async function dbSetQueue(
  lineId: string,
  queue: LineSchedule[],
): Promise<void> {
  await getClient().execute({
    sql: "INSERT OR REPLACE INTO line_queues (line_id, queue) VALUES (?, ?)",
    args: [lineId, JSON.stringify(queue)],
  });
}

export async function dbDeleteQueue(lineId: string): Promise<void> {
  await getClient().execute({
    sql: "DELETE FROM line_queues WHERE line_id = ?",
    args: [lineId],
  });
}

export async function dbClearQueues(): Promise<void> {
  await getClient().execute("DELETE FROM line_queues");
}

// ── Admin config ──────────────────────────────────────────────────────────────

export async function dbGetAdminConfig(
  lineId: string,
): Promise<AdminLineConfig> {
  const result = await getClient().execute({
    sql: "SELECT config FROM admin_config WHERE line_id = ?",
    args: [lineId],
  });
  const row = result.rows[0] as unknown as { config: string } | undefined;
  if (!row) {
    const config = defaultAdminLineConfig();
    await dbSetAdminConfig(lineId, config);
    return config;
  }
  return normalizeAdminConfig(JSON.parse(row.config) as LegacyAdminConfig);
}

export async function dbGetAllAdminConfig(): Promise<
  Record<string, AdminLineConfig>
> {
  const result = await getClient().execute("SELECT line_id, config FROM admin_config");
  const rows = result.rows as unknown as {
    line_id: string;
    config: string;
  }[];
  const out: Record<string, AdminLineConfig> = {};
  for (const r of rows) {
    out[r.line_id] = normalizeAdminConfig(JSON.parse(r.config) as LegacyAdminConfig);
  }
  return out;
}

export async function dbSetAdminConfig(
  lineId: string,
  config: AdminLineConfig,
): Promise<void> {
  const normalized = normalizeAdminConfig(config);
  await getClient().execute({
    sql: "INSERT OR REPLACE INTO admin_config (line_id, config) VALUES (?, ?)",
    args: [lineId, JSON.stringify(normalized)],
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function dbGetComments(
  lineId: string,
  shift: string,
  productionDate: string,
): Promise<LineComments> {
  const result = await getClient().execute({
    sql: "SELECT hour, comment FROM line_comments_context WHERE line_id = ? AND shift = ? AND production_date = ?",
    args: [lineId, shift, productionDate],
  });
  const rows = result.rows as unknown as { hour: string; comment: string }[];
  const out: LineComments = {};
  for (const r of rows) out[r.hour] = r.comment;
  return out;
}

export async function dbGetAllComments(): Promise<
  Record<string, LineComments>
> {
  const result = await getClient().execute(
    "SELECT line_id, production_date, shift, hour, comment FROM line_comments_context",
  );
  const rows = result.rows as unknown as {
    line_id: string;
    production_date: string;
    shift: string;
    hour: string;
    comment: string;
  }[];
  const out: Record<string, LineComments> = {};
  for (const r of rows) {
    const key = `${r.line_id}::${r.production_date}:${r.shift}`;
    if (!out[key]) out[key] = {};
    out[key][r.hour] = r.comment;
  }
  return out;
}

export async function dbSetComment(
  lineId: string,
  shift: string,
  productionDate: string,
  hour: string,
  comment: string,
): Promise<void> {
  await getClient().execute({
    sql: "INSERT OR REPLACE INTO line_comments_context (line_id, production_date, shift, hour, comment) VALUES (?, ?, ?, ?, ?)",
    args: [lineId, productionDate, shift, hour, comment],
  });
}

export async function dbDeleteComment(
  lineId: string,
  shift: string,
  productionDate: string,
  hour: string,
): Promise<void> {
  await getClient().execute({
    sql: "DELETE FROM line_comments_context WHERE line_id = ? AND production_date = ? AND shift = ? AND hour = ?",
    args: [lineId, productionDate, shift, hour],
  });
}

export async function dbClearComments(): Promise<void> {
  await getClient().execute("DELETE FROM line_comments_context");
}

// ── Scrap log ─────────────────────────────────────────────────────────────────

export async function dbInsertScrap(entry: ScrapEntry): Promise<void> {
  const extra: Record<string, unknown> = {};
  if (entry.reasonCode) extra.reasonCode = entry.reasonCode;
  if (entry.kind === "scrapped-panel") {
    extra.stationFound = entry.stationFound;
    extra.howDamaged = entry.howDamaged;
  } else {
    extra.affectedArea = entry.affectedArea;
    extra.auditorInitials = entry.auditorInitials;
  }
  await getClient().execute({
    sql: `INSERT INTO scrap_log
            (id, line_id, shift, production_date, model, panel, damage_type, bought_in, kind, extra, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id,
      entry.lineId,
      entry.shift,
      entry.productionDate,
      entry.model,
      entry.panel,
      entry.damageType,
      entry.boughtIn ? 1 : 0,
      entry.kind,
      JSON.stringify(extra),
      entry.timestamp,
    ],
  });
}

type ScrapRow = {
  id: string;
  line_id: string;
  shift: "day" | "night";
  production_date: string;
  model: string;
  panel: string;
  damage_type: string;
  bought_in: number;
  kind: string;
  extra: string;
  timestamp: string;
  void_reason: string | null;
};

function _parseScrapRow(r: ScrapRow): ScrapEntry {
  const extra = JSON.parse(r.extra) as Record<string, unknown>;
  const panel = r.panel as ScrapEntry["panel"];
  const damageType = r.damage_type as ScrapEntry["damageType"];
  const reasonCode =
    typeof extra.reasonCode === "string" ? extra.reasonCode : undefined;
  if (r.kind === "scrapped-panel") {
    return {
        id: r.id,
        lineId: r.line_id,
        shift: r.shift,
        productionDate: r.production_date,
        model: r.model,
      panel,
      reasonCode,
      damageType,
      boughtIn: !!r.bought_in,
      kind: "scrapped-panel",
      stationFound: String(extra.stationFound ?? ""),
      howDamaged: String(extra.howDamaged ?? ""),
      timestamp: r.timestamp,
      voidReason: r.void_reason ?? undefined,
    };
  } else {
    return {
        id: r.id,
        lineId: r.line_id,
        shift: r.shift,
        productionDate: r.production_date,
        model: r.model,
      panel,
      reasonCode,
      damageType,
      boughtIn: !!r.bought_in,
      kind: "kicked-lid",
      affectedArea: String(extra.affectedArea ?? "") as "panel" | "extrusion",
      auditorInitials: String(extra.auditorInitials ?? ""),
      timestamp: r.timestamp,
      voidReason: r.void_reason ?? undefined,
    };
  }
}

export async function dbGetScrapEntries(
  lineId: string,
  shift: string,
  productionDate?: string,
): Promise<ScrapEntry[]> {
  const result = productionDate
    ? await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, model, panel, damage_type, bought_in, kind, extra, timestamp, void_reason
              FROM scrap_log WHERE line_id = ? AND shift = ? AND production_date = ?`,
        args: [lineId, shift, productionDate],
      })
    : await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, model, panel, damage_type, bought_in, kind, extra, timestamp, void_reason
              FROM scrap_log WHERE line_id = ? AND shift = ?`,
        args: [lineId, shift],
      });
  return (result.rows as unknown as ScrapRow[]).map(_parseScrapRow);
}

export async function dbGetAllScrapEntries(): Promise<ScrapEntry[]> {
  const result = await getClient().execute(
    "SELECT id, line_id, shift, production_date, model, panel, damage_type, bought_in, kind, extra, timestamp, void_reason FROM scrap_log",
  );
  return (result.rows as unknown as ScrapRow[]).map(_parseScrapRow);
}

export async function dbGetKickedLids(
  lineId: string,
  shift: string,
  productionDate?: string,
): Promise<number> {
  const result = productionDate
    ? await getClient().execute({
        sql: "SELECT COUNT(*) AS cnt FROM scrap_log WHERE line_id = ? AND shift = ? AND production_date = ? AND kind = 'kicked-lid' AND void_reason IS NULL",
        args: [lineId, shift, productionDate],
      })
    : await getClient().execute({
        sql: "SELECT COUNT(*) AS cnt FROM scrap_log WHERE line_id = ? AND shift = ? AND kind = 'kicked-lid' AND void_reason IS NULL",
        args: [lineId, shift],
      });
  const row = result.rows[0] as unknown as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export async function dbUpdateScrapEntry(
  id: string,
  updates: {
    model?: string;
    panel?: string;
    reasonCode?: string;
    damageType?: string;
    boughtIn?: boolean;
  },
): Promise<void> {
  const result = await getClient().execute({
    sql: "SELECT extra, kind FROM scrap_log WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0] as unknown as
    | { extra: string; kind: string }
    | undefined;
  if (!row) return;
  const extra = JSON.parse(row.extra) as Record<string, unknown>;
  if (updates.model) extra["model"] = updates.model;
  if (updates.panel) extra["panel"] = updates.panel;
  if (updates.reasonCode) extra["reasonCode"] = updates.reasonCode;
  if (updates.damageType) extra["damageType"] = updates.damageType;
  if (updates.boughtIn !== undefined) extra["boughtIn"] = updates.boughtIn;
  await getClient().execute({
    sql: `UPDATE scrap_log
          SET model       = COALESCE(?, model),
              panel       = COALESCE(?, panel),
              damage_type = COALESCE(?, damage_type),
              bought_in   = COALESCE(?, bought_in),
              extra       = ?
          WHERE id = ?`,
    args: [
      updates.model ?? null,
      updates.panel ?? null,
      updates.damageType ?? null,
      updates.boughtIn !== undefined ? (updates.boughtIn ? 1 : 0) : null,
      JSON.stringify(extra),
      id,
    ],
  });
}

export async function dbVoidScrapEntry(
  id: string,
  voidReason: string,
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE scrap_log SET void_reason = ? WHERE id = ?",
    args: [voidReason, id],
  });
}

export async function dbClearScrap(): Promise<void> {
  await getClient().execute("DELETE FROM scrap_log");
}

// ── Changeover log ────────────────────────────────────────────────────────────

type ChangeoverRow = {
  id: string;
  line_id: string;
  shift: "day" | "night";
  production_date: string;
  completed_model: string;
  next_model: string | null;
  timestamp: string;
};

function _parseChangeoverRow(r: ChangeoverRow): ChangeoverEvent {
  return {
    id: r.id,
    lineId: r.line_id,
    shift: r.shift,
    productionDate: r.production_date,
    completedModel: r.completed_model,
    nextModel: r.next_model,
    timestamp: r.timestamp,
  };
}

export async function dbInsertChangeover(
  event: ChangeoverEvent,
): Promise<void> {
  await getClient().execute({
    sql: `INSERT INTO changeover_log
            (id, line_id, shift, production_date, completed_model, next_model, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.id,
      event.lineId,
      event.shift,
      event.productionDate,
      event.completedModel,
      event.nextModel,
      event.timestamp,
    ],
  });
}

export async function dbGetAllChangeovers(): Promise<ChangeoverEvent[]> {
  const result = await getClient().execute(
    `SELECT id, line_id, shift, production_date, completed_model, next_model, timestamp
     FROM changeover_log
     ORDER BY timestamp DESC`,
  );
  return (result.rows as unknown as ChangeoverRow[]).map(_parseChangeoverRow);
}

// ── Sim clock ─────────────────────────────────────────────────────────────────

export async function dbGetSimClock(): Promise<{
  clock: Date | null;
  running: boolean;
  speed: number;
  sessionStart: Date | null;
  sessionEnd: Date | null;
  sessionStartShift: "day" | "night" | null;
  handoffCount: number;
}> {
  const result = await getClient().execute(
    "SELECT clock, running, speed, session_start, session_end, session_start_shift, handoff_count FROM sim_clock WHERE id = 1",
  );
  const row = result.rows[0] as unknown as
    | {
        clock: string | null;
        running: number;
        speed: number;
        session_start: string | null;
        session_end: string | null;
        session_start_shift: "day" | "night" | null;
        handoff_count: number | null;
      }
    | undefined;
  if (!row) {
    return {
      clock: null,
      running: false,
      speed: 60,
      sessionStart: null,
      sessionEnd: null,
      sessionStartShift: null,
      handoffCount: 0,
    };
  }
  return {
    clock: row.clock ? new Date(row.clock) : null,
    running: !!row.running,
    speed: row.speed,
    sessionStart: row.session_start ? new Date(row.session_start) : null,
    sessionEnd: row.session_end ? new Date(row.session_end) : null,
    sessionStartShift: row.session_start_shift ?? null,
    handoffCount: row.handoff_count ?? 0,
  };
}

export async function dbSetSimClock(
  clock: Date | null,
  running: boolean,
  speed: number,
  session?: {
    sessionStart: Date | null;
    sessionEnd: Date | null;
    sessionStartShift: "day" | "night" | null;
    handoffCount: number;
  },
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE sim_clock SET clock = ?, running = ?, speed = ?, session_start = ?, session_end = ?, session_start_shift = ?, handoff_count = ? WHERE id = 1",
    args: [
      clock ? clock.toISOString() : null,
      running ? 1 : 0,
      speed,
      session?.sessionStart ? session.sessionStart.toISOString() : null,
      session?.sessionEnd ? session.sessionEnd.toISOString() : null,
      session?.sessionStartShift ?? null,
      session?.handoffCount ?? 0,
    ],
  });
}

export async function dbClearSimClock(): Promise<void> {
  await getClient().execute(
    "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60, session_start = NULL, session_end = NULL, session_start_shift = NULL, handoff_count = 0 WHERE id = 1",
  );
}

export async function dbResetSimulationData(): Promise<void> {
  await getClient().batch(
    [
      { sql: "DELETE FROM scan_events", args: [] },
      { sql: "DELETE FROM scrap_log", args: [] },
      { sql: "DELETE FROM downtime_log", args: [] },
      { sql: "DELETE FROM changeover_log", args: [] },
      { sql: "DELETE FROM db_meta", args: [] },
      {
        sql: "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60, session_start = NULL, session_end = NULL, session_start_shift = NULL, handoff_count = 0 WHERE id = 1",
        args: [],
      },
    ],
    "write",
  );
}

// ── Full reset ─────────────────────────────────────────────────────────────────

export async function dbResetAll(): Promise<void> {
  const existingConfig = await dbGetAllAdminConfig();
  await getClient().batch(
    [
      { sql: "DELETE FROM scan_events", args: [] },
      { sql: "DELETE FROM line_queues", args: [] },
      { sql: "DELETE FROM line_comments", args: [] },
      { sql: "DELETE FROM line_comments_context", args: [] },
      { sql: "DELETE FROM scrap_log", args: [] },
      { sql: "DELETE FROM downtime_log", args: [] },
      { sql: "DELETE FROM changeover_log", args: [] },
      { sql: "DELETE FROM db_meta", args: [] },
      {
        sql: "DELETE FROM admin_config",
        args: [],
      },
      {
        sql: "UPDATE sim_clock SET clock = NULL, running = 0, speed = 60, session_start = NULL, session_end = NULL, session_start_shift = NULL, handoff_count = 0 WHERE id = 1",
        args: [],
      },
    ],
    "write",
  );

  const preservedConfigs = Object.entries(existingConfig).map(([lineId, config]) => ({
    lineId,
    config: JSON.stringify(resetAdminConfig(config)),
  }));

  if (preservedConfigs.length > 0) {
    await getClient().batch(
      preservedConfigs.map((entry) => ({
        sql: "INSERT INTO admin_config (line_id, config) VALUES (?, ?)",
        args: [entry.lineId, entry.config],
      })),
      "write",
    );
  }
}

// ── Downtime log ──────────────────────────────────────────────────────────────

type DowntimeRow = {
  id: string;
  line_id: string;
  shift: "day" | "night";
  production_date: string;
  reason: string;
  start_time: string;
  end_time: string | null;
  units_lost: number;
  notes: string;
  created_by: string | null;
  created_at: string;
};

function _parseDowntimeRow(r: DowntimeRow): DowntimeEntry {
  return {
    id: r.id,
    lineId: r.line_id,
    shift: r.shift,
    productionDate: r.production_date,
    reason: r.reason as DowntimeEntry["reason"],
    startTime: r.start_time,
    endTime: r.end_time,
    unitsLost: r.units_lost,
    notes: r.notes,
    createdBy: r.created_by ?? undefined,
  };
}

export async function dbInsertDowntime(entry: DowntimeEntry): Promise<void> {
  await getClient().execute({
    sql: `INSERT INTO downtime_log
            (id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.id,
      entry.lineId,
      entry.shift,
      entry.productionDate,
      entry.reason,
      entry.startTime,
      entry.endTime ?? null,
      entry.unitsLost,
      entry.notes,
      entry.createdBy ?? null,
      entry.startTime,
    ],
  });
}

export async function dbGetDowntimeEntries(
  lineId: string,
  shift: string,
  productionDate?: string,
): Promise<DowntimeEntry[]> {
  const result = productionDate
    ? await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at
              FROM downtime_log WHERE line_id = ? AND shift = ? AND production_date = ? ORDER BY start_time DESC`,
        args: [lineId, shift, productionDate],
      })
    : await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at
              FROM downtime_log WHERE line_id = ? AND shift = ? ORDER BY start_time DESC`,
        args: [lineId, shift],
      });
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbGetDowntimeEntriesByShift(
  shift: string,
  productionDate?: string,
): Promise<DowntimeEntry[]> {
  const result = productionDate
    ? await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at
              FROM downtime_log WHERE shift = ? AND production_date = ? ORDER BY start_time DESC`,
        args: [shift, productionDate],
      })
    : await getClient().execute({
        sql: `SELECT id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at
              FROM downtime_log WHERE shift = ? ORDER BY start_time DESC`,
        args: [shift],
      });
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbGetAllDowntimeEntries(): Promise<DowntimeEntry[]> {
  const result = await getClient().execute(
    `SELECT id, line_id, shift, production_date, reason, start_time, end_time, units_lost, notes, created_by, created_at
     FROM downtime_log ORDER BY start_time DESC`,
  );
  return (result.rows as unknown as DowntimeRow[]).map(_parseDowntimeRow);
}

export async function dbCloseDowntime(
  id: string,
  endTime: string,
  unitsLost?: number,
): Promise<void> {
  if (unitsLost === undefined) {
    await getClient().execute({
      sql: "UPDATE downtime_log SET end_time = ? WHERE id = ? AND end_time IS NULL",
      args: [endTime, id],
    });
    return;
  }

  await getClient().execute({
    sql: "UPDATE downtime_log SET end_time = ?, units_lost = ? WHERE id = ? AND end_time IS NULL",
    args: [endTime, unitsLost, id],
  });
}

export async function dbGetOpenDowntime(
  lineId: string,
): Promise<DowntimeEntry | null> {
  const result = await getClient().execute({
    sql: `SELECT id, line_id, shift, reason, start_time, end_time, units_lost, notes, created_by, created_at
          FROM downtime_log WHERE line_id = ? AND end_time IS NULL LIMIT 1`,
    args: [lineId],
  });
  const row = result.rows[0] as unknown as DowntimeRow | undefined;
  return row ? _parseDowntimeRow(row) : null;
}

export async function dbGetTotalDowntimeMinutes(
  lineId: string,
  shift: string,
): Promise<number> {
  const result = await getClient().execute({
    sql: "SELECT start_time, end_time FROM downtime_log WHERE line_id = ? AND shift = ?",
    args: [lineId, shift],
  });
  const rows = result.rows as unknown as {
    start_time: string;
    end_time: string | null;
  }[];
  let total = 0;
  const now = Date.now();
  for (const r of rows) {
    const start = new Date(r.start_time).getTime();
    const end = r.end_time ? new Date(r.end_time).getTime() : now;
    total += Math.floor((end - start) / 60000);
  }
  return total;
}
