"use client";

import { Line } from "@/lib/types";

interface LineTableProps {
    lines: Line[];
    onSelectLine: (lineId: string) => void;
    selectedLineId: string | null;
}


function isAtRisk(line: Line): boolean {
  return line.fpy < 90 && line.output < line.target;
}

function getFpyColor(fpy: number): string {
  if (fpy >= 95) return "text-status-green";
  if (fpy >= 90) return "text-status-amber";
  return "text-status-red";
}

// Two grouped sections. Each group has a header row (VS1 / VS2) and its lines
// beneath it. Clicking a row calls onSelectLine with that line's id.
export default function LineTable({
    lines,
    onSelectLine,
    selectedLineId
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

        return (
            <div className="bg-surface border border-border rounded-lg p-5">
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                    VS1
                </div>
                <table className="w-full text-sm">
                    <thead>
                        {tableHead}
                    </thead>
                    <tbody>
                        {lines.filter(line => line.valueStream === "VS1").map(line => (
                            <tr
                                key={line.id}
                                className={`cursor-pointer ${
                                    line.id === selectedLineId 
                                    ? "bg-accent/20 border-l-2 border-accent" 
                                    : isAtRisk(line) 
                                    ? "border-l-2 border-status-red" 
                                    : "border-l-2 border-transparent hover:bg-white/5"
                                }`}
                                onClick={() => onSelectLine(line.id)}
                            >
                                <td className="py-2">{line.name}</td>
                                <td className="text-right py-2">{line.output}</td>
                                <td className="text-right py-2 text-slate-500">{line.target}</td>
                                <td className={`text-right py-2 ${getFpyColor(line.fpy)}`}>{line.fpy.toFixed(1)}%</td>
                                <td className="text-right py-2">{line.hpu.toFixed(2)} hrs</td>
                                <td className="text-right py-2">{line.headcount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-4 mb-2">
                    VS2
                </div>
                <table className="w-full text-sm">
                    <thead>
                        {tableHead}
                    </thead>
                    <tbody>
                        {lines.filter(line => line.valueStream === "VS2").map(line => (
                            <tr
                                key={line.id}
                                className={`cursor-pointer ${
                                    line.id === selectedLineId 
                                    ? "bg-accent/20 border-l-2 border-accent" 
                                    : isAtRisk(line) 
                                    ? "border-l-2 border-status-red" 
                                    : "border-l-2 border-transparent hover:bg-white/5"
                                }`}
                                onClick={() => onSelectLine(line.id)}
                            >
                                <td className="py-2">{line.name}</td>
                                <td className="text-right py-2">{line.output}</td>
                                <td className="text-right py-2 text-slate-500">{line.target}</td>
                                <td className={`text-right py-2 ${getFpyColor(line.fpy)}`}>
                                    {line.fpy.toFixed(1)}%
                                </td>
                                <td className="text-right py-2">{line.hpu.toFixed(2)} hrs</td>
                                <td className="text-right py-2">{line.headcount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }