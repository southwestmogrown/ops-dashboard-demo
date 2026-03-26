"use client";

import type { LineState } from "@/lib/mesTypes";

interface HourlyTableProps {
  states: LineState[];
  lineLabels: Record<string, string>; // lineId → display label
}

export default function HourlyTable({ states, lineLabels }: HourlyTableProps) {
  // Collect all hours that appear in any line
  const hourSet = new Set<string>();
  for (const state of states) {
    Object.keys(state.hourlyOutput).forEach((h) => hourSet.add(h));
  }

  if (hourSet.size === 0) {
    return (
      <div className="text-xs text-slate-600 text-center py-6">
        No scans yet — start the simulation to see hourly output.
      </div>
    );
  }

  const hours = Array.from(hourSet).sort();
  const activeStates = states.filter((s) => s.schedule !== null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 uppercase tracking-widest border-b border-border">
            <th className="text-left py-2 pr-4 font-medium">Hour</th>
            {activeStates.map((s) => (
              <th key={s.lineId} className="text-right py-2 px-3 font-medium">
                {lineLabels[s.lineId] ?? s.lineId}
              </th>
            ))}
            <th className="text-right py-2 pl-3 font-medium text-slate-400">Total</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => {
            const rowTotal = activeStates.reduce(
              (sum, s) => sum + (s.hourlyOutput[hour] ?? 0),
              0
            );
            return (
              <tr key={hour} className="border-b border-border/50 hover:bg-surface/50">
                <td className="py-1.5 pr-4 text-slate-400 font-mono">
                  {hour}–{String((parseInt(hour) + 1) % 24).padStart(2, "0")}:00
                </td>
                {activeStates.map((s) => (
                  <td key={s.lineId} className="text-right py-1.5 px-3 text-slate-300 font-mono">
                    {s.hourlyOutput[hour] ?? "—"}
                  </td>
                ))}
                <td className="text-right py-1.5 pl-3 text-accent font-mono font-semibold">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
