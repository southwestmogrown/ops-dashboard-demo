export type EOSShift = "Day" | "Night";

export interface EOSValueStream {
  id: string; // "vs1" | "vs2"
  name: string; // "HFC (Hard Folding Covers)" | "HRC (Hard Rolling Cover)"
  lines: string[]; // ["Line 1", "Line 2", ...]
}

// Flat descriptor used to iterate all lines across all value streams
export interface EOSLineDescriptor {
  vsId: string;
  vsName: string;
  line: string;
  lineKey: string; // "${vsId}:${line}" — unique key for formData.lines map
}

// Per-line data entered by the supervisor
export interface EOSLineEntry {
  output: string;
  hpu: string; // auto-calculated; read-only in the UI
  hoursWorked: string;
  headcount: string;
  orderAtPackout: string;
  remainingOnOrder: string;
  remainingOnRunSheet: string;
  changeovers: string;
  lineNotes: string;
}

// Structured notes fields for the Operational Summary section
export interface EOSStructuredNotes {
  topIssueToday: string; // required
  resolvedDuringShift: string; // visible only when checked (checkbox + text)
  openItemsNextShift: string; // visible only when checked (checkbox + text)
  equipmentConcerns: string; // visible only when checked (checkbox + text)
  generalNotes: string; // optional multi-line
}

// Top-level form state
export interface EOSFormData {
  supervisor: string;
  date: string; // ISO date string, e.g. "2026-03-26"
  shift: EOSShift;
  notes: EOSStructuredNotes;
  lines: Record<string, EOSLineEntry>; // keyed by lineKey
}
