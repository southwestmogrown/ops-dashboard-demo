"use client";

import { useState } from "react";
import type { ScrapEntry } from "@/lib/types/quality";
import { PANEL_OPTIONS, DAMAGE_TYPES } from "@/lib/types/quality";
import type { ShiftName } from "@/lib/types/core";

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
  const [kind, setKind] = useState<FormKind>("scrapped-panel");
  const [model, setModel] = useState("");
  const [panel, setPanel] = useState<(typeof PANEL_OPTIONS)[number]>("A");
  const [damageType, setDamageType] = useState<(typeof DAMAGE_TYPES)[number]>(
    DAMAGE_TYPES[0],
  );
  const [stationFound, setStationFound] = useState("");
  const [howDamaged, setHowDamaged] = useState("");
  const [affectedArea, setAffectedArea] = useState<"panel" | "extrusion">(
    "panel",
  );
  const [auditorInitials, setAuditorInitials] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const base = {
        kind,
        lineId,
        shift,
        model,
        panel,
        damageType,
      };

      const body =
        kind === "scrapped-panel"
          ? {
              ...base,
              stationFound,
              howDamaged,
            }
          : {
              ...base,
              affectedArea,
              auditorInitials: auditorInitials.toUpperCase().trim(),
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

  const inputClass = "kc-input-field";
  const labelClass = "block kc-micro-label mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-sm w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-lg">
            Log Rework Entry
          </h3>
          <button
            onClick={onClose}
            className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] bg-transparent border-none cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
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
              onChange={(e) =>
                setDamageType(e.target.value as (typeof DAMAGE_TYPES)[number])
              }
              className={inputClass}
            >
              {DAMAGE_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
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
            className="kc-btn-primary-wide cursor-pointer border-none"
          >
            {submitting ? "Saving..." : "Log Entry"}
          </button>
        </form>
      </div>
    </div>
  );
}
