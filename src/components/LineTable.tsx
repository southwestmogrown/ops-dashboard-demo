"use client";

import { Line } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";

interface LineTableProps {
  lines: Line[];
  onSelectLine: (lineId: string) => void;
  selectedLineId: string | null;
  mesStateMap?: Map<string, LineState>;
  shiftProgress?: ShiftProgress;
}

type RiskLevel = "none" | "amber" | "red";

function getRiskLevel(
  line: Line,
  mesState: LineState | undefined,
  shiftProgress: ShiftProgress | undefined
): RiskLevel {
  // FPY-based risk (static threshold)
  const fpyRisk = line.fpy < 90 && line.output < line.target;

  // Pace-based risk (only when MES schedule loaded and past warmup)
  let paceLevel: "none" | "amber" | "red" = "none";
  if (mesState?.schedule && shiftProgress && shiftProgress.elapsedHours >= 0.25) {
    const projected =
      (mesState.totalOutput / shiftProgress.elapsedHours) * shiftProgress.totalHours;
    const ratio = projected / line.target;
    if (ratio < 0.75) paceLevel = "red";
    else if (ratio < 0.9) paceLevel = "amber";
  }

  if (fpyRisk || paceLevel === "red") return "red";
  if (paceLevel === "amber") return "amber";
  return "none";
}

function getFpyColor(fpy: number): string {
  if (fpy >= 95) return "text-status-green";
  if (fpy >= 90) return "text-status-amber";
  return "text-status-red";
}

export default function LineTable({
  lines,
  onSelectLine,
  selectedLineId,
  mesStateMap,
  shiftProgress,
}: LineTableProps) {
  const tableHead = (
    <tr className="text-slate-400 text-xs uppercase tracking-wider">
      <th className="text-left pb-2 w-[15%]">Line</th>
      <th className="text-right pb-2 w-[12%]">Output</th>
      <th className="text-right pb-2 w-[12%]">Target</th>
      <th className="text-right pb-2 w-[12%]">FPY</th>
      <th className="text-right pb-2 w-[12%]">HPU</th>
      <th className="text-right pb-2 w-[10%]">HC</th>
    </tr>
  );

  function rowClass(line: Line) {
    if (line.id === selectedLineId) {
      return "cursor-pointer bg-accent/20 border-l-2 border-accent";
    }
    const risk = getRiskLevel(line, mesStateMap?.get(line.id), shiftProgress);
    if (risk === "red")   return "cursor-pointer border-l-2 border-status-red";
    if (risk === "amber") return "cursor-pointer border-l-2 border-status-amber";
    return "cursor-pointer border-l-2 border-transparent hover:bg-white/5";
  }

  function renderRows(vs: "VS1" | "VS2") {
    return lines.filter((l) => l.valueStream === vs).map((line) => (
      <tr key={line.id} className={rowClass(line)} onClick={() => onSelectLine(line.id)}>
        <td className="py-2">{line.name}</td>
        <td className="text-right py-2">{line.output}</td>
        <td className="text-right py-2 text-slate-500">{line.target}</td>
        <td className={`text-right py-2 ${getFpyColor(line.fpy)}`}>{line.fpy.toFixed(1)}%</td>
        <td className="text-right py-2">{line.hpu.toFixed(2)} hrs</td>
        <td className="text-right py-2">{line.headcount}</td>
      </tr>
    ));
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">VS1</div>
      <table className="w-full text-sm">
        <thead>{tableHead}</thead>
        <tbody>{renderRows("VS1")}</tbody>
      </table>
      <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-4 mb-2">VS2</div>
      <table className="w-full text-sm">
        <thead>{tableHead}</thead>
        <tbody>{renderRows("VS2")}</tbody>
      </table>
    </div>
  );
}
