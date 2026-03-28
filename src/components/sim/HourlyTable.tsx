"use client";

import type { LineState } from "@/lib/mesTypes";

interface HourlyTableProps {
  states: LineState[];
  lineLabels: Record<string, string>;
}

export default function HourlyTable({ states, lineLabels }: HourlyTableProps) {
  const hourSet = new Set<string>();
  for (const state of states) {
    Object.keys(state.hourlyOutput).forEach((h) => hourSet.add(h));
  }

  if (hourSet.size === 0) {
    return (
      <div className="text-xs text-[#e1e2ec]/30 text-center py-6">
        No scans yet — start the simulation to see hourly output.
      </div>
    );
  }

  const hours = Array.from(hourSet).sort();
  const activeStates = states.filter((s) => s.schedule !== null);

  // Compute column totals
  const colTotals: Record<string, number> = {};
  for (const s of activeStates) {
    colTotals[s.lineId] = Object.values(s.hourlyOutput).reduce((sum, v) => sum + v, 0);
  }
  const grandTotal = Object.values(colTotals).reduce((sum, v) => sum + v, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-surface-highest sticky top-0 border-b border-border/20">
          <tr>
            <th className="px-6 py-3 text-left font-bold uppercase tracking-widest text-[10px] text-[#e1e2ec]/40">
              Hour
            </th>
            {activeStates.map((s) => (
              <th key={s.lineId} className="px-4 py-3 text-right font-bold uppercase tracking-widest text-[10px] text-[#e1e2ec]/40">
                {lineLabels[s.lineId] ?? s.lineId}
              </th>
            ))}
            <th className="px-6 py-3 text-right font-bold uppercase tracking-widest text-[10px] text-accent/60">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="font-mono divide-y divide-border/5">
          {hours.map((hour) => {
            const rowTotal = activeStates.reduce(
              (sum, s) => sum + (s.hourlyOutput[hour] ?? 0),
              0
            );
            return (
              <tr key={hour} className="hover:bg-accent/5 transition-colors">
                <td className="px-6 py-3 text-[#e1e2ec]/50">
                  {hour}–{String((parseInt(hour) + 1) % 24).padStart(2, "0")}:00
                </td>
                {activeStates.map((s) => {
                  const val = s.hourlyOutput[hour];
                  return (
                    <td key={s.lineId} className="px-4 py-3 text-right text-[#e1e2ec]/80">
                      {val ?? <span className="text-[#e1e2ec]/15">—</span>}
                    </td>
                  );
                })}
                <td className="px-6 py-3 text-right text-accent font-semibold">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border/20">
          <tr className="bg-surface-highest/50">
            <td className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/40">
              Total
            </td>
            {activeStates.map((s) => (
              <td key={s.lineId} className="px-4 py-3 text-right font-semibold text-[#e1e2ec]/60">
                {colTotals[s.lineId] ?? 0}
              </td>
            ))}
            <td className="px-6 py-3 text-right font-bold text-accent">
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
