import type { ShiftName } from "@/lib/types";

export const queryKeys = {
  metrics: (shift: ShiftName) => ["metrics", shift] as const,
  mesState: () => ["mes-state"] as const,
  adminConfig: () => ["admin-config"] as const,
  simClock: () => ["sim-clock"] as const,
  downtime: (shift: ShiftName) => ["downtime", shift] as const,
  scrapAll: (shift: ShiftName) => ["scrap", "all", shift] as const,
  lineComments: (lineId: string) => ["line-comments", lineId] as const,
};
