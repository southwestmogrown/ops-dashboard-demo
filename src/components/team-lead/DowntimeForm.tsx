"use client";

import { useState } from "react";
import type { DowntimeReason } from "@/lib/types/downtime";
import { useAuth } from "@/hooks/useAuth";
import { DOWNTIME_REASON_LABELS } from "@/lib/types/downtime";
import type { ShiftName } from "@/lib/types/core";

interface DowntimeFormProps {
  lineId: string;
  shift: ShiftName;
  // If provided, the entry already exists and is ongoing — allow resolving it
  existingEntryId?: string;
  existingStartTime?: string;
  onClose: () => void;
  onRefresh: () => void;
}

const REASONS: DowntimeReason[] = [
  "machine-failure",
  "material-shortage",
  "planned-maintenance",
  "safety-stop",
  "other",
];

function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal(): string {
  return toDateTimeLocal(new Date().toISOString());
}

export default function DowntimeForm({
  lineId,
  shift,
  existingEntryId,
  existingStartTime,
  onClose,
  onRefresh,
}: DowntimeFormProps) {
  const isResolve = !!existingEntryId;
  const { role } = useAuth();
  const [reason, setReason] = useState<DowntimeReason>(
    isResolve ? "other" : "machine-failure",
  );
  const [startTime, setStartTime] = useState(
    isResolve && existingStartTime
      ? toDateTimeLocal(existingStartTime)
      : nowLocal(),
  );
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogStop(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/downtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId,
          shift,
          reason,
          startTime: new Date(startTime).toISOString(),
          notes,
          createdBy: role ?? "unknown",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to log downtime");
      }
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/downtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existingEntryId,
          endTime: new Date().toISOString(),
          ...(endTime && { actualEndTime: new Date(endTime).toISOString() }),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to resolve downtime");
      }
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "kc-input-field";
  const labelClass = "block kc-micro-label mb-1";
  const selectClass =
    "w-full bg-surface-highest border-0 border-l-2 border-accent rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none focus:ring-1 focus:ring-accent/40 appearance-none cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-sm w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-status-red text-xl">
              flag
            </span>
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-lg">
              {isResolve ? "Resolve Downtime" : "Log Line Stop"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] bg-transparent border-none cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Line + shift badge */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-surface-highest border border-border text-[#e1e2ec]/60 text-xs font-mono px-2.5 py-1 rounded-sm">
              {lineId}
            </span>
            <span className="bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm">
              {shift} shift
            </span>
            {isResolve && (
              <span className="bg-status-amber/10 text-status-amber border border-status-amber/30 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm">
                Resolving ongoing entry
              </span>
            )}
          </div>
        </div>

        {isResolve ? (
          <form onSubmit={handleResolve} className="p-5 flex flex-col gap-4">
            {/* Optional custom end time */}
            <div>
              <label className={labelClass}>
                End Time{" "}
                <span className="text-[#e1e2ec]/20 font-normal">
                  (leave blank for now)
                </span>
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
              <p className="text-[9px] text-[#e1e2ec]/20 mt-1">
                Defaults to the current time if left blank.
              </p>
            </div>

            {error && <p className="text-status-red text-xs">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="kc-btn-wide-success"
            >
              {submitting ? "Resolving..." : "Mark Resolved"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogStop} className="p-5 flex flex-col gap-4">
            {/* Reason */}
            <div>
              <label className={labelClass}>Reason</label>
              <div className="relative">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DowntimeReason)}
                  className={selectClass}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {DOWNTIME_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#e1e2ec]/30 text-[16px] pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Start time */}
            <div>
              <label className={labelClass}>Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            {/* Units Lost */}
            <div>
              <label className={labelClass}>Units Lost</label>
              <div className={`${inputClass} tabular-nums text-[#e1e2ec]/65`}>
                Auto-calculated when downtime is resolved
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Describe what happened..."
                className={`${inputClass} resize-none`}
              />
            </div>

            {error && <p className="text-status-red text-xs">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="kc-btn-wide-danger"
            >
              {submitting ? "Saving..." : "Log Stop"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
