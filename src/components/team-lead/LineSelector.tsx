"use client";

import { Line } from "@/lib/types/core";
import type { LineState } from "@/lib/types/mes";
import { getOutputColor } from "@/lib/status";

interface LineSelectorProps {
  lines: Line[];
  mesStates: LineState[];
  onSelectLine: (lineId: string) => void;
}

const VS_COLORS: Record<string, string> = {
  VS1: "text-vs1",
  VS2: "text-vs2",
};

export default function LineSelector({
  lines,
  mesStates,
  onSelectLine,
}: LineSelectorProps) {
  const stateMap = new Map(mesStates.map((s) => [s.lineId, s]));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {lines.map((line) => {
        const state = stateMap.get(line.id);
        const isActive = state?.schedule !== null;
        return (
          <button
            key={line.id}
            onClick={() => onSelectLine(line.id)}
            className="bg-surface border border-border rounded-lg p-4 text-left hover:border-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className={`text-[10px] uppercase tracking-widest font-semibold ${VS_COLORS[line.valueStream] ?? "text-slate-400"}`}>
                  {line.valueStream}
                </p>
                <p className="text-white font-semibold text-base">{line.name}</p>
              </div>
              {isActive && (
                <span className="text-[9px] bg-vs1/20 text-vs1 border border-vs1/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                  Live
                </span>
              )}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-2xl font-semibold ${getOutputColor(line.output, line.target)}`}>
                  {line.output}
                </p>
                <p className="text-slate-500 text-xs">/ {line.target}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">{line.headcount} HC</p>
                <p className="text-slate-500 text-xs">{line.fpy.toFixed(1)}% FPY</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
