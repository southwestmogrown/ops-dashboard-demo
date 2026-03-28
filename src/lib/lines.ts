/**
 * Canonical line roster for the ops dashboard.
 * Single source of truth — import from here instead of redeclaring inline.
 *
 * Field names match the `Line` type from types.ts (id/name/valueStream).
 * Re-exported from generateMetrics to avoid a circular dep.
 */

import { getShiftWindows } from "./shiftTime";
import type { ShiftName } from "./types";

// Re-export the canonical line roster
export { LINE_DEFS as LINES } from "./generateMetrics";

/** Re-export helpers too so callers have one place to import from. */
export {
  generateMetrics,
  getDefaultHeadcount,
  getDefaultTarget,
} from "./generateMetrics";

/** Pre-computed short labels for sim/team-lead displays, e.g. "VS1 · Line 1" */
export const LINE_LABELS: Record<string, string> = Object.fromEntries(
  (["vs1-l1", "vs1-l2", "vs1-l3", "vs1-l4", "vs2-l1", "vs2-l2"] as const).map((id, i) => {
    const [vs, num] = id.split("-");
    const name = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 1", "Line 2"][i];
    return [id, `${vs.toUpperCase()} · ${name}`];
  })
);

/** Short machine-name labels for admin screens, e.g. "LINE_01" */
export const LINE_ADMIN_LABELS: Record<string, string> = {
  "vs1-l1": "LINE_01",
  "vs1-l2": "LINE_02",
  "vs1-l3": "LINE_03",
  "vs1-l4": "LINE_04",
  "vs2-l1": "LINE_05",
  "vs2-l2": "LINE_06",
};

/** Short human-readable label for a line, e.g. "VS1 · Line 1" */
export function getLineLabel(vs: string, name: string): string {
  return `${vs} · ${name}`;
}

/** Shift start hour (canonical — from shiftTime.ts). */
export function getShiftStartHour(shift: ShiftName): number {
  return getShiftWindows(shift).startHour;
}
