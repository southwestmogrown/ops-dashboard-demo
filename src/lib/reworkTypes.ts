/**
 * Rework / scrap quality tracking types.
 * ScrapEntry is a discriminated union: kind === "scrapped-panel" | "kicked-lid"
 */
import type { ShiftName } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PANEL_OPTIONS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type PanelPosition = (typeof PANEL_OPTIONS)[number];

export const DAMAGE_TYPES = [
  "Damaged Panel",
  "Bent Extrusion",
  "Wrong Part",
  "Missing Hardware",
  "Other",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

// ── M17.3 — Expanded defect categories for automated scrap injection ──────────

/** All defect types that can be injected by the simulator. */
export const DEFECT_TYPES = [
  "kicked-lid",
  "damaged-panel",
  "surface-scratch",
  "dimensional",
  "weld-defect",
  "missing-hardware",
  "electrical-fault",
  "sealing-fail",
] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];

/** Weighted defect pool for VS1 (folding) lines. Kicked lids are rare events (~3%). */
const VS1_DEFECT_WEIGHTS: [DefectType, number][] = [
  ["kicked-lid", 3],
  ["damaged-panel", 20],
  ["surface-scratch", 15],
  ["dimensional", 12],
  ["weld-defect", 8],
  ["missing-hardware", 7],
  ["electrical-fault", 4],
  ["sealing-fail", 4],
];

/** Weighted defect pool for VS2 (revolver) lines — more weld/electrical defects. Kicked lids ~2%. */
const VS2_DEFECT_WEIGHTS: [DefectType, number][] = [
  ["kicked-lid", 2],
  ["damaged-panel", 14],
  ["surface-scratch", 8],
  ["dimensional", 9],
  ["weld-defect", 20],
  ["missing-hardware", 9],
  ["electrical-fault", 13],
  ["sealing-fail", 9],
];

/**
 * Pick a random defect type from a weighted pool, using `isVS2` to switch
 * between VS1 and VS2 weight profiles.
 */
export function pickDefectType(isVS2: boolean): DefectType {
  const pool = isVS2 ? VS2_DEFECT_WEIGHTS : VS1_DEFECT_WEIGHTS;
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [type, weight] of pool) {
    r -= weight;
    if (r <= 0) return type;
  }
  return pool[0]![0]; // fallback
}

// ── Base ──────────────────────────────────────────────────────────────────────

interface ScrapEntryBase {
  id: string; // "SCR-001" — sequential, resets with resetAll()
  timestamp: string; // ISO 8601, auto-set at creation
  lineId: string; // auto-populated from team-lead context
  shift: ShiftName; // auto-populated from team-lead context
  model: string; // part/model number
  panel: PanelPosition; // which panel position (A–G)
  /** Manual-entry values (Damaged Panel, Bent Extrusion…) or sim-injected codes (kicked-lid, weld-defect…) */
  damageType: DamageType | DefectType;
  /** Placeholder for future ERP / external-system integration */
  boughtIn: boolean;
  /** Set when the entry has been voided/corrected — excluded from scrap stats but kept for audit */
  voidReason?: string;
}

// ── Scrap type ────────────────────────────────────────────────────────────────

export interface ScrappedPanel extends ScrapEntryBase {
  kind: "scrapped-panel";
  /** Where on the line the damage was discovered */
  stationFound: string;
  /** Free-text description of the specific damage */
  howDamaged: string;
}

// ── Kicked-lid type ───────────────────────────────────────────────────────────

export interface KickedLid extends ScrapEntryBase {
  kind: "kicked-lid";
  /** Which part of the unit was affected */
  affectedArea: "panel" | "extrusion";
  /** Auditor who found and logged the defect */
  auditorInitials: string;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type ScrapEntry = ScrappedPanel | KickedLid;
export type NewScrapEntry =
  | Omit<ScrappedPanel, "id" | "timestamp">
  | Omit<KickedLid, "id" | "timestamp">;

// ── Derived stats ─────────────────────────────────────────────────────────────

export interface ScrapStats {
  kickedLids: number; // count of KickedLid entries
  scrappedPanels: number; // count of ScrappedPanel entries
  totalBoughtIn: number; // count where boughtIn === true
}
