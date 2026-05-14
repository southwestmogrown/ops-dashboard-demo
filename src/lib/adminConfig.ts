import type { ShiftName } from "@/lib/types/core";
import type { AdminLineConfig, ShiftConfig } from "@/lib/types/mes";

export function defaultShiftConfig(): ShiftConfig {
  return {
    supervisor: "",
    dailyTarget: 0,
    headcount: 0,
    isRunning: true,
  };
}

export function defaultAdminLineConfig(): AdminLineConfig {
  return {
    isRunning: true,
    day: defaultShiftConfig(),
    night: defaultShiftConfig(),
  };
}

export function withDerivedLineRunning(config: AdminLineConfig): AdminLineConfig {
  return {
    ...config,
    isRunning: config.day.isRunning || config.night.isRunning,
  };
}

export function isLineRunningForShift(
  config: AdminLineConfig | undefined,
  shift: ShiftName,
): boolean {
  return config?.[shift]?.isRunning ?? config?.isRunning ?? true;
}
