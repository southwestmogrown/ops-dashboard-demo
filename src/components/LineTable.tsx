"use client";

import type { Line } from "@/lib/types";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import {
  getFpyColor,
  getPaceColor,
  getRiskLevel,
  getStatusReasons,
  calcLinePace,
  PILL_STYLE,
  type RiskLevel,
} from "@/lib/status";

interface LineTableProps {
  lines: Line[];
  onSelectLine: (lineId: string) => void;
  selectedLineId: string | null;
  mesStateMap?: Map<string, LineState>;
  shiftProgress?: ShiftProgress;
  adminConfig?: Record<string, AdminLineConfig>;
  /** Tracks last-known totalOutput per lineId for zero-output detection */
  lastOutputRef?: React.MutableRefObject<Record<string, number>>;
}

function StatusPill({ risk, reasons }: { risk: RiskLevel; reasons: string[] }) {
  const { label, cls } = PILL_STYLE[risk];
  return (
    <span className="relative group inline-flex">
      <span
        className={`text-[10px] px-2 py-0.5 rounded-sm border font-bold tracking-widest uppercase ${cls}`}
      >
        {label}
      </span>
      {reasons.length > 0 && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
          <span className="block bg-background border border-border rounded px-2.5 py-1.5 text-[11px] text-[#e1e2ec]/80 whitespace-nowrap shadow-xl">
            {reasons.map((r, i) => (
              <span key={i} className="block">
                {r}
              </span>
            ))}
          </span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-background" />
        </span>
      )}
    </span>
  );
}

function OutputBar({ output, target }: { output: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (output / target) * 100) : 0;
  const barColor =
    pct >= 90
      ? "bg-status-green"
      : pct >= 75
      ? "bg-status-amber"
      : "bg-status-red";
  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm font-mono font-bold whitespace-nowrap">
        {output} / {target}
      </span>
      <div className="w-16 h-1.5 bg-surface-highest rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function LineTable({
  lines,
  onSelectLine,
  selectedLineId,
  mesStateMap,
  shiftProgress,
  adminConfig,
  lastOutputRef,
}: LineTableProps) {
  function renderRows(vs: "VS1" | "VS2") {
    return lines
      .filter((l) => l.valueStream === vs)
      .map((line) => {
        const mesState = mesStateMap?.get(line.id);
        const risk = getRiskLevel(line, mesState, shiftProgress);

        const plannedHc = adminConfig?.[line.id]?.headcount;
        const isZeroOutput = !!(
          lastOutputRef &&
          shiftProgress &&
          shiftProgress.elapsedHours >= 0.25 &&
          mesState &&
          mesState.totalOutput > 0 &&
          lastOutputRef.current[line.id] !== undefined &&
          lastOutputRef.current[line.id] === mesState.totalOutput
        );

        const reasons = getStatusReasons(
          line,
          mesState,
          shiftProgress,
          plannedHc,
          isZeroOutput
        );

        const pace = calcLinePace(
          mesState?.schedule ? mesState.totalOutput : line.output,
          shiftProgress?.elapsedHours ?? 0,
          shiftProgress?.totalHours ?? 10
        );

        const isSelected = line.id === selectedLineId;

        return (
          <tr
            key={line.id}
            className={`cursor-pointer transition-colors border-b border-border/40 last:border-0 ${
              isSelected
                ? "bg-accent/10"
                : "hover:bg-surface-highest/30"
            }`}
            onClick={() => onSelectLine(line.id)}
          >
            {/* Line Identification */}
            <td className="px-6 py-4">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-[#e1e2ec]">
                  {line.valueStream} {line.name}
                </span>
                <span className="text-[10px] text-[#e1e2ec]/40 mt-0.5">
                  {line.id}
                </span>
              </div>
            </td>

            {/* Output / Target */}
            <td className="px-4 py-4">
              <OutputBar output={line.output} target={line.target} />
            </td>

            {/* FPY */}
            <td className={`px-4 py-4 text-center font-mono text-sm ${getFpyColor(line.fpy)}`}>
              {line.fpy.toFixed(1)}%
            </td>

            {/* HPU */}
            <td className="px-4 py-4 text-center font-mono text-sm text-[#e1e2ec]">
              {line.hpu.toFixed(2)}
            </td>

            {/* Headcount */}
            <td className="px-4 py-4 text-center font-mono text-sm text-[#e1e2ec]">
              {line.headcount}
            </td>

            {/* Pace */}
            <td
              className={`px-4 py-4 text-center font-mono text-sm ${
                pace !== null
                  ? getPaceColor(pace, line.target)
                  : "text-[#e1e2ec]/30"
              }`}
            >
              {pace !== null ? pace : "—"}
            </td>

            {/* Status */}
            <td className="px-6 py-4 text-right">
              <StatusPill risk={risk} reasons={reasons} />
            </td>
          </tr>
        );
      });
  }

  const vsLabel: Record<"VS1" | "VS2", string> = {
    VS1: "Value Stream 1 · Folding",
    VS2: "Value Stream 2 · Revolver",
  };

  return (
    <div className="bg-surface rounded-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-high text-left">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50">
                Line Identification
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50">
                Output / Target
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                FPY (%)
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                HPU
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                Headcount
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                Pace
              </th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-right">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {/* VS1 group header */}
            <tr className="bg-surface-highest/20">
              <td
                colSpan={7}
                className="px-6 py-2 text-[10px] font-bold text-accent uppercase tracking-[0.2em] border-l-4 border-accent"
              >
                {vsLabel.VS1}
              </td>
            </tr>
            {renderRows("VS1")}

            {/* VS2 group header */}
            <tr className="bg-surface-highest/20">
              <td
                colSpan={7}
                className="px-6 py-2 text-[10px] font-bold text-vs2 uppercase tracking-[0.2em] border-l-4 border-vs2"
              >
                {vsLabel.VS2}
              </td>
            </tr>
            {renderRows("VS2")}
          </tbody>
        </table>
      </div>
    </div>
  );
}
