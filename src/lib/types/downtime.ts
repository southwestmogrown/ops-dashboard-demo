import type { ShiftName } from "./core";

export type ActiveDowntimeReason =
  | "angle-saw-down"
  | "panel-saw-down"
  | "vacuum-table-down"
  | "waiting-for-material"
  | "waiting-for-rails"
  | "waiting-for-sides"
  | "waiting-for-tophats"
  | "waiting-for-extrusion"
  | "bander-down"
  | "planned-maintenance"
  | "quality-hold"
  | "other";

export type LegacyDowntimeReason =
  | "waiting-for-rails-sides-tophats-extrusion"
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
  "waiting-for-rails",
  "waiting-for-sides",
  "waiting-for-tophats",
  "waiting-for-extrusion",
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
  "waiting-for-rails": "Waiting for Rails",
  "waiting-for-sides": "Waiting for Sides",
  "waiting-for-tophats": "Waiting for Tophats",
  "waiting-for-extrusion": "Waiting for Extrusion",
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

const DOWNTIME_REASON_BY_LABEL = Object.fromEntries(
  Object.entries(DOWNTIME_REASON_LABELS).map(([reason, label]) => [label, reason]),
) as Record<string, DowntimeReason>;

export function getDowntimeReasonBadgeClass(reason: DowntimeReason | string): string {
  const map: Record<DowntimeReason, string> = {
    "angle-saw-down": "bg-status-red/20 text-status-red border-status-red/20",
    "panel-saw-down": "bg-status-red/20 text-status-red border-status-red/20",
    "vacuum-table-down": "bg-status-red/20 text-status-red border-status-red/20",
    "bander-down": "bg-status-red/20 text-status-red border-status-red/20",
    "waiting-for-material":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "waiting-for-rails":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "waiting-for-sides":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "waiting-for-tophats":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "waiting-for-extrusion":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "waiting-for-rails-sides-tophats-extrusion":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "quality-hold": "bg-status-amber/20 text-status-amber border-status-amber/20",
    "planned-maintenance": "bg-blue-500/20 text-blue-400 border-blue-400/20",
    "machine-failure": "bg-status-red/20 text-status-red border-status-red/20",
    "material-shortage":
      "bg-status-amber/20 text-status-amber border-status-amber/20",
    "operator-break": "bg-slate-500/20 text-slate-400 border-slate-400/20",
    "safety-stop": "bg-red-600/20 text-red-500 border-red-500/20",
    changeover: "bg-purple-500/20 text-purple-400 border-purple-400/20",
    other: "bg-slate-500/20 text-slate-400 border-slate-400/20",
  };
  const normalizedReason =
    reason in map
      ? (reason as DowntimeReason)
      : DOWNTIME_REASON_BY_LABEL[reason] ?? "other";
  return map[normalizedReason];
}
