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

// ── Base ──────────────────────────────────────────────────────────────────────

interface ScrapEntryBase {
  id: string;           // "SCR-001" — sequential, resets with resetAll()
  timestamp: string;    // ISO 8601, auto-set at creation
  lineId: string;      // auto-populated from team-lead context
  shift: ShiftName;     // auto-populated from team-lead context
  model: string;        // part/model number
  panel: PanelPosition; // which panel position (A–G)
  damageType: DamageType;
  /** Placeholder for future ERP / external-system integration */
  boughtIn: boolean;
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

// ── Derived stats ─────────────────────────────────────────────────────────────

export interface ScrapStats {
  kickedLids: number;      // count of KickedLid entries
  scrappedPanels: number;  // count of ScrappedPanel entries
  totalBoughtIn: number;   // count where boughtIn === true
}
