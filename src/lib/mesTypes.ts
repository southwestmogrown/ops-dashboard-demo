// ── MES / Simulator Types ─────────────────────────────────────────────────────

/** One work order on a run sheet */
export interface RunSheetItem {
  model: string;     // part number, e.g. "449324TS"
  qty: number;       // total units ordered
  completed: number; // units finished so far (from scan log)
}

/** Full run sheet for one line, parsed from PDF */
export interface LineSchedule {
  lineId: string;      // matches dashboard Line.id, e.g. "vs1-l1"
  date: string;        // "2026-03-26"
  totalTarget: number; // sum of all qty
  items: RunSheetItem[];
}

/**
 * One packout scan event — mirrors the real MES "All Packout Scans" table.
 * Each scan represents exactly 1 finished unit (Qty = 1 EA).
 */
export interface ScanEvent {
  id: string;         // serial number, e.g. "BK0610253"
  timestamp: string;  // ISO 8601
  lineId: string;     // "vs1-l1"
  shift: "day" | "night";
  partNumber: string; // model # being produced
}

/**
 * Derived state for one line — returned by GET /api/mes/state.
 * Computed from the scan log + schedule on every request.
 */
export interface LineState {
  lineId: string;
  schedule: LineSchedule | null;
  totalOutput: number;           // total scans this session
  /** First incomplete order, or last order on sheet when fully complete */
  currentOrder: string | null;
  remainingOnOrder: number;      // 0 when sheet is done
  remainingOnRunSheet: number;   // 0 when sheet is done
  /** Number of fully completed orders — used as changeover count in EOS */
  completedOrders: number;
  /** Number of schedules waiting behind the active one */
  queuedCount: number;
  /** units per hour bucket, key = "HH:00", e.g. "07:00" → 12 */
  hourlyOutput: Record<string, number>;
}
