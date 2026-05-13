import type { ShiftMetrics, ShiftName } from "@/lib/types/core";
import type { AdminLineConfig, LineState, SimState } from "@/lib/types/mes";
import type { DowntimeEntry } from "@/lib/types/downtime";
import type { ScrapEntry } from "@/lib/types/quality";
import { authFetch } from "@/lib/clientAuth";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await authFetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed: ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchMetrics(shift: ShiftName): Promise<ShiftMetrics> {
  return fetchJson<ShiftMetrics>(`/api/metrics?shift=${shift}`);
}

export function fetchMesState(shift: ShiftName): Promise<LineState[]> {
  return fetchJson<LineState[]>(`/api/mes/state?shift=${shift}`);
}

export function fetchAdminConfig(): Promise<Record<string, AdminLineConfig>> {
  return fetchJson<Record<string, AdminLineConfig>>("/api/admin/config");
}

export function fetchSimClock(): Promise<SimState> {
  return fetchJson<SimState>("/api/sim/clock");
}

export function fetchDowntime(shift: ShiftName): Promise<DowntimeEntry[]> {
  return fetchJson<DowntimeEntry[]>(`/api/downtime?shift=${shift}`);
}

export function fetchScrapAll(shift: ShiftName): Promise<ScrapEntry[]> {
  return fetchJson<ScrapEntry[]>(`/api/scrap?lineId=all&shift=${shift}`);
}

export function fetchLineComments(
  lineId: string,
  shift: ShiftName,
): Promise<Record<string, string>> {
  return fetchJson<Record<string, string>>(
    `/api/line/comments?lineId=${lineId}&shift=${shift}`,
  );
}
