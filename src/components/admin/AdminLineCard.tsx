"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { LineSchedule, RunSheetItem } from "@/lib/types/mes";

interface AdminLineCardProps {
  lineId: string;
  label: string;
  schedule: LineSchedule | null;
  queuedSchedules: LineSchedule[];
  savedTarget: number | undefined;
  savedHeadcount: number | undefined;
  savedIsRunning: boolean | undefined;
  savedSupervisorName: string | undefined;
  skippedItems: RunSheetItem[];
  onScheduleLoaded: (lineId: string, schedule: LineSchedule) => Promise<void>;
  onConfigSaved: (
    lineId: string,
    target: number | undefined,
    headcount: number | undefined,
    isRunning: boolean,
    supervisorName: string,
  ) => void;
  onRemoveQueued: (lineId: string, index: number) => void;
  onClearSchedule: (lineId: string) => void;
  onSkipOrder: (lineId: string, model: string) => void;
  onUnskipOrder: (lineId: string, model: string) => void;
}

const AdminLineCardInner = forwardRef(function AdminLineCardInner(
  {
    lineId,
    label,
    schedule,
    queuedSchedules,
    savedTarget,
    savedHeadcount,
    savedIsRunning,
    savedSupervisorName,
    skippedItems,
    onScheduleLoaded,
    onConfigSaved,
    onRemoveQueued,
    onClearSchedule,
    onSkipOrder,
    onUnskipOrder,
  }: AdminLineCardProps,
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedFlash, setLoadedFlash] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);
  /** Schedule parsed from the latest PDF drop, shown immediately while the API round-trips */
  const [pendingSchedule, setPendingSchedule] = useState<LineSchedule | null>(
    null,
  );

  const [target, setTarget] = useState(
    savedTarget !== undefined ? String(savedTarget) : "",
  );
  const [headcount, setHeadcount] = useState(
    savedHeadcount !== undefined ? String(savedHeadcount) : "",
  );
  const [isRunning, setIsRunning] = useState(
    savedIsRunning !== undefined ? savedIsRunning : true,
  );
  const [supervisorName, setSupervisorName] = useState(
    savedSupervisorName ?? "",
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTarget(savedTarget !== undefined ? String(savedTarget) : "");
  }, [savedTarget]);

  useEffect(() => {
    setHeadcount(savedHeadcount !== undefined ? String(savedHeadcount) : "");
  }, [savedHeadcount]);

  useEffect(() => {
    setIsRunning(savedIsRunning !== undefined ? savedIsRunning : true);
  }, [savedIsRunning]);

  useEffect(() => {
    setSupervisorName(savedSupervisorName ?? "");
  }, [savedSupervisorName]);

  // Expose a save() method so the parent can trigger save-all
  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const t = target !== "" ? Number(target) : undefined;
        const hc = headcount !== "" ? Number(headcount) : undefined;
        await onConfigSaved(lineId, t, hc, isRunning, supervisorName);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      },
    }),
    [target, headcount, isRunning, supervisorName, lineId, onConfigSaved],
  );

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf")) {
      setParseError("Must be a PDF");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const { parseRunSheet } = await import("@/lib/pdfParser");
      const s = await parseRunSheet(file, lineId);
      if (s.items.length === 0) {
        setParseError("No orders found");
        return;
      }
      // Show preview immediately — the API call is just persistence
      setPendingSchedule(s);
      setLoadedFlash(true);
      setTimeout(() => setLoadedFlash(false), 1500);
      // POST to API in the background; refresh() will pick up the canonical state
      try {
        await onScheduleLoaded(lineId, s);
      } catch {
        setParseError("Failed to save schedule — please retry");
        setPendingSchedule(null);
      }
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
    const t = target !== "" ? Number(target) : undefined;
    const hc = headcount !== "" ? Number(headcount) : undefined;
    await onConfigSaved(lineId, t, hc, isRunning, supervisorName);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Prefer pending (just-parsed) over persisted schedule; clear pending once server confirms
  const activeSchedule = pendingSchedule !== null ? pendingSchedule : schedule;

  // Clear pending once the server-confirmed schedule catches up to what we're showing
  const serverConfirmed =
    schedule !== null &&
    pendingSchedule !== null &&
    schedule.lineId === pendingSchedule.lineId &&
    schedule.date === pendingSchedule.date;

  useEffect(() => {
    if (serverConfirmed) setPendingSchedule(null);
  }, [serverConfirmed]);

  const pct = activeSchedule
    ? Math.round(
        (activeSchedule.items.reduce((s, i) => s + i.completed, 0) /
          activeSchedule.totalTarget) *
          100,
      )
    : 0;

  const queuedCount = queuedSchedules.length;
  const hasSchedule = activeSchedule !== null;
  const statusLabel = hasSchedule
    ? queuedCount > 0
      ? `QUEUED (${queuedCount})`
      : "ACTIVE"
    : "IDLE";

  return (
    <section
      className={`bg-surface-low rounded-sm border-t-2 overflow-hidden ${hasSchedule ? "border-vs2" : "border-accent/40"}`}
    >
      {/* Header bar */}
      <div className="p-5 flex justify-between items-center bg-surface">
        <div className="flex items-center gap-3">
          <span
            className={`font-['Space_Grotesk',sans-serif] font-bold text-lg ${hasSchedule ? "text-vs2" : ""}`}
          >
            {label}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              hasSchedule
                ? "bg-vs2/15 text-vs2 border-vs2/25"
                : "bg-surface-highest text-[#e1e2ec]/40 border-border"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer group">
          <span className="text-[10px] font-bold tracking-widest text-[#e1e2ec]/40 group-hover:text-[#e1e2ec] transition-colors uppercase">
            Running
          </span>
          <div className="relative inline-flex items-center h-5 w-9">
            <input
              type="checkbox"
              checked={isRunning}
              onChange={async () => {
                const next = !isRunning;
                setIsRunning(next);
                await fetch("/api/admin/config", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lineId, isRunning: next }),
                });
                onConfigSaved(
                  lineId,
                  undefined,
                  undefined,
                  next,
                  supervisorName,
                );
              }}
              className="sr-only peer"
            />
            <div className="w-full h-full bg-surface-highest border border-border rounded-full peer peer-checked:bg-status-green/20" />
            <div className="absolute left-1 top-1 w-3 h-3 bg-[#e1e2ec]/30 rounded-full transition-all peer-checked:translate-x-4 peer-checked:bg-status-green" />
          </div>
        </label>
      </div>

      {/* Content Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Upload & Config */}
        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            className={`group relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-sm transition-all ${
              isDragOver
                ? "border-accent/50 bg-accent/5"
                : loadedFlash
                  ? "border-status-green bg-status-green/5"
                  : "border-border bg-background/50 hover:border-accent/40"
            } ${!isRunning ? "pointer-events-none" : "cursor-pointer"}`}
            onDragOver={(e) => {
              if (isRunning) {
                e.preventDefault();
                setIsDragOver(true);
              }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            onClick={() => {
              if (isRunning) inputRef.current?.click();
            }}
          >
            <span
              className={`material-symbols-outlined text-4xl mb-2 transition-transform group-hover:scale-110 ${
                loadedFlash
                  ? "text-status-green"
                  : isDragOver
                    ? "text-accent"
                    : "text-accent/40"
              }`}
            >
              {loadedFlash ? "check_circle" : "upload_file"}
            </span>
            <p className="text-xs font-bold text-[#e1e2ec]/70 uppercase tracking-widest">
              {parsing
                ? "Parsing..."
                : loadedFlash
                  ? "Loaded!"
                  : "Drop Schedule PDF"}
            </p>
            <p className="text-[10px] text-[#e1e2ec]/30 mt-1">
              MAX 5MB &bull; .PDF ONLY
            </p>
            {parseError && (
              <p className="text-[10px] text-status-red mt-1">{parseError}</p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              disabled={!isRunning}
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Target & Headcount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-[#e1e2ec]/40 tracking-widest">
                Daily Target
              </label>
              <input
                type="number"
                min={0}
                disabled={!isRunning}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. 215"
                className="w-full bg-surface-highest border-0 border-l-2 border-accent rounded-sm px-3 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[#e1e2ec]/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-[#e1e2ec]/40 tracking-widest">
                Headcount
              </label>
              <input
                type="number"
                min={0}
                disabled={!isRunning}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
                placeholder="e.g. 8"
                className="w-full bg-surface-highest border-0 border-l-2 border-accent rounded-sm px-3 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[#e1e2ec]/20"
              />
            </div>
          </div>

          {/* Supervisor */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-[#e1e2ec]/40 tracking-widest">
              Supervisor
            </label>
            <input
              type="text"
              disabled={!isRunning}
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              placeholder="Name"
              className="w-full bg-surface-highest border-0 border-l-2 border-vs2/50 rounded-sm px-3 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold outline-none focus:ring-1 focus:ring-vs2/30 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[#e1e2ec]/20"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isRunning}
            className={`w-full font-black py-3 rounded-sm text-xs uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              saved
                ? "bg-status-green text-black"
                : "bg-accent text-black hover:opacity-90"
            }`}
          >
            {saved ? "Saved" : "Save Config"}
          </button>
        </div>

        {/* Right: RunSheet Preview */}
        {hasSchedule ? (
          <div
            className={`bg-background p-4 border border-border/40 rounded-sm flex flex-col ${!isRunning ? "opacity-40 grayscale" : ""}`}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/40">
              <span className="text-[10px] uppercase font-black tracking-widest">
                RunSheet Preview
              </span>
              <span className="text-[10px] text-[#e1e2ec]/40">
                {activeSchedule.items.filter((i) => !i.skipped).length} BATCHES
                PENDING
              </span>
            </div>

            {/* Progress */}
            <div className="mb-4">
              <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct >= 100 ? "#22c55e" : "#f97316",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#e1e2ec]/40">
                <span>{activeSchedule.totalTarget} units</span>
                <span className="font-bold">{pct}%</span>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1 flex-1">
              {activeSchedule.items
                .filter((item) => !item.skipped)
                .map((item) => {
                  const done = item.completed >= item.qty;
                  return (
                    <div
                      key={item.model}
                      className={`flex justify-between items-center p-2 rounded-sm transition-colors ${
                        done
                          ? "bg-surface/30 opacity-50"
                          : "bg-surface/50 hover:bg-surface-high"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-accent truncate">
                            {item.model}
                          </span>
                          {!done && (
                            <button
                              title="Skip this order"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSkipOrder(lineId, item.model);
                              }}
                              className="text-[#e1e2ec]/30 hover:text-status-amber bg-transparent border-none cursor-pointer text-[10px] transition-colors shrink-0"
                            >
                              skip
                            </button>
                          )}
                        </div>
                        <span className="text-[8px] text-[#e1e2ec]/40">
                          {item.qty} units
                        </span>
                      </div>
                      <span className="font-['Space_Grotesk',sans-serif] text-lg font-bold tabular-nums">
                        {item.completed}/{item.qty}
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Skipped orders */}
            {skippedItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <button
                  onClick={() => setSkippedOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-[10px] text-status-amber/70 hover:text-status-amber bg-transparent border-none cursor-pointer transition-colors mb-1 uppercase tracking-widest font-bold"
                >
                  {skippedItems.length} skipped{" "}
                  {skippedOpen ? "\u25B2" : "\u25BC"}
                </button>
                {skippedOpen && (
                  <div className="flex flex-col gap-1">
                    {skippedItems.map((item) => (
                      <div
                        key={item.model}
                        className="flex items-center justify-between text-[10px] text-[#e1e2ec]/40 italic"
                      >
                        <span className="font-mono">
                          {item.model} &middot; {item.qty} units
                        </span>
                        <button
                          title="Unskip"
                          onClick={() => onUnskipOrder(lineId, item.model)}
                          className="text-[#e1e2ec]/30 hover:text-status-green bg-transparent border-none cursor-pointer text-[10px] transition-colors"
                        >
                          restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Queued schedules */}
            {queuedCount > 0 && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <button
                  onClick={() => setQueueOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-[10px] text-accent/70 hover:text-accent bg-transparent border-none cursor-pointer transition-colors mb-1 uppercase tracking-widest font-bold"
                >
                  +{queuedCount} queued {queueOpen ? "\u25B2" : "\u25BC"}
                </button>
                {queueOpen && (
                  <div className="flex flex-col gap-1">
                    {queuedSchedules.map((sched, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-[10px]"
                      >
                        <span className="text-[#e1e2ec]/60 font-mono">
                          {sched.date} &middot; {sched.items.length} orders
                          &middot; {sched.totalTarget} units
                        </span>
                        <button
                          onClick={() => onRemoveQueued(lineId, i + 1)}
                          title="Remove from queue"
                          className="text-[#e1e2ec]/30 hover:text-status-red bg-transparent border-none cursor-pointer transition-colors"
                        >
                          remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-border/30">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex-1 text-[10px] text-[#e1e2ec]/60 hover:text-[#e1e2ec] bg-surface/30 hover:bg-surface-high transition-colors py-2 rounded-sm font-bold uppercase tracking-widest"
              >
                Load PDF
              </button>
              <button
                onClick={() => {
                  setPendingSchedule(null);
                  onClearSchedule(lineId);
                }}
                className="flex-1 text-[10px] text-status-red/60 hover:text-status-red bg-surface/30 hover:bg-status-red/10 transition-colors py-2 rounded-sm font-bold uppercase tracking-widest"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`bg-background p-4 border border-border/40 rounded-sm flex flex-col items-center justify-center min-h-[200px] ${!isRunning ? "opacity-40 grayscale" : ""}`}
          >
            <span className="material-symbols-outlined text-[#e1e2ec]/10 text-5xl">
              inventory
            </span>
            <p className="text-[10px] uppercase font-black tracking-widest text-[#e1e2ec]/20 mt-2">
              No Active RunSheet
            </p>
          </div>
        )}
      </div>
    </section>
  );
});

export default AdminLineCardInner;
