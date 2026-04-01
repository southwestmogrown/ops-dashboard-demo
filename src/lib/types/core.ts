// The three valid shift names throughout the app
export type ShiftName = "day" | "night";

// A single production line's current metrics
export interface Line {
  id: string; // "vs1-l1", "vs2-l1" etc — unique across the whole dashboard
  name: string; // "Line 1", "Line 2" — display name
  valueStream: string; // "VS1" or "VS2"
  output: number; // units produced so far this shift
  target: number; // units expected by end of shift
  fpy: number; // first-pass yield as a percentage, e.g. 94.7
  hpu: number; // hours per unit, e.g. 0.42
  headcount: number; // active operators right now
  changeovers: number; // number of changeovers this shift
  // OEE components (0–100 scale, OEE = A × P × Q)
  oee: number; // overall equipment effectiveness as a decimal (0–1), e.g. 0.783
  availability: number; // uptime ratio, e.g. 90.0
  performance: number; // speed ratio vs standard, e.g. 92.0
  quality: number; // FPY as a 0–100 scale, e.g. 94.7
}

// A single data point in a time-series chart
export interface TimePoint {
  time: string; // display label, e.g. "06:00", "06:30"
  vs1Output: number; // cumulative output for VS1 at this point
  vs2Output: number; // cumulative output for VS2 at this point
}

// The full payload returned by /api/metrics
export interface ShiftMetrics {
  shift: ShiftName;
  generatedAt: string; // ISO timestamp string, e.g. "2024-01-15T08:32:00Z"
  lines: Line[]; // all 5 lines
  trend: TimePoint[]; // time-series data for the trend chart
}
