import type { EOSStructuredNotes } from "./eos";
import type { ShiftName } from "./core";

export type ShiftHistoryStreamId = "all" | "vs1" | "vs2";

export interface ShiftHistoryLineRecord {
  lineKey: string;
  lineId: string;
  line: string;
  vsId: "vs1" | "vs2";
  vsName: string;
  output: number;
  target: number;
  attainment: number;
  fpy: number;
  hpu: number;
  headcount: number;
  changeovers: number;
  downtimeMinutes: number;
  downtimeUnitsLost: number;
  downtimeCount: number;
  openDowntimeCount: number;
  latestDowntimeReason: string;
  scrapPanels: number;
  kickedLids: number;
  totalScrap: number;
  availability: number;
  performance: number;
  oee: number;
  orderAtPackout: string;
  remainingOnOrder: number;
  remainingOnRunSheet: number;
  lineNotes: string;
  hidden: boolean;
  omitted: boolean;
}

export interface ShiftHistorySummary {
  output: number;
  target: number;
  attainment: number;
  avgFpy: number;
  avgHpu: number;
  avgOee: number;
  avgAvailability: number;
  avgPerformance: number;
  headcount: number;
  changeovers: number;
  downtimeMinutes: number;
  downtimeUnitsLost: number;
  downtimeCount: number;
  openDowntimeCount: number;
  scrapPanels: number;
  kickedLids: number;
  totalScrap: number;
  activeLineCount: number;
}

export interface ShiftHistoryRecord {
  contextKey: string;
  productionDate: string;
  shift: ShiftName;
  supervisor: string;
  notes: EOSStructuredNotes;
  submittedAt: string;
  lines: ShiftHistoryLineRecord[];
  summary: ShiftHistorySummary;
}
