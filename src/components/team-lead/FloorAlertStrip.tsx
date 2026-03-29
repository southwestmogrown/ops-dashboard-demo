"use client";

import { useState } from "react";
import type { Line } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import type { AdminLineConfig } from "@/lib/mesTypes";

export interface FloorAlert {
  lineId: string;
  lineName: string;
  issue: string;
  severity: "warning" | "critical";
}

function computeAlerts(
  lines: Line[],
  mesStates: LineState[],
  adminConfig: Record<string, AdminLineConfig>
): FloorAlert[] {
  const alerts: FloorAlert[] = [];
  const stateMap = new Map(mesStates.map((s) => [s.lineId, s]));

  for (const line of lines) {
    const isRunning = adminConfig?.[line.id]?.isRunning;
    const state = stateMap.get(line.id);
    if (isRunning === false) continue; // dormant line — skip

    const pct = line.target > 0 ? line.output / line.target : 0;

    if (line.output === 0 && state?.schedule) {
      alerts.push({ lineId: line.id, lineName: line.name, issue: "Zero Output", severity: "critical" });
    } else if (pct < 0.75) {
      alerts.push({ lineId: line.id, lineName: line.name, issue: "Behind Pace", severity: "warning" });
    }
    if (line.fpy < 90) {
      alerts.push({ lineId: line.id, lineName: line.name, issue: `FPY ${line.fpy.toFixed(1)}%`, severity: line.fpy < 85 ? "critical" : "warning" });
    }
  }

  return alerts;
}

interface FloorAlertStripProps {
  lines: Line[];
  mesStates: LineState[];
  adminConfig: Record<string, AdminLineConfig>;
}

export default function FloorAlertStrip({
  lines,
  mesStates,
  adminConfig,
}: FloorAlertStripProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const allAlerts = computeAlerts(lines, mesStates, adminConfig);
  const visibleAlerts = allAlerts.filter((a) => !dismissed.has(a.lineId + "|" + a.issue));
  const criticalCount = visibleAlerts.filter((a) => a.severity === "critical").length;
  const warningCount = visibleAlerts.filter((a) => a.severity === "warning").length;

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="mb-4">
      {/* Collapsed strip */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-sm border text-left transition-all ${
          criticalCount > 0
            ? "bg-status-red/10 border-status-red/30 hover:bg-status-red/15"
            : "bg-status-amber/10 border-status-amber/30 hover:bg-status-amber/15"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-base text-status-red">warning</span>
          <span className="text-xs font-bold text-[#e1e2ec]">
            {visibleAlerts.length === 1
              ? `${visibleAlerts[0].lineName}: ${visibleAlerts[0].issue}`
              : `${visibleAlerts.length} floor alert${visibleAlerts.length !== 1 ? "s" : ""}`}
          </span>
          <div className="flex gap-1.5">
            {criticalCount > 0 && (
              <span className="text-[9px] font-bold bg-status-red/20 text-status-red border border-status-red/30 rounded-sm px-1.5 py-0.5">
                {criticalCount} CRITICAL
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[9px] font-bold bg-status-amber/20 text-status-amber border border-status-amber/30 rounded-sm px-1.5 py-0.5">
                {warningCount} WARNING
              </span>
            )}
          </div>
        </div>
        <span className="text-[#e1e2ec]/40 text-xs">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {/* Expanded alert list */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-2">
          {visibleAlerts.map((alert) => (
            <div
              key={`${alert.lineId}|${alert.issue}`}
              className={`flex items-center justify-between px-3 py-2 rounded-sm border ${
                alert.severity === "critical"
                  ? "bg-status-red/5 border-status-red/20"
                  : "bg-status-amber/5 border-status-amber/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    alert.severity === "critical" ? "bg-status-red" : "bg-status-amber"
                  }`}
                />
                <span className="text-xs font-bold text-[#e1e2ec]">{alert.lineName}</span>
                <span className="text-xs text-[#e1e2ec]/40">&middot;</span>
                <span
                  className={`text-xs font-medium ${
                    alert.severity === "critical" ? "text-status-red" : "text-status-amber"
                  }`}
                >
                  {alert.issue}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed((prev) => new Set([...prev, `${alert.lineId}|${alert.issue}`]));
                }}
                className="text-[#e1e2ec]/30 hover:text-[#e1e2ec]/60 transition-colors text-xs"
                title="Dismiss"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { computeAlerts };
