import type { ShiftName } from "./core";

export type DowntimeReason =
  | "machine-failure"
  | "material-shortage"
  | "quality-hold"
  | "planned-maintenance"
  | "operator-break"
  | "safety-stop"
  | "changeover"
  | "other";

export interface DowntimeEntry {
  id: string; // "DT-001"
  lineId: string;
  shift: ShiftName;
  reason: DowntimeReason;
  startTime: string; // ISO timestamp
  endTime: string | null; // null = ongoing
  unitsLost: number;
  notes: string;
  createdBy?: string;
}

export const DOWNTIME_REASON_LABELS: Record<DowntimeReason, string> = {
  "machine-failure": "Machine Failure",
  "material-shortage": "Material Shortage",
  "quality-hold": "Quality Hold",
  "planned-maintenance": "Planned Maintenance",
  "operator-break": "Operator Break",
  "safety-stop": "Safety Stop",
  changeover: "Changeover",
  other: "Other",
};
