"use client";

import { useRef, useState } from "react";
import type { LineSchedule } from "@/lib/mesTypes";

interface AdminLineCardProps {
  lineId: string;
  label: string;
  schedule: LineSchedule | null;
  queuedSchedules: LineSchedule[];
  savedTarget: number | undefined;
  savedHeadcount: number | undefined;
  onScheduleLoaded: (lineId: string, schedule: LineSchedule) => void;
  onConfigSaved: (lineId: string, target: number | undefined, headcount: number | undefined) => void;
  onRemoveQueued: (lineId: string, index: number) => void;
  onClearSchedule: (lineId: string) => void;
}

export default function AdminLineCard({
  lineId, label, schedule, queuedSchedules,
  savedTarget, savedHeadcount,
  onScheduleLoaded, onConfigSaved, onRemoveQueued, onClearSchedule,
}: AdminLineCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing]       = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedFlash, setLoadedFlash] = useState(false);
  const [queueOpen, setQueueOpen]   = useState(false);

  const [target, setTarget]       = useState(savedTarget    !== undefined ? String(savedTarget)    : "");
  const [headcount, setHeadcount] = useState(savedHeadcount !== undefined ? String(savedHeadcount) : "");
  const [saved, setSaved]         = useState(false);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf")) { setParseError("Must be a PDF"); return; }
    setParsing(true);
    setParseError(null);
    try {
      const { parseRunSheet } = await import("@/lib/pdfParser");
      const s = await parseRunSheet(file, lineId);
      if (s.items.length === 0) { setParseError("No orders found"); return; }
      // Auto-commit: caller decides replace vs queue based on current state
      onScheduleLoaded(lineId, s);
      setLoadedFlash(true);
      setTimeout(() => setLoadedFlash(false), 1500);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parse failed");
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

  async function handleSave() {
    const t  = target    !== "" ? Number(target)    : undefined;
    const hc = headcount !== "" ? Number(headcount) : undefined;
    onConfigSaved(lineId, t, hc);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const pct = schedule
    ? Math.round(
        (schedule.items.reduce((s, i) => s + i.completed, 0) / schedule.totalTarget) * 100
      )
    : 0;

  const queuedCount = queuedSchedules.length;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">

      {/* Label + queue badge */}
      <div className="flex items-center justify-between">
        <div className="text-xs tracking-widest uppercase text-slate-400 font-semibold">{label}</div>
        {queuedCount > 0 && (
          <button
            onClick={() => setQueueOpen((o) => !o)}
            className="text-xs bg-accent/15 text-accent border border-accent/30 rounded-full px-2 py-0.5 cursor-pointer hover:bg-accent/25 transition-colors"
          >
            +{queuedCount} queued {queueOpen ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Expandable queue list */}
      {queueOpen && queuedCount > 0 && (
        <div className="bg-background border border-border rounded p-2.5 flex flex-col gap-1.5">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Up next</div>
          {queuedSchedules.map((sched, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300 min-w-0">
                <span className="font-mono">{sched.date}</span>
                <span className="text-slate-500 ml-1.5">
                  {sched.items.length} orders · {sched.totalTarget} units
                </span>
              </div>
              <button
                onClick={() => onRemoveQueued(lineId, i + 1)}
                title="Remove from queue"
                className="text-xs text-slate-600 hover:text-status-red bg-transparent border-none cursor-pointer transition-colors shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Run sheet section */}
      <div>
        <div className="text-xs text-slate-500 tracking-widest uppercase mb-1.5">Run Sheet</div>

        {/* Active schedule */}
        {schedule ? (
          <div className="bg-background rounded p-3 flex flex-col gap-2">
            <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct >= 100 ? "var(--color-status-green)" : "var(--color-accent)",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{schedule.items.length} orders · {schedule.totalTarget} units</span>
              <span>{pct}%</span>
            </div>
            <div className="max-h-28 overflow-y-auto mt-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-600 uppercase tracking-widest">
                    <th className="text-left pb-0.5">Model</th>
                    <th className="text-right pb-0.5">Qty</th>
                    <th className="text-right pb-0.5">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.items.map((item) => (
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
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => inputRef.current?.click()}
                className="text-xs text-slate-600 hover:text-slate-400 bg-transparent border-none p-0 cursor-pointer transition-colors"
              >
                {loadedFlash ? "✓ Queued!" : "↑ Load another PDF"}
              </button>
              <button
                onClick={() => onClearSchedule(lineId)}
                className="text-xs text-slate-600 hover:text-status-red bg-transparent border-none p-0 cursor-pointer transition-colors"
              >
                ✕ Clear
              </button>
            </div>
          </div>
        ) : (
          /* Drop zone */
          <div
            className={[
              "border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 py-5 cursor-pointer transition-colors",
              isDragOver
                ? "border-accent bg-accent/5 text-accent"
                : loadedFlash
                ? "border-status-green bg-status-green/5 text-status-green"
                : "border-border text-slate-600 hover:border-slate-500 hover:text-slate-400",
            ].join(" ")}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <span className="text-xl">{loadedFlash ? "✓" : "📄"}</span>
            <span className="text-xs">
              {parsing ? "Parsing…" : loadedFlash ? "Loaded!" : "Drop PDF or click to load"}
            </span>
            {parseError && <span className="text-xs text-red-400">{parseError}</span>}
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

      {/* Target + Headcount */}
      <div className="flex flex-col gap-2.5">
        <div>
          <label className="block text-xs text-slate-500 tracking-widest uppercase mb-1">
            Daily Target
          </label>
          <input
            type="number"
            min={0}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. 215"
            className="w-full bg-background border border-border rounded px-3 py-2 text-slate-200 text-sm outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 tracking-widest uppercase mb-1">
            Headcount
          </label>
          <input
            type="number"
            min={0}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder="e.g. 8"
            className="w-full bg-background border border-border rounded px-3 py-2 text-slate-200 text-sm outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={handleSave}
          className={[
            "w-full border-none rounded py-2 text-xs tracking-widest uppercase font-bold cursor-pointer transition-colors",
            saved
              ? "bg-status-green text-black"
              : "bg-accent text-black hover:opacity-90",
          ].join(" ")}
        >
          {saved ? "✓ Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
