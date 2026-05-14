import { DOWNTIME_REASON_LABELS, type DowntimeEntry } from "@/lib/types/downtime";

export interface EOSDowntimeSummary {
  downtimeMinutes: string;
  downtimeCount: string;
  openDowntimeCount: string;
  latestDowntimeReason: string;
}

export const EMPTY_EOS_DOWNTIME_SUMMARY: EOSDowntimeSummary = {
  downtimeMinutes: "0",
  downtimeCount: "0",
  openDowntimeCount: "0",
  latestDowntimeReason: "",
};

export function summarizeDowntimeEntries(
  entries: DowntimeEntry[],
  now: Date = new Date(),
): EOSDowntimeSummary {
  if (entries.length === 0) {
    return { ...EMPTY_EOS_DOWNTIME_SUMMARY };
  }

  const nowMs = now.getTime();
  const downtimeMinutes = entries.reduce((sum, entry) => {
    const start = new Date(entry.startTime).getTime();
    const end = entry.endTime ? new Date(entry.endTime).getTime() : nowMs;
    return sum + Math.max(0, Math.floor((end - start) / 60000));
  }, 0);

  const latestEntry = [...entries].sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  )[0];

  return {
    downtimeMinutes: String(downtimeMinutes),
    downtimeCount: String(entries.length),
    openDowntimeCount: String(entries.filter((entry) => entry.endTime === null).length),
    latestDowntimeReason: latestEntry
      ? DOWNTIME_REASON_LABELS[latestEntry.reason]
      : "",
  };
}
