"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HourlyTargetRow } from "@/lib/shiftBreaks";
import type { ShiftName } from "@/lib/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface HourlyTableProps {
  rows: HourlyTargetRow[];
  comments: Record<string, string>;
  changeoversByHour?: Record<string, number>;
  shift: ShiftName;
  onSaveComment: (hour: string, comment: string) => Promise<void>;
}

const CommentInput = memo(function CommentInput({
  hour,
  value,
  saveStatus,
  onSave,
}: {
  hour: string;
  value: string;
  saveStatus: SaveStatus;
  onSave: (hour: string, comment: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localValue, setLocalValue] = useState(value);

  // Sync local state when the prop changes (e.g., after save completes)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSave(hour, e.target.value);
      }, 2000);
    },
    [hour, onSave],
  );

  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        value={localValue}
        placeholder="Add comment..."
        onChange={handleChange}
        className="min-w-0 flex-1 bg-transparent border-none text-sm text-[#f3f4f8]/85 focus:ring-0 p-0 outline-none placeholder:text-[#e1e2ec]/35"
        type="text"
      />
      {saveStatus === "saving" && (
        <span className="text-[#e1e2ec]/45 text-[11px] shrink-0 animate-pulse">
          …
        </span>
      )}
      {saveStatus === "saved" && (
        <span className="text-status-green text-[11px] shrink-0" title="Saved">
          &#10003;
        </span>
      )}
      {saveStatus === "error" && (
        <span
          className="text-status-red text-[11px] shrink-0"
          title="Save failed"
        >
          &#10007;
        </span>
      )}
    </div>
  );
});

export default function HourlyTable({
  rows,
  comments,
  changeoversByHour = {},
  shift,
  onSaveComment,
}: HourlyTableProps) {
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  const currentHourKey = useMemo(() => {
    const now = new Date();
    const nowUtcHour = now.getUTCHours();
    const key = `${String(nowUtcHour).padStart(2, "0")}:00`;
    if (rows.some((r) => r.hour === key)) {
      return key;
    }
    return null;
  }, [rows, shift]);

  const currentRowIdx = useMemo(() => {
    if (!currentHourKey) return -1;
    return rows.findIndex((r) => r.hour === currentHourKey);
  }, [rows, currentHourKey]);

  const handleSave = useCallback(
    async (hour: string, comment: string) => {
      setSaveStatus((prev) => ({ ...prev, [hour]: "saving" }));
      try {
        await onSaveComment(hour, comment);
        setSaveStatus((prev) => ({ ...prev, [hour]: "saved" }));
        setTimeout(() => {
          setSaveStatus((prev) => ({ ...prev, [hour]: "idle" }));
        }, 2000);
      } catch {
        setSaveStatus((prev) => ({ ...prev, [hour]: "error" }));
      }
    },
    [onSaveComment],
  );

  const totalVariance = useMemo(
    () =>
      rows
        .filter((r) => !r.isBreak && r.actual > 0)
        .reduce((sum, r) => sum + r.variance, 0),
    [rows],
  );

  return (
    <div className="bg-surface-low border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-widest">
          Shift Hourly Log
        </h3>
        <div className="flex gap-4 text-xs">
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
              <th className="px-6 py-3 text-[11px] font-bold text-[#e1e2ec]/55 uppercase">
                Hour
              </th>
              <th className="px-6 py-3 text-[11px] font-bold text-[#e1e2ec]/55 uppercase">
                Planned
              </th>
              <th className="px-6 py-3 text-[11px] font-bold text-[#e1e2ec]/55 uppercase">
                Actual
              </th>
              <th className="px-6 py-3 text-[11px] font-bold text-[#e1e2ec]/55 uppercase">
                Var
              </th>
              <th className="px-6 py-3 text-[11px] font-bold text-[#e1e2ec]/55 uppercase">
                Comments / Observations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {rows.map((row, idx) => {
              const isBreak = row.isBreak;
              const isFuture =
                !isBreak && currentRowIdx >= 0 && idx > currentRowIdx;
              const hasNegVar = !isBreak && !isFuture && row.variance < 0;
              const comment = comments[row.hour] ?? "";
              const status = saveStatus[row.hour] ?? "idle";

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
                  <td
                    className={`px-6 py-4 text-sm font-mono font-bold ${isFuture ? "text-[#e1e2ec]/25" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{row.hour}</span>
                      {(changeoversByHour[row.hour] ?? 0) > 0 && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded-sm bg-status-amber/20 text-status-amber border border-status-amber/30 uppercase">
                          Chg {changeoversByHour[row.hour]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`px-6 py-4 text-base font-['Space_Grotesk',sans-serif] tabular-nums ${isFuture ? "text-[#e1e2ec]/25" : ""}`}
                  >
                    {isBreak ? "—" : row.planned}
                  </td>
                  <td
                    className={`px-6 py-4 text-base font-['Space_Grotesk',sans-serif] tabular-nums font-bold ${
                      isBreak
                        ? "text-[#e1e2ec]/40"
                        : isFuture
                          ? "text-[#e1e2ec]/25"
                          : row.variance < 0
                            ? "text-accent"
                            : "text-status-green"
                    }`}
                  >
                    {isBreak ? "—" : isFuture ? "--" : row.actual}
                  </td>
                  <td
                    className={`px-6 py-4 text-sm font-bold ${
                      isBreak || isFuture
                        ? "text-[#e1e2ec]/25"
                        : row.variance > 0
                          ? "text-status-green"
                          : row.variance < 0
                            ? "text-accent"
                            : "text-[#e1e2ec]/55"
                    }`}
                  >
                    {isBreak
                      ? "—"
                      : isFuture
                        ? "--"
                        : row.variance > 0
                          ? `+${row.variance}`
                          : row.variance}
                  </td>
                  <td className="px-6 py-4">
                    {isBreak ? (
                      <span className="text-xs text-[#e1e2ec]/35 italic uppercase">
                        Break
                      </span>
                    ) : isFuture ? (
                      <span className="text-xs text-[#e1e2ec]/35 italic uppercase">
                        Upcoming
                      </span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {hasNegVar && comment ? (
                          <div className="flex items-center gap-2">
                            <span className="w-1 h-4 bg-accent shrink-0" />
                            <CommentInput
                              hour={row.hour}
                              value={comment}
                              saveStatus={status}
                              onSave={handleSave}
                            />
                          </div>
                        ) : (
                          <CommentInput
                            hour={row.hour}
                            value={comment}
                            saveStatus={status}
                            onSave={handleSave}
                          />
                        )}
                        {status === "error" && (
                          <p className="text-[10px] text-status-red pl-3">
                            Save failed — retry
                          </p>
                        )}
                      </div>
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
        <span className="text-xs font-bold text-[#e1e2ec]/55 uppercase">
          Total Shift Delta
        </span>
        <span
          className={`text-base font-['Space_Grotesk',sans-serif] font-bold tabular-nums ${
            totalVariance >= 0 ? "text-status-green" : "text-accent"
          }`}
        >
          {totalVariance >= 0 ? "+" : ""}
          {totalVariance} Units
        </span>
      </div>
    </div>
  );
}
