"use client";

import { useState } from "react";
import type { ScrapEntry } from "@/lib/reworkTypes";

interface ReworkPanelProps {
  entries: ScrapEntry[];
  kickedLids: number;
  scrappedPanels: number;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReworkPanel({
  entries,
  kickedLids,
  scrappedPanels,
}: ReworkPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-2 border-t border-border/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-left hover:opacity-80 transition-opacity p-0"
      >
        <span className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold">
          {entries.length} log entries
        </span>
        <span className="text-[#e1e2ec]/30 text-xs">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {entries.length === 0 ? (
            <p className="text-[10px] text-[#e1e2ec]/30 italic">No entries this shift.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 py-1.5">
                <span
                  className={`shrink-0 mt-0.5 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
                    entry.kind === "scrapped-panel"
                      ? "bg-status-red/20 text-status-red"
                      : "bg-status-amber/20 text-status-amber"
                  }`}
                >
                  {entry.kind === "scrapped-panel" ? "SC" : "KL"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[#e1e2ec]/80 text-[10px] font-mono">{entry.model}</span>
                    <span className="text-[#e1e2ec]/30 text-[10px]">Panel {entry.panel}</span>
                    <span className="text-[#e1e2ec]/30 text-[10px]">&middot;</span>
                    <span className="text-[#e1e2ec]/40 text-[10px] truncate">{entry.damageType}</span>
                    {entry.boughtIn && (
                      <span className="text-[8px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1 py-0.5">
                        BOUGHT IN
                      </span>
                    )}
                  </div>
                  <div className="text-[#e1e2ec]/30 text-[9px] mt-0.5">
                    {entry.kind === "scrapped-panel"
                      ? entry.stationFound || "\u2014"
                      : `Auditor: ${entry.auditorInitials || "\u2014"}`}
                    {" \u00B7 "}
                    {formatTime(entry.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
