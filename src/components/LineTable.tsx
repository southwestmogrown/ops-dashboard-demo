"use client";

import { useState } from "react";
import type { Line } from "@/lib/types";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import {
  getFpyColor,
  getPaceColor,
  getOeeColor,
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
  /** Set of line IDs with an open (ongoing) downtime entry */
  openDowntimeByLine?: Record<string, boolean>;
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

/** True when a line's output is more than 2 standard deviations below its VS average. */
function isDramaticallyOff(lines: Line[], vs: "VS1" | "VS2") {
  const vsLines = lines.filter((l) => l.valueStream === vs);
  if (vsLines.length < 2) return new Set<string>();
  const outputs = vsLines.map((l) => l.output);
  const avg = outputs.reduce((a, b) => a + b, 0) / outputs.length;
  const variance = outputs.reduce((s, v) => s + (v - avg) ** 2, 0) / outputs.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return new Set<string>();
  return new Set(
    vsLines.filter((l) => l.output < avg - 2 * stdDev).map((l) => l.id)
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

  // Place label outside when bar is short, inside when >= 30%
  const labelInside = pct >= 30;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-mono font-bold whitespace-nowrap text-[#e1e2ec]/60 shrink-0">
        {pct.toFixed(0)}%
      </span>
      <div className="flex-1 min-w-[80px] h-1.5 bg-surface-highest rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all relative`}
          style={{ width: `${pct}%` }}
        >
          {labelInside && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/70 leading-none">
              {output}/{target}
            </span>
          )}
        </div>
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
  openDowntimeByLine,
}: LineTableProps) {
  // ─── Sort state ─────────────────────────────────────────────────────────────
  type SortKey = "line" | "fpy" | "output" | "pace";

  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lt-sort");
      if (saved === "fpy" || saved === "output" || saved === "pace" || saved === "line") return saved;
    }
    return "fpy";
  });

  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lt-sort-dir");
      if (saved === "asc" || saved === "desc") return saved;
    }
    return "asc";
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      const next = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      localStorage.setItem("lt-sort-dir", next);
    } else {
      setSortKey(key);
      setSortDir("asc");
      localStorage.setItem("lt-sort", key);
      localStorage.setItem("lt-sort-dir", "asc");
    }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
    if (!active) {
      return (
        <svg className="inline w-2.5 h-2.5 ml-1 opacity-20" viewBox="0 0 10 14" fill="currentColor">
          <path d="M5 0L9 5H1L5 0ZM5 14L1 9H9L5 14Z" />
        </svg>
      );
    }
    return (
      <svg
        className={`inline w-2.5 h-2.5 ml-1 ${dir === "desc" ? "rotate-180" : ""}`}
        viewBox="0 0 10 14"
        fill="currentColor"
        style={{ color: "var(--color-accent)" }}
      >
        <path d="M5 0L9 5H1L5 0ZM5 14L1 9H9L5 14Z" />
      </svg>
    );
  }

  function renderRows(vs: "VS1" | "VS2") {
    const offSet = isDramaticallyOff(lines, vs);

    // Pre-compute pace for all lines in this VS group
    const linesWithPace = lines
      .filter((l) => l.valueStream === vs)
      .map((line) => {
        const mesState = mesStateMap?.get(line.id);
        const paceProjection = calcLinePace(
          mesState?.schedule ? mesState.totalOutput : line.output,
          shiftProgress?.elapsedHours ?? 0,
          shiftProgress?.totalHours ?? 10
        );
        const pacePerHour =
          paceProjection !== null && (shiftProgress?.totalHours ?? 0) > 0
            ? Math.round(paceProjection / (shiftProgress?.totalHours ?? 10))
            : null;
        return { line, paceProjection, pacePerHour };
      });

    // Sort if performance sort is active
    const sorted = [...linesWithPace].sort((a, b) => {
      if (sortKey === "line") return 0;
      if (sortKey === "fpy") return a.line.fpy - b.line.fpy;
      if (sortKey === "output") {
        const ap = a.line.target > 0 ? a.line.output / a.line.target : 0;
        const bp = b.line.target > 0 ? b.line.output / b.line.target : 0;
        return ap - bp;
      }
      if (sortKey === "pace") {
        const ap = a.pacePerHour ?? 0;
        const bp = b.pacePerHour ?? 0;
        return ap - bp;
      }
      return 0;
    });

    // When sort is "asc" (worst first), top 1-2 get a highlight ring
    const sortHighlightIdx = sortDir === "asc" && sortKey !== "line" ? 2 : 0;

    return sorted.map(({ line, paceProjection, pacePerHour }, idx) => {
      const mesState = mesStateMap?.get(line.id);
      const isRunning = adminConfig?.[line.id]?.isRunning;
      const risk = getRiskLevel(line, mesState, shiftProgress, isRunning);

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
        isZeroOutput,
        isRunning,
        openDowntimeByLine ? !!openDowntimeByLine[line.id] : false
      );

      const isSelected = line.id === selectedLineId;
      const dramaticOff = offSet.has(line.id);
      // Highlight top 1-2 rows under performance sort (worst-first), plus existing dramatic-off check
      const sortedHighlight = sortHighlightIdx > 0 && idx < sortHighlightIdx;

      return (
        <tr
          key={line.id}
          className={`cursor-pointer transition-colors border-b border-border/40 last:border-0 ${
            isSelected
              ? "bg-accent/10"
              : "hover:bg-surface-highest/30"
          } ${dramaticOff || sortedHighlight ? "ring-1 ring-red-500/60" : ""}`}
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
            <span
              title="First-pass yield: ≥95% = green, ≥90% = amber, &lt;90% = red"
              className="cursor-pointer"
              onClick={(e) => { e.stopPropagation(); handleSort("fpy"); }}
            >
              {line.fpy.toFixed(1)}%
            </span>
          </td>

          {/* HPU */}
          <td className="px-4 py-4 text-center font-mono text-sm text-[#e1e2ec]">
            <span className="inline-flex flex-col items-center">
              <span>{line.hpu.toFixed(2)}</span>
              <span className="text-[9px] text-[#e1e2ec]/30">Hrs/Unit</span>
            </span>
          </td>

          {/* Headcount */}
          <td className="px-4 py-4 text-center font-mono text-sm text-[#e1e2ec]">
            <span title={`Planned: ${plannedHc ?? "default"} HC`} className="cursor-help">
              {line.headcount}
              {plannedHc !== undefined && plannedHc !== line.headcount && (
                <span className="text-[9px] text-[#e1e2ec]/30 ml-0.5">/{plannedHc}</span>
              )}
            </span>
          </td>

          {/* OEE */}
          <td className={`px-4 py-4 text-center font-mono text-sm ${getOeeColor(line.oee)}`}>
            {line.oee.toFixed(1)}%
          </td>

          {/* Pace */}
          <td
            className={`px-4 py-4 text-center font-mono text-sm ${
              pacePerHour !== null && paceProjection !== null
                ? getPaceColor(paceProjection, line.target)
                : "text-[#e1e2ec]/30"
            }`}
          >
            <span
              className={pacePerHour !== null ? "cursor-pointer" : ""}
              onClick={(e) => { if (pacePerHour !== null) { e.stopPropagation(); handleSort("pace"); } }}
            >
              {pacePerHour !== null ? `${pacePerHour}/hr` : "—"}
            </span>
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
              <th
                className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center cursor-pointer select-none hover:text-[#e1e2ec]/80"
                onClick={() => handleSort("fpy")}
              >
                FPY (%)<SortIcon active={sortKey === "fpy"} dir={sortDir} />
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                HPU <span className="text-[#e1e2ec]/20 text-[8px] normal-case tracking-normal">(Hrs/Unit)</span>
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                Headcount
              </th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center">
                OEE
              </th>
              <th
                className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-[#e1e2ec]/50 text-center cursor-pointer select-none hover:text-[#e1e2ec]/80"
                onClick={() => handleSort("pace")}
              >
                Pace <span className="text-[#e1e2ec]/20 text-[8px] normal-case tracking-normal">(/hr)</span>
                <SortIcon active={sortKey === "pace"} dir={sortDir} />
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
                colSpan={8}
                className="px-6 py-2 text-[10px] font-bold text-accent uppercase tracking-[0.2em] border-l-4 border-accent"
              >
                {vsLabel.VS1}
              </td>
            </tr>
            {renderRows("VS1")}

            {/* VS2 group header */}
            <tr className="bg-surface-highest/20">
              <td
                colSpan={8}
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
