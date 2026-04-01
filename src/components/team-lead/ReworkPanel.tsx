"use client";

import { useEffect, useState } from "react";
import type { ScrapEntry } from "@/lib/types/quality";
import { PANEL_OPTIONS, DAMAGE_TYPES } from "@/lib/types/quality";

interface ReworkPanelProps {
  entries: ScrapEntry[];
  kickedLids: number;
  scrappedPanels: number;
  onEntryChange?: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Inline edit mode for a scrap entry. */
function EditEntryForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: ScrapEntry;
  onSave: (updates: {
    model?: string;
    panel?: string;
    damageType?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [model, setModel] = useState(entry.model);
  const [panel, setPanel] = useState(entry.panel);
  const [damageType, setDamageType] = useState(entry.damageType);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/scrap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          void: false,
          updates: { model, panel, damageType },
        }),
      });
      onSave({ model, panel, damageType });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-high rounded-sm p-2 mt-1 border border-accent/20 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold block mb-0.5">
            Model
          </label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-background border-none rounded-sm px-2 py-1 text-[10px] text-[#e1e2ec] outline-none font-mono"
          />
        </div>
        <div>
          <label className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold block mb-0.5">
            Panel
          </label>
          <select
            value={panel}
            onChange={(e) =>
              setPanel(e.target.value as (typeof PANEL_OPTIONS)[number])
            }
            className="w-full bg-background border-none rounded-sm px-2 py-1 text-[10px] text-[#e1e2ec] outline-none font-mono"
          >
            {PANEL_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold block mb-0.5">
          Damage Type
        </label>
        <select
          value={damageType}
          onChange={(e) =>
            setDamageType(e.target.value as (typeof DAMAGE_TYPES)[number])
          }
          className="w-full bg-background border-none rounded-sm px-2 py-1 text-[10px] text-[#e1e2ec] outline-none font-mono"
        >
          {DAMAGE_TYPES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[9px] text-[#e1e2ec]/40 hover:text-[#e1e2ec] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-2 py-1 text-[9px] bg-accent text-background rounded-sm font-bold hover:bg-accent/80 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

/** Inline void confirmation for a scrap entry. */
function VoidConfirm({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: ScrapEntry;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="bg-surface-high rounded-sm p-2 mt-1 border border-status-red/30 space-y-2">
      <p className="text-[10px] text-status-red font-bold">Void this entry?</p>
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Void reason..."
        className="w-full bg-background border border-border rounded-sm px-2 py-1 text-[10px] text-[#e1e2ec] outline-none placeholder:text-[#e1e2ec]/20"
        onKeyDown={(e) => {
          if (e.key === "Enter" && reason.trim()) onConfirm(reason.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[9px] text-[#e1e2ec]/40 hover:text-[#e1e2ec] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(reason.trim())}
          disabled={!reason.trim()}
          className="px-2 py-1 text-[9px] bg-status-red text-white rounded-sm font-bold hover:bg-status-red/80 transition-colors disabled:opacity-40"
        >
          Void Entry
        </button>
      </div>
    </div>
  );
}

export default function ReworkPanel({
  entries,
  kickedLids,
  scrappedPanels,
  onEntryChange,
}: ReworkPanelProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<ScrapEntry[]>(entries);

  // Sync when prop changes (e.g. after shift change) — useEffect avoids React setState-during-render anti-pattern
  useEffect(() => {
    if (entries !== localEntries && !open) {
      setLocalEntries(entries);
    }
  }, [entries, localEntries, open]);

  function applyUpdate(id: string, fn: (e: ScrapEntry) => ScrapEntry) {
    setLocalEntries((prev) => prev.map((e) => (e.id === id ? fn(e) : e)));
    onEntryChange?.();
  }

  async function handleVoid(id: string, reason: string) {
    const res = await fetch("/api/scrap", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, void: true, voidReason: reason }),
    });
    if (res.ok) {
      applyUpdate(id, (e) => ({ ...e, voidReason: reason }));
    }
    setVoidingId(null);
  }

  const activeEntries = localEntries.filter((e) => !e.voidReason);
  const voidedEntries = localEntries.filter((e) => !!e.voidReason);

  return (
    <div className="pt-2 border-t border-border/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-left hover:opacity-80 transition-opacity p-0"
      >
        <span className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold">
          {localEntries.length} log entries
          {activeEntries.length !== localEntries.length
            ? ` (${activeEntries.length} active, ${voidedEntries.length} voided)`
            : ""}
        </span>
        <span className="text-[#e1e2ec]/30 text-xs">
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {localEntries.length === 0 ? (
            <p className="text-[10px] text-[#e1e2ec]/30 italic">
              No entries this shift.
            </p>
          ) : (
            <>
              {localEntries.map((entry) => {
                const isVoided = !!entry.voidReason;
                const isEditing = editingId === entry.id;
                const isVoiding = voidingId === entry.id;

                return (
                  <div key={entry.id}>
                    <div
                      className={`flex items-start gap-2 py-1.5 ${
                        isVoided ? "opacity-40" : ""
                      }`}
                    >
                      <span
                        className={`shrink-0 mt-0.5 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
                          entry.kind === "scrapped-panel"
                            ? "bg-status-red/20 text-status-red"
                            : "bg-status-amber/20 text-status-amber"
                        }`}
                      >
                        {entry.kind === "scrapped-panel" ? "SC" : "KL"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isVoided && (
                            <span className="text-[8px] font-bold bg-status-red/20 text-status-red border border-status-red/30 rounded px-1 py-0.5 uppercase">
                              VOIDED: {entry.voidReason}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-mono ${isVoided ? "line-through" : ""}`}
                          >
                            {entry.model}
                          </span>
                          <span className="text-[#e1e2ec]/30 text-[10px]">
                            Panel {entry.panel}
                          </span>
                          <span className="text-[#e1e2ec]/30 text-[10px]">
                            &middot;
                          </span>
                          <span
                            className={`text-[10px] truncate ${isVoided ? "line-through text-[#e1e2ec]/30" : "text-[#e1e2ec]/40"}`}
                          >
                            {entry.damageType}
                          </span>
                          {entry.boughtIn && (
                            <span className="text-[8px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1 py-0.5">
                              BOUGHT IN
                            </span>
                          )}
                        </div>
                        <div className="text-[#e1e2ec]/30 text-[9px] mt-0.5">
                          {entry.kind === "scrapped-panel"
                            ? entry.stationFound || "\u2014"
                            : `Auditor: ${entry.auditorInitials || "\u2014"}`}
                          {" \u00B7 "}
                          {formatTime(entry.timestamp)}
                          {" \u00B7 "}
                          <span className="font-mono text-[#e1e2ec]/20">
                            {entry.id}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons — hidden for voided */}
                      {!isVoided && (
                        <div className="shrink-0 flex gap-1">
                          {/* Edit */}
                          <button
                            onClick={() =>
                              setEditingId(isEditing ? null : entry.id)
                            }
                            title="Edit"
                            className="w-5 h-5 flex items-center justify-center text-[#e1e2ec]/30 hover:text-[#e1e2ec]/60 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              edit
                            </span>
                          </button>
                          {/* Void */}
                          <button
                            onClick={() =>
                              setVoidingId(isVoiding ? null : entry.id)
                            }
                            title="Void"
                            className="w-5 h-5 flex items-center justify-center text-[#e1e2ec]/30 hover:text-status-red/80 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              close
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline edit form */}
                    {isEditing && (
                      <EditEntryForm
                        entry={entry}
                        onSave={() => setEditingId(null)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}

                    {/* Inline void confirm */}
                    {isVoiding && (
                      <VoidConfirm
                        entry={entry}
                        onConfirm={(reason) => handleVoid(entry.id, reason)}
                        onCancel={() => setVoidingId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
