"use client";

import { Line, ShiftName } from "@/lib/types";

interface ExportButtonProps {
  lines: Line[];
  shift: ShiftName;
}

export default function ExportButton({ lines, shift }: ExportButtonProps) {
  function handleExport() {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `ops-report_${shift}_${date}.csv`;

    const header = "Value Stream,Line,Output,Target,FPY (%),HPU (hrs),Headcount,Changeovers,OEE (%),Availability (%),Performance (%)";
    const rows = lines.map((l) =>
      [
        l.valueStream,
        l.name,
        l.output,
        l.target,
        l.fpy.toFixed(1),
        l.hpu.toFixed(2),
        l.headcount,
        l.changeovers,
        l.oee.toFixed(1),
        l.availability.toFixed(1),
        l.performance.toFixed(1),
      ].join(",")
    );
    const csv = [header, ...rows].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="px-3 py-1.5 rounded text-sm border border-border
                 text-slate-400 hover:text-white hover:border-accent transition-colors"
    >
      Export CSV
    </button>
  );
}
