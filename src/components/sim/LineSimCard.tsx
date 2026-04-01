"use client";

import { useRef, useState } from "react";
import type { LineState, LineSchedule } from "@/lib/types/mes";

interface LineSimCardProps {
  label: string;      // e.g. "VS1 Line 1"
  lineId: string;     // e.g. "vs1-l1"
  state: LineState | null;
  onScheduleLoaded: (lineId: string, schedule: LineSchedule) => void;
}

export default function LineSimCard({ label, lineId, state, onScheduleLoaded }: LineSimCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf")) {
      setParseError("Must be a PDF file");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const { parseRunSheet } = await import("@/lib/pdfParser");
      const schedule = await parseRunSheet(file, lineId);
      if (schedule.items.length === 0) {
        setParseError("No orders found in PDF");
        return;
      }
      onScheduleLoaded(lineId, schedule);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const pct = state?.schedule
    ? Math.round((state.totalOutput / state.schedule.totalTarget) * 100)
    : 0;

  const hasSchedule = !!state?.schedule;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="text-xs tracking-widest uppercase text-slate-400 font-semibold">{label}</div>

      {!hasSchedule ? (
        /* Drop zone */
        <div
          className={[
            "border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 py-6 cursor-pointer transition-colors",
            isDragOver
              ? "border-accent bg-accent/5 text-accent"
              : "border-border text-slate-600 hover:border-slate-500 hover:text-slate-400",
          ].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <span className="text-2xl">📄</span>
          <span className="text-xs">{parsing ? "Parsing…" : "Drop PDF or click"}</span>
          {parseError && <span className="text-xs text-red-400">{parseError}</span>}
        </div>
      ) : (
        /* Live state */
        <div className="flex flex-col gap-2">
          {/* Progress bar */}
          <div className="w-full h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: pct >= 100 ? "var(--color-status-green)" : "var(--color-accent)",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{state!.totalOutput} produced</span>
            <span>{state!.schedule!.totalTarget} target</span>
          </div>

          {/* Current order */}
          {state!.currentOrder ? (
            <div className="bg-background rounded p-2.5 text-xs">
              <div className="text-slate-500 mb-0.5">Current order</div>
              <div className="text-slate-200 font-mono font-semibold">{state!.currentOrder}</div>
              <div className="text-slate-400">
                {state!.remainingOnOrder} remaining&nbsp;·&nbsp;
                {state!.remainingOnRunSheet} on sheet
              </div>
            </div>
          ) : (
            <div className="text-xs text-status-green">All orders complete</div>
          )}

          {/* Order list */}
          <div className="max-h-32 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 uppercase tracking-widest">
                  <th className="text-left py-0.5">Model</th>
                  <th className="text-right py-0.5">Qty</th>
                  <th className="text-right py-0.5">Done</th>
                </tr>
              </thead>
              <tbody>
                {state!.schedule!.items.map((item) => (
                  <tr
                    key={item.model}
                    className={item.completed >= item.qty ? "text-slate-600 line-through" : "text-slate-300"}
                  >
                    <td className="font-mono py-0.5">{item.model}</td>
                    <td className="text-right py-0.5">{item.qty}</td>
                    <td className="text-right py-0.5">{item.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-slate-600 hover:text-slate-400 text-left transition-colors bg-transparent border-none p-0 cursor-pointer"
          >
            ↺ Replace PDF
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
