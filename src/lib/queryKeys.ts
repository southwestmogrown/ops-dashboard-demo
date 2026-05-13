import type { ShiftName } from "@/lib/types/core";

export const queryKeys = {
  metrics: (shift: ShiftName) => ["metrics", shift] as const,
  mesState: (shift: ShiftName) => ["mes-state", shift] as const,
  adminConfig: () => ["admin-config"] as const,
  simClock: () => ["sim-clock"] as const,
  downtime: (shift: ShiftName) => ["downtime", shift] as const,
  scrapAll: (shift: ShiftName) => ["scrap", "all", shift] as const,
  lineComments: (lineId: string, shift: ShiftName) =>
    ["line-comments", lineId, shift] as const,
};
