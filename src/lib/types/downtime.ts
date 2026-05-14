import type { ShiftName } from "./core";

export type ActiveDowntimeReason =
  | "angle-saw-down"
  | "panel-saw-down"
  | "vacuum-table-down"
  | "waiting-for-material"
  | "waiting-for-rails-sides-tophats-extrusion"
  | "bander-down"
  | "planned-maintenance"
  | "quality-hold"
  | "other";

export type LegacyDowntimeReason =
  | "machine-failure"
  | "material-shortage"
  | "operator-break"
  | "safety-stop"
  | "changeover";

export type DowntimeReason =
  | ActiveDowntimeReason
  | LegacyDowntimeReason;

export const ACTIVE_DOWNTIME_REASONS: ActiveDowntimeReason[] = [
  "angle-saw-down",
  "panel-saw-down",
  "vacuum-table-down",
  "waiting-for-material",
  "waiting-for-rails-sides-tophats-extrusion",
  "bander-down",
  "planned-maintenance",
  "quality-hold",
  "other",
];

export function isActiveDowntimeReason(
  value: unknown,
): value is ActiveDowntimeReason {
  return (
    typeof value === "string" &&
    ACTIVE_DOWNTIME_REASONS.includes(value as ActiveDowntimeReason)
  );
}

export interface DowntimeEntry {
  id: string; // "DT-001"
  lineId: string;
  shift: ShiftName;
  productionDate: string;
  reason: DowntimeReason;
  startTime: string; // ISO timestamp
  endTime: string | null; // null = ongoing
  unitsLost: number;
  notes: string;
  createdBy?: string;
}

export const DOWNTIME_REASON_LABELS: Record<DowntimeReason, string> = {
  "angle-saw-down": "Angle Saw Down",
  "panel-saw-down": "Panel Saw Down",
  "vacuum-table-down": "Vacuum Table Down",
  "waiting-for-material": "Waiting for Material",
  "waiting-for-rails-sides-tophats-extrusion":
    "Waiting for Rails/Sides/Tophats/Extrusion",
  "bander-down": "Bander Down",
  "quality-hold": "Quality Hold",
  "planned-maintenance": "Planned Maintenance",
  other: "Other",
  "machine-failure": "Machine Failure",
  "material-shortage": "Material Shortage",
  "operator-break": "Operator Break",
  "safety-stop": "Safety Stop",
  changeover: "Changeover",
};
