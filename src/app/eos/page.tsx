"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ShiftMetrics } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { EOSFormData, EOSLineDescriptor, EOSLineEntry, EOSValueStream } from "@/lib/eosTypes";
import { calculateHPU, downloadAllReports } from "@/lib/eosReports";
import EOSLineCard from "@/components/eos/EOSLineCard";
import EOSMetaForm from "@/components/eos/EOSMetaForm";
import EOSEmailPreview from "@/components/eos/EOSEmailPreview";

// ── Config ────────────────────────────────────────────────────────────────────

const VALUE_STREAMS: EOSValueStream[] = [
  { id: "vs1", name: "HFC (Hard Folding Covers)", lines: ["Line 1", "Line 2", "Line 3", "Line 4"] },
  { id: "vs2", name: "HRC (Hard Rolling Cover)",  lines: ["Line 1", "Line 2"] },
];

const ALL_LINES: EOSLineDescriptor[] = VALUE_STREAMS.flatMap((vs) =>
  vs.lines.map((line) => ({
    vsId: vs.id,
    vsName: vs.name,
    line,
    lineKey: `${vs.id}:${line}`,
  })),
);

const EMPTY_LINE: EOSLineEntry = {
  output: "",
  hpu: "0",
  hoursWorked: "10",
  headcount: "",
  orderAtPackout: "",
  remainingOnOrder: "",
  remainingOnRunSheet: "",
  changeovers: "",
};

