"use client";

import { useState } from "react";
import type { ScrapEntry } from "@/lib/reworkTypes";
import { PANEL_OPTIONS, DAMAGE_TYPES } from "@/lib/reworkTypes";
import type { ShiftName } from "@/lib/types";

interface ScrapFormProps {
  lineId: string;
  shift: ShiftName;
  onClose: () => void;
  onCreated: (entry: ScrapEntry) => void;
}

type FormKind = "scrapped-panel" | "kicked-lid";

export default function ScrapForm({
  lineId,
  shift,
  onClose,
  onCreated,
}: ScrapFormProps) {
  const [quickMode, setQuickMode] = useState(true);
  const [kind, setKind] = useState<FormKind>("scrapped-panel");
  const [model, setModel] = useState("");
  const [panel, setPanel] = useState<(typeof PANEL_OPTIONS)[number]>("A");
  const [damageType, setDamageType] = useState<(typeof DAMAGE_TYPES)[number]>(
    DAMAGE_TYPES[0]
  );
  const [stationFound, setStationFound] = useState("");
  const [howDamaged, setHowDamaged] = useState("");
  const [affectedArea, setAffectedArea] = useState<"panel" | "extrusion">("panel");
  const [auditorInitials, setAuditorInitials] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick mode: panel issue → scrapped-panel, lid issue → kicked-lid
  const [quickType, setQuickType] = useState<"panel-issue" | "lid-issue">("panel-issue");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resolvedKind: FormKind = quickMode
        ? quickType === "panel-issue" ? "scrapped-panel" : "kicked-lid"
        : kind;

      const base = {
        kind: resolvedKind,
        lineId,
        shift,
        model,
        panel,
        damageType: quickMode
          ? (quickType === "panel-issue" ? "Damaged Panel" : "Other")
          : damageType,
      };

      const body =
        resolvedKind === "scrapped-panel"
          ? {
              ...base,
              stationFound: quickMode ? "Unknown" : stationFound,
              howDamaged: quickMode ? "Quick log" : howDamaged,
            }
          : {
              ...base,
              affectedArea: quickMode ? "panel" : affectedArea,
              auditorInitials: (quickMode ? "TL" : auditorInitials).toUpperCase().trim(),
            };

      const res = await fetch("/api/scrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to log entry");
      }
      const entry: ScrapEntry = await res.json();
      onCreated(entry);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full bg-surface-highest border-0 border-l-2 border-accent rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-[#e1e2ec]/20";
  const labelClass = "block text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-sm w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-lg">Log Rework Entry</h3>
          <button
            onClick={onClose}
            className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] bg-transparent border-none cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex gap-2 p-0.5 bg-surface-low rounded-sm">
            {(["Quick Log", "Full Details"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setQuickMode(mode === "Quick Log")}
                className={`flex-1 py-2 rounded-sm text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${
                  quickMode === (mode === "Quick Log")
                    ? "bg-accent text-black border-accent"
                    : "bg-transparent text-[#e1e2ec]/40 border-transparent hover:text-[#e1e2ec]/70"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* ── Quick Log Mode ── */}
          {quickMode && (
            <div className="flex flex-col gap-4">
              {/* Model */}
              <div>
                <label className={labelClass}>Model#</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  placeholder="e.g. 449324TS"
                  className={inputClass}
                  list="recent-models"
                />
                <datalist id="recent-models">
                  <option value="449324TS" />
                  <option value="80120" />
                  <option value="449325TS" />
                  <option value="449322TS" />
                  <option value="80121" />
                </datalist>
              </div>

              {/* Panel */}
              <div>
                <label className={labelClass}>Panel</label>
                <div className="flex gap-2">
                  {PANEL_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPanel(p)}
                      className={`flex-1 h-11 rounded-sm text-base font-bold border transition-colors cursor-pointer ${
                        panel === p
                          ? "bg-accent text-black border-accent"
                          : "bg-transparent text-[#e1e2ec]/50 border-border hover:border-[#e1e2ec]/30"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type toggle */}
              <div>
                <label className={labelClass}>Type</label>
                <div className="flex gap-2">
                  {(["panel-issue", "lid-issue"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuickType(t)}
                      className={`flex-1 py-3 rounded-sm text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${
                        quickType === t
                          ? t === "panel-issue"
                            ? "bg-status-red/15 text-status-red border-status-red/30"
                            : "bg-status-amber/15 text-status-amber border-status-amber/30"
                          : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                      }`}
                    >
                      {t === "panel-issue" ? "Panel Issue" : "Lid Issue"}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-status-red text-xs">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent hover:opacity-90 disabled:opacity-50 text-black font-black text-xs uppercase tracking-[0.2em] py-3 rounded-sm transition-all active:scale-95 cursor-pointer border-none"
              >
                {submitting ? "Saving..." : "Log Entry"}
              </button>
            </div>
          )}

          {/* ── Full Details Mode ── */}
          {!quickMode && (
            <>
              {/* Kind toggle */}
              <div className="flex gap-2">
            {(["scrapped-panel", "kicked-lid"] as FormKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${
                  kind === k
                    ? k === "scrapped-panel"
                      ? "bg-status-red/15 text-status-red border-status-red/30"
                      : "bg-status-amber/15 text-status-amber border-status-amber/30"
                    : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                }`}
              >
                {k === "scrapped-panel" ? "Scrapped Panel" : "Kicked Lid"}
              </button>
            ))}
          </div>

          {/* Model */}
          <div>
            <label className={labelClass}>Model#</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              placeholder="e.g. 449324TS"
              className={inputClass}
            />
          </div>

          {/* Panel */}
          <div>
            <label className={labelClass}>Panel</label>
            <div className="flex gap-2">
              {PANEL_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPanel(p)}
                  className={`w-9 h-9 rounded-sm text-sm font-bold border transition-colors cursor-pointer ${
                    panel === p
                      ? "bg-accent text-black border-accent"
                      : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Damage type */}
          <div>
            <label className={labelClass}>Type of Damage</label>
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value as (typeof DAMAGE_TYPES)[number])}
              className={inputClass}
            >
              {DAMAGE_TYPES.map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>

          {/* Scrapped-panel specific fields */}
          {kind === "scrapped-panel" && (
            <>
              <div>
                <label className={labelClass}>Station Found</label>
                <input
                  value={stationFound}
                  onChange={(e) => setStationFound(e.target.value)}
                  required
                  placeholder="e.g. End of line"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>How Damaged</label>
                <textarea
                  value={howDamaged}
                  onChange={(e) => setHowDamaged(e.target.value)}
                  required
                  rows={2}
                  placeholder="Describe the damage..."
                  className={`${inputClass} resize-none`}
                />
              </div>
            </>
          )}

          {/* Kicked-lid specific fields */}
          {kind === "kicked-lid" && (
            <>
              <div>
                <label className={labelClass}>Affected Area</label>
                <div className="flex gap-2">
                  {(["panel", "extrusion"] as const).map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => setAffectedArea(area)}
                      className={`flex-1 py-2.5 rounded-sm text-xs font-bold capitalize border transition-colors cursor-pointer ${
                        affectedArea === area
                          ? "bg-status-amber/15 text-status-amber border-status-amber/30"
                          : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Auditor Initials</label>
                <input
                  value={auditorInitials}
                  onChange={(e) => setAuditorInitials(e.target.value)}
                  required
                  maxLength={3}
                  placeholder="e.g. JDF"
                  className={`${inputClass} uppercase`}
                />
              </div>
            </>
          )}

          {error && <p className="text-status-red text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent hover:opacity-90 disabled:opacity-50 text-black font-black text-xs uppercase tracking-[0.2em] py-3 rounded-sm transition-all active:scale-95 cursor-pointer border-none"
          >
            {submitting ? "Saving..." : "Log Entry"}
          </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
