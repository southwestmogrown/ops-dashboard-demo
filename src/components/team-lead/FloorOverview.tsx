"use client";

import type { ShiftMetrics } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { AdminLineConfig } from "@/lib/mesTypes";
import type { ScrapEntry } from "@/lib/reworkTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import {
  getRiskLevel,
  getFpyColor,
  PILL_STYLE,
  type RiskLevel,
} from "@/lib/status";

interface FloorOverviewProps {
  metrics: ShiftMetrics;
  mesStates: LineState[];
  scrapEntries: ScrapEntry[];
  shiftProgress: ShiftProgress | undefined;
  adminConfig: Record<string, AdminLineConfig>;
  onSelectLine: (lineId: string) => void;
}

function OutputMiniBar({ output, target }: { output: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (output / target) * 100) : 0;
  const barColor =
    pct >= 90 ? "bg-status-green" : pct >= 75 ? "bg-status-amber" : "bg-status-red";
  return (
    <div className="w-full h-1.5 bg-surface-highest rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusDot({ fpy }: { fpy: number }) {
  const color =
    fpy >= 95
      ? "bg-status-green shadow-[0_0_8px_rgba(34,197,94,0.5)]"
      : fpy >= 90
      ? "bg-status-amber shadow-[0_0_8px_rgba(245,158,11,0.5)]"
      : "bg-status-red shadow-[0_0_8px_rgba(239,68,68,0.5)]";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(isoTimestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

interface LineCardProps {
  lineId: string;
  lineName: string;
  valueStream: string;
  output: number;
  target: number;
  fpy: number;
  risk: RiskLevel;
  lastScrapTime: string | null;
  onSelect: () => void;
}

function LineCard({
  lineId,
  lineName,
  valueStream,
  output,
  target,
  fpy,
  risk,
  lastScrapTime,
  onSelect,
}: LineCardProps) {
  const { label, cls } = PILL_STYLE[risk];
  const vsAccent =
    valueStream === "VS1" ? "bg-accent" : "bg-vs2";
  const vsBadge =
    valueStream === "VS1"
      ? "bg-accent/15 text-accent border border-accent/30"
      : "bg-vs2/15 text-vs2 border border-vs2/30";

  return (
    <button
      onClick={onSelect}
      className="group w-full text-left bg-surface hover:bg-surface-high transition-all duration-150 rounded-sm overflow-hidden focus:outline-none focus:ring-1 focus:ring-accent/40"
    >
      {/* Top accent bar */}
      <div className={`h-[2px] w-full ${vsAccent}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#e1e2ec] font-['Space_Grotesk',sans-serif]">
                {lineName}
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${vsBadge}`}
              >
                {valueStream}
              </span>
            </div>
            <span className="text-[10px] text-[#e1e2ec]/30 font-mono">{lineId}</span>
          </div>

          {/* Status pill */}
          <span className={`text-[9px] px-2 py-0.5 rounded-sm border font-bold tracking-widest uppercase ${cls}`}>
            {label}
          </span>
        </div>

        {/* Output / Target */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold">
              Output
            </span>
            <span className="text-xs font-mono font-bold text-[#e1e2ec]">
              {output}
              <span className="text-[#e1e2ec]/30">/{target}</span>
            </span>
          </div>
          <OutputMiniBar output={output} target={target} />
        </div>

        {/* FPY + Last Scrap row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <StatusDot fpy={fpy} />
            <span className={`text-xs font-mono font-bold ${getFpyColor(fpy)}`}>
              {fpy.toFixed(1)}%
            </span>
            <span className="text-[10px] text-[#e1e2ec]/30">FPY</span>
          </div>

          {lastScrapTime && (
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[12px] text-[#e1e2ec]/20">
                error
              </span>
              <span className="text-[10px] text-[#e1e2ec]/30 font-mono">
                {formatRelativeTime(lastScrapTime)}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function FloorOverview({
  metrics,
  mesStates,
  scrapEntries,
  shiftProgress,
  adminConfig,
  onSelectLine,
}: FloorOverviewProps) {
  const stateMap = new Map(mesStates.map((s) => [s.lineId, s]));

  // Build a map of the most recent scrap timestamp per line
  const lastScrapByLine = new Map<string, string>();
  for (const entry of scrapEntries) {
    const existing = lastScrapByLine.get(entry.lineId);
    if (!existing || entry.timestamp > existing) {
      lastScrapByLine.set(entry.lineId, entry.timestamp);
    }
  }

  return (
    <div>
      {/* Section heading */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <h2 className="font-['Space_Grotesk',sans-serif] text-sm font-black uppercase tracking-widest text-[#e1e2ec]/40">
          Floor Overview
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Card grid — 2-col on md, 3-col on xl */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {metrics.lines.map((line) => {
          const mesState = stateMap.get(line.id);
          const isRunning = adminConfig?.[line.id]?.isRunning;
          const risk = getRiskLevel(line, mesState, shiftProgress, isRunning);

          return (
            <LineCard
              key={line.id}
              lineId={line.id}
              lineName={line.name}
              valueStream={line.valueStream}
              output={line.output}
              target={line.target}
              fpy={line.fpy}
              risk={risk}
              lastScrapTime={lastScrapByLine.get(line.id) ?? null}
              onSelect={() => onSelectLine(line.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
