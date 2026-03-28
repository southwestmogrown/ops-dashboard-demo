"use client";

import { useCallback, useRef } from "react";
import type { HourlyTargetRow } from "@/lib/shiftBreaks";

interface HourlyTableProps {
  rows: HourlyTargetRow[];
  comments: Record<string, string>;
  onSaveComment: (hour: string, comment: string) => void;
}

function CommentInput({
  hour,
  value,
  onSave,
}: {
  hour: string;
  value: string;
  onSave: (hour: string, comment: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSave(hour, e.target.value);
      }, 500);
    },
    [hour, onSave]
  );

  return (
    <input
      defaultValue={value}
      placeholder="Add comment..."
      onChange={handleChange}
      className="w-full bg-transparent border-none text-xs text-[#e1e2ec]/60 focus:ring-0 p-0 outline-none placeholder:text-[#e1e2ec]/20"
      type="text"
    />
  );
}

export default function HourlyTable({ rows, comments, onSaveComment }: HourlyTableProps) {
  const totalVariance = rows
    .filter((r) => !r.isBreak && r.actual > 0)
    .reduce((sum, r) => sum + r.variance, 0);

  return (
    <div className="bg-surface-low border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-widest">Shift Hourly Log</h3>
        <div className="flex gap-4 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-status-green rounded-sm" /> ON TARGET
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-accent rounded-sm" /> VARIANCE
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-background/50">
            <tr>
              <th className="px-6 py-3 text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Hour</th>
              <th className="px-6 py-3 text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Planned</th>
              <th className="px-6 py-3 text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Actual</th>
              <th className="px-6 py-3 text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Var</th>
              <th className="px-6 py-3 text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Comments / Observations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {rows.map((row) => {
              const isBreak = row.isBreak;
              const isFuture = !isBreak && row.actual === 0 && row.planned > 0;
              const hasNegVar = !isBreak && !isFuture && row.variance < 0;
              const comment = comments[row.hour] ?? "";

              return (
                <tr
                  key={row.hour}
                  className={`hover:bg-surface-high/20 transition-colors ${
                    isBreak
                      ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,rgba(255,255,255,0.02)_8px,rgba(255,255,255,0.02)_16px)]"
                      : hasNegVar
                        ? "bg-accent/5"
                        : ""
                  }`}
                >
                  <td className={`px-6 py-4 text-xs font-mono font-bold ${isFuture ? "text-[#e1e2ec]/20" : ""}`}>
                    {row.hour}
                  </td>
                  <td className={`px-6 py-4 text-sm font-['Space_Grotesk',sans-serif] tabular-nums ${isFuture ? "text-[#e1e2ec]/20" : ""}`}>
                    {isBreak ? "—" : row.planned}
                  </td>
                  <td className={`px-6 py-4 text-sm font-['Space_Grotesk',sans-serif] tabular-nums font-bold ${
                    isBreak ? "text-[#e1e2ec]/30"
                      : isFuture ? "text-[#e1e2ec]/20"
                      : row.variance < 0 ? "text-accent"
                      : "text-status-green"
                  }`}>
                    {isBreak ? "—" : isFuture ? "--" : row.actual}
                  </td>
                  <td className={`px-6 py-4 text-xs font-bold ${
                    isBreak || isFuture ? "text-[#e1e2ec]/20"
                      : row.variance > 0 ? "text-status-green"
                      : row.variance < 0 ? "text-accent"
                      : "text-[#e1e2ec]/40"
                  }`}>
                    {isBreak ? "—" : isFuture ? "--" : (row.variance > 0 ? `+${row.variance}` : row.variance)}
                  </td>
                  <td className="px-6 py-4">
                    {isBreak ? (
                      <span className="text-[10px] text-[#e1e2ec]/20 italic uppercase">Break</span>
                    ) : isFuture ? (
                      <span className="text-[10px] text-[#e1e2ec]/20 italic uppercase">Upcoming</span>
                    ) : hasNegVar && comment ? (
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-4 bg-accent shrink-0" />
                        <CommentInput hour={row.hour} value={comment} onSave={onSaveComment} />
                      </div>
                    ) : (
                      <CommentInput hour={row.hour} value={comment} onSave={onSaveComment} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-surface-low flex justify-between items-center border-t border-border/40">
        <span className="text-[10px] font-bold text-[#e1e2ec]/40 uppercase">Total Shift Delta</span>
        <span className={`text-sm font-['Space_Grotesk',sans-serif] font-bold tabular-nums ${
          totalVariance >= 0 ? "text-status-green" : "text-accent"
        }`}>
          {totalVariance >= 0 ? "+" : ""}{totalVariance} Units
        </span>
      </div>
    </div>
  );
}