function emptyFormData(): EOSFormData {
  const lines: Record<string, EOSLineEntry> = {};
  ALL_LINES.forEach(({ lineKey }) => { lines[lineKey] = { ...EMPTY_LINE }; });
  return {
    supervisor: "",
    date: new Date().toISOString().split("T")[0],
    shift: "Day",
    notes: "",
    lines,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EOSPage() {
  const [formData, setFormData]       = useState<EOSFormData>(emptyFormData());
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [activeStream, setActiveStream] = useState("vs1");
  const [activeView, setActiveView]     = useState<"entry" | "email">("entry");
  const [mesRefreshing, setMesRefreshing] = useState(false);

  async function refreshFromMes(shift: string) {
    setMesRefreshing(true);
    try {
      const [metrics, mesStates] = await Promise.all([
        fetch(`/api/metrics?shift=${shift.toLowerCase()}`).then((r) => r.json() as Promise<ShiftMetrics>),
        fetch("/api/mes/state").then((r) => r.json() as Promise<LineState[]>).catch(() => [] as LineState[]),
      ]);

      setFormData((prev) => {
        const updatedLines = { ...prev.lines };

        metrics.lines.forEach((line) => {
          const lineKey = line.id.replace("-l", ":Line ");
          if (!(lineKey in updatedLines)) return;
          const merged = {
            ...updatedLines[lineKey],
            output:    String(line.output),
            headcount: String(line.headcount),
          };
          merged.hpu = calculateHPU(merged.output, merged.headcount, merged.hoursWorked);
          updatedLines[lineKey] = merged;
        });

        mesStates.forEach((state) => {
          if (!state.schedule) return;
          const lineKey = state.lineId.replace("-l", ":Line ");
          if (!(lineKey in updatedLines)) return;
          updatedLines[lineKey] = {
            ...updatedLines[lineKey],
            orderAtPackout:      state.currentOrder ?? "",
            remainingOnOrder:    String(state.remainingOnOrder),
            remainingOnRunSheet: String(state.remainingOnRunSheet),
            changeovers:         String(state.completedOrders),
          };
        });

        return { ...prev, lines: updatedLines };
      });
    } catch {
      // silently ignore
    } finally {
      setMesRefreshing(false);
    }
  }

  // Pre-populate on mount and shift change
  useEffect(() => {
    refreshFromMes(formData.shift);
  }, [formData.shift]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleMeta = (key: keyof Omit<EOSFormData, "lines">, value: string) =>
    setFormData((p) => ({ ...p, [key]: value }));

  const handleLine = (lineKey: string, field: keyof EOSLineEntry, value: string) =>
    setFormData((p) => {
      const updated = { ...p.lines[lineKey], [field]: value };
      if (field === "output" || field === "headcount" || field === "hoursWorked") {
        updated.hpu = calculateHPU(updated.output, updated.headcount, updated.hoursWorked);
      }
      return { ...p, lines: { ...p.lines, [lineKey]: updated } };
    });

  const handleHideLine = (vsId: string, line: string) =>
    setHiddenLines((prev) => new Set([...prev, `${vsId}:${line}`]));

  const handleShowLine = (vsId: string, line: string) =>
    setHiddenLines((prev) => {
      const next = new Set(prev);
      next.delete(`${vsId}:${line}`);
      return next;
    });

  const handleReset = () => {
    if (window.confirm("Reset all fields?")) {
      setFormData(emptyFormData());
      setHiddenLines(new Set());
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const currentStream = VALUE_STREAMS.find((vs) => vs.id === activeStream)!;
  const activeLines   = ALL_LINES.filter(
    ({ vsId, line }) => vsId === activeStream && !hiddenLines.has(`${vsId}:${line}`),
  );
  const visibleLines = currentStream.lines.filter((l) => !hiddenLines.has(`${currentStream.id}:${l}`));
  const hiddenVsLines = currentStream.lines.filter((l) =>  hiddenLines.has(`${currentStream.id}:${l}`));

  const filledLines = activeLines.filter(({ lineKey }) => formData.lines[lineKey].output).length;
  const progress    = activeLines.length > 0 ? Math.round((filledLines / activeLines.length) * 100) : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-slate-200">

      {/* Header */}
      <header className="bg-surface border-b border-border px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-accent text-black font-black text-xs px-2.5 py-1 rounded tracking-widest">
            BAK
          </span>
          <span className="text-slate-500 text-sm">|</span>
          <span className="text-slate-400 text-sm tracking-widest uppercase">End of Shift System</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-surface border border-border px-3 py-1 rounded-full">
            <span>{filledLines}/{activeLines.length} lines entered</span>
            <div className="w-24 h-2 bg-background rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? "var(--color-status-green)" : "var(--color-accent)",
                }}
              />
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 tracking-widest uppercase transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* Value stream tabs */}
      <div className="bg-surface border-b border-border px-8 flex">
        {VALUE_STREAMS.map((vs) => (
          <button
            key={vs.id}
            onClick={() => { setActiveStream(vs.id); setActiveView("entry"); }}
            className={[
              "px-5 py-3.5 text-xs tracking-widest uppercase border-b-2 transition-all bg-transparent border-x-0 border-t-0 cursor-pointer",
              activeStream === vs.id
                ? "text-accent border-accent"
                : "text-slate-600 border-transparent hover:text-slate-400",
            ].join(" ")}
          >
            {vs.id === "vs1" ? "HFC" : "HRC"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-8 py-8 max-w-5xl mx-auto">

        {activeView === "entry" && (
          <>
            <EOSMetaForm data={formData} onChangeMeta={handleMeta} />

            <div className="text-xs text-slate-500 tracking-widest uppercase font-semibold mb-5">
              Production Data — {currentStream.name}
            </div>

            <div className="mb-10">
              {visibleLines.map((line) => (
                <EOSLineCard
                  key={`${currentStream.id}:${line}`}
                  lineKey={`${currentStream.id}:${line}`}
                  vsId={currentStream.id}
                  line={line}
                  vsName={currentStream.name}
                  data={formData.lines[`${currentStream.id}:${line}`]}
                  onChange={handleLine}
                  onHide={handleHideLine}
                />
              ))}

              {hiddenVsLines.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 py-3 bg-surface border border-dashed border-border rounded-lg">
                  <span className="text-xs text-slate-600 tracking-widest uppercase self-center mr-1">
                    Hidden:
                  </span>
                  {hiddenVsLines.map((line) => (
                    <button
                      key={line}
                      onClick={() => handleShowLine(currentStream.id, line)}
                      title={`Restore ${line}`}
                      className="border border-border rounded text-slate-500 text-xs px-2.5 py-0.5 bg-transparent cursor-pointer hover:border-slate-500 transition-colors"
                    >
                      + {line}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-surface border border-border rounded-lg p-6 mb-6">
              <label className="block text-xs text-slate-400 mb-2 tracking-widest uppercase font-medium">
                Notes / Issues
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleMeta("notes", e.target.value)}
                rows={3}
                placeholder="Any issues, callouts, or notes for incoming shift..."
                className="w-full bg-background border border-border rounded px-3.5 py-2.5 text-slate-200 text-sm outline-none font-mono resize-y focus:border-accent"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => downloadAllReports(formData, activeLines)}
                className="flex-1 min-w-48 bg-accent text-black border-none px-7 py-3.5 rounded cursor-pointer font-bold text-xs tracking-widest uppercase"
              >
                ↓ Download All 4 Reports
              </button>
              <button
                onClick={() => setActiveView("email")}
                className="flex-1 min-w-48 bg-transparent text-accent border border-accent px-7 py-3.5 rounded cursor-pointer font-bold text-xs tracking-widest uppercase hover:bg-accent hover:text-black transition-colors"
              >
                ✉ Preview Email
              </button>
              <button
                onClick={() => refreshFromMes(formData.shift)}
                disabled={mesRefreshing}
                className="bg-transparent text-slate-400 border border-border px-5 py-3.5 rounded cursor-pointer text-xs tracking-widest uppercase hover:border-slate-500 transition-colors disabled:opacity-50"
              >
                {mesRefreshing ? "Refreshing…" : "↺ Refresh from MES"}
              </button>
              <button
                onClick={handleReset}
                className="bg-transparent text-slate-500 border border-border px-5 py-3.5 rounded cursor-pointer text-sm hover:border-slate-500 transition-colors"
              >
                Reset
              </button>
            </div>
          </>
        )}

        {activeView === "email" && (
          <EOSEmailPreview
            data={formData}
            activeLines={activeLines}
            streamName={currentStream.name}
            onBack={() => setActiveView("entry")}
          />
        )}
      </div>
    </div>
  );
}
