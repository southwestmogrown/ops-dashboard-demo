/**
 * Canonical line roster for the ops dashboard.
 * Single source of truth — import from here instead of redeclaring inline.
 *
 * Field names match the `Line` type from types.ts (id/name/valueStream).
 * Re-exported from generateMetrics to avoid a circular dep.
 */

import {
  LINE_DEFS,
  generateMetrics,
  getDefaultHeadcount,
  getDefaultTarget,
} from "./generateMetrics";
import { getShiftWindows } from "./shiftTime";
import type { ShiftName } from "./types";

// Re-export the canonical line roster
export const LINES = LINE_DEFS;

/** Re-export helpers too so callers have one place to import from. */
export { generateMetrics, getDefaultHeadcount, getDefaultTarget };

/** Pre-computed short labels for sim/team-lead displays. */
export const LINE_LABELS: Record<string, string> = {
  "vs1-l1": "VS1 · Folding Line_01",
  "vs1-l2": "VS1 · Folding Line_02",
  "vs1-l3": "VS1 · Folding Line_03",
  "vs1-l4": "VS1 · Folding Line_04",
  "vs2-l1": "VS2 · Revolver Line_01",
  "vs2-l2": "VS2 · Revolver Line_02",
};

/** Admin labels in plant terminology. */
export const LINE_ADMIN_LABELS: Record<string, string> = {
  "vs1-l1": "Folding Line_01",
  "vs1-l2": "Folding Line_02",
  "vs1-l3": "Folding Line_03",
  "vs1-l4": "Folding Line_04",
  "vs2-l1": "Revolver Line_01",
  "vs2-l2": "Revolver Line_02",
};

/** Short human-readable label for a line, e.g. "VS1 · Line 1" */
export function getLineLabel(vs: string, name: string): string {
  return `${vs} · ${name}`;
}

/** Shift start hour (canonical — from shiftTime.ts). */
export function getShiftStartHour(shift: ShiftName): number {
  return getShiftWindows(shift).startHour;
}

const LINE_ORDER = new Map(LINES.map((line, index) => [line.id, index]));

/** Canonical dashboard line ordering (VS1 Line_01 → VS2 Line_02). */
export function compareLineOrder(
  a: Pick<(typeof LINES)[number], "id" | "name">,
  b: Pick<(typeof LINES)[number], "id" | "name">
): number {
  const orderA = LINE_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const orderB = LINE_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.name.localeCompare(b.name);
}
