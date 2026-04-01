"use client";

import { useState, useEffect } from "react";
import type { DowntimeEntry } from "@/lib/types/downtime";
import { DOWNTIME_REASON_LABELS } from "@/lib/types/downtime";

interface DowntimePanelProps {
  entries: DowntimeEntry[];
  onLogStop: () => void;
  onResolve: (entry: DowntimeEntry) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.floor((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getReasonBadge(reason: DowntimeEntry["reason"]): string {
  const map: Record<string, string> = {
    "machine-failure": "bg-status-red/20 text-status-red",
    "material-shortage": "bg-status-amber/20 text-status-amber",
    "quality-hold": "bg-status-amber/20 text-status-amber",
    "planned-maintenance": "bg-blue-500/20 text-blue-400",
    "operator-break": "bg-slate-500/20 text-slate-400",
    "safety-stop": "bg-red-600/20 text-red-500",
    changeover: "bg-purple-500/20 text-purple-400",
    other: "bg-slate-500/20 text-slate-400",
  };
  return map[reason] ?? "bg-slate-500/20 text-slate-400";
}

export default function DowntimePanel({
  entries,
  onLogStop,
  onResolve,
}: DowntimePanelProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const hasOngoing = entries.some((e) => e.endTime === null);
    if (!hasOngoing) return;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [entries]);

  const totalMinutes = entries.reduce<number>((sum, e) => {
    const start = new Date(e.startTime).getTime();
    const end = e.endTime ? new Date(e.endTime).getTime() : now;
    return sum + Math.floor((end - start) / 60000);
  }, 0);

  const totalLabel =
    totalMinutes < 60
      ? `${totalMinutes} min`
      : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60 > 0 ? `${totalMinutes % 60}m` : ""}`.trim();

  return (
    <div className="pt-2 border-t border-border/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-left hover:opacity-80 transition-opacity p-0"
      >
        <span className="text-[11px] text-[#e1e2ec]/55 uppercase tracking-widest font-bold flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-status-red">
            flag
          </span>
          {entries.length === 0 ? "No downtime" : `${totalLabel} downtime`}
        </span>
        <span className="text-[#e1e2ec]/45 text-sm">
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {entries.length === 0 ? (
            <p className="text-xs text-[#e1e2ec]/45 italic">
              No downtime logged this shift.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-background/55 p-3 rounded-sm border border-border/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${getReasonBadge(entry.reason)}`}
                      >
                        {DOWNTIME_REASON_LABELS[entry.reason]}
                      </span>
                      {entry.endTime === null && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-status-red/20 text-status-red animate-pulse">
                          ONGOING
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#e1e2ec]/75 mt-1 font-mono">
                      {formatTime(entry.startTime)}
                      {entry.endTime ? (
                        <> &rarr; {formatTime(entry.endTime)}</>
                      ) : (
                        <>
                          {" "}
                          &rarr; <span className="text-status-red">now</span>
                        </>
                      )}
                      <span className="text-[#e1e2ec]/45 ml-1">
                        &middot;{" "}
                        {formatDuration(entry.startTime, entry.endTime)}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-[10px] text-[#e1e2ec]/45 mt-0.5 italic truncate">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                  {entry.unitsLost > 0 && (
                    <span className="shrink-0 text-[10px] font-mono bg-status-red/10 text-status-red border border-status-red/20 px-1.5 py-0.5 rounded-sm">
                      {entry.unitsLost} lost
                    </span>
                  )}
                  {entry.endTime === null && (
                    <button
                      onClick={() => onResolve(entry)}
                      className="shrink-0 text-[10px] font-bold bg-status-green/10 text-status-green border border-status-green/20 px-1.5 py-0.5 rounded-sm hover:bg-status-green/20 transition-colors cursor-pointer"
                    >
                      RESOLVE
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          <button
            onClick={onLogStop}
            className="w-full mt-1 bg-transparent border border-accent/30 text-accent text-[11px] font-bold uppercase tracking-widest py-2 rounded-sm hover:bg-accent/10 transition-colors cursor-pointer"
          >
            + Log Stop
          </button>
        </div>
      )}
    </div>
  );
}
