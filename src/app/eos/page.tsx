"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { ShiftMetrics } from "@/lib/types/core";
import Header from "@/components/Header";
import type { AdminLineConfig, LineState } from "@/lib/types/mes";
import type {
  EOSFormData,
  EOSLineDescriptor,
  EOSLineEntry,
  EOSValueStream,
} from "@/lib/types/eos";
import { calculateHPU, downloadAllReports } from "@/lib/eosReports";
import EOSLineCard from "@/components/eos/EOSLineCard";
import EOSMetaForm from "@/components/eos/EOSMetaForm";
import EOSEmailPreview from "@/components/eos/EOSEmailPreview";
import NoteCheckboxField from "@/components/eos/NoteCheckboxField";
import SidebarNav, { SidebarNavItem } from "@/components/SidebarNav";
import { useRedirectTeamLead } from "@/hooks/useRedirectTeamLead";
import { queryKeys } from "@/lib/queryKeys";
import { fetchAdminConfig, fetchMesState } from "@/lib/queryFetchers";

// ── Draft types ────────────────────────────────────────────────────────────────

interface EosDraftPayload {
  savedAt: string; // ISO timestamp
  formData: EOSFormData;
  hiddenLines: string[];
  activeStream: string;
}

// ── Draft helpers ─────────────────────────────────────────────────────────────

const DRAFT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function draftKey(shift: string, date: string): string {
  return `eos-draft-${shift.toLowerCase()}-${date}`;
}

function loadDraft(shift: string, date: string): EosDraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(shift, date));
    if (!raw) return null;
    const payload: EosDraftPayload = JSON.parse(raw);
    const age = Date.now() - new Date(payload.savedAt).getTime();
    if (age > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(shift, date));
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function clearDraft(shift: string, date: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(shift, date));
}

// ── Config ────────────────────────────────────────────────────────────────────

const VALUE_STREAMS: EOSValueStream[] = [
  {
    id: "vs1",
    name: "HFC (Hard Folding Covers)",
    lines: ["Line 1", "Line 2", "Line 3", "Line 4"],
  },
  { id: "vs2", name: "HRC (Hard Rolling Cover)", lines: ["Line 1", "Line 2"] },
];

const ALL_LINES: EOSLineDescriptor[] = VALUE_STREAMS.flatMap((vs) =>
  vs.lines.map((line) => ({
    vsId: vs.id,
    vsName: vs.name,
    line,
    lineKey: `${vs.id}:${line}`,
  })),
);

const SIDE_NAV_ITEMS: SidebarNavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/admin", label: "Admin", icon: "factory" },
];

const EMPTY_LINE: EOSLineEntry = {
  output: "",
  hpu: "0",
  hoursWorked: "10",
  headcount: "",
  orderAtPackout: "",
  remainingOnOrder: "",
  remainingOnRunSheet: "",
  changeovers: "",
  lineNotes: "",
};

function emptyFormData(): EOSFormData {
  const lines: Record<string, EOSLineEntry> = {};
  ALL_LINES.forEach(({ lineKey }) => {
    lines[lineKey] = { ...EMPTY_LINE };
  });
  return {
    supervisor: "",
    date: new Date().toISOString().split("T")[0],
    shift: "Day",
    notes: {
      topIssueToday: "",
      resolvedDuringShift: "",
      openItemsNextShift: "",
      equipmentConcerns: "",
      generalNotes: "",
    },
    lines,
  };
}

function lineIdToLineKey(lineId: string): string {
  return lineId.replace("-l", ":Line ");
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EOSPage() {
  const pathname = usePathname();
  useRedirectTeamLead();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<EOSFormData>(emptyFormData());
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [omittedLines, setOmittedLines] = useState<Set<string>>(new Set());
  const [activeStream, setActiveStream] = useState("vs1");
  const [mesRefreshing, setMesRefreshing] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(
    "ops-leads@kineticcommand.io",
  );
  const [notesValidation, setNotesValidation] = useState(false);

  // Draft restore banner
  const [draftInfo, setDraftInfo] = useState<{ savedAt: string } | null>(null);

  // ── Draft: restore on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadDraft(formData.shift, formData.date);
    if (saved) {
      setDraftInfo({ savedAt: saved.savedAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  async function refreshFromMes(
    shift: string,
    autoHide: (keys: string[]) => void,
  ) {
    setMesRefreshing(true);
    try {
      const [metrics, mesStates, adminConfig] = await Promise.all([
        fetch(`/api/metrics?shift=${shift.toLowerCase()}`).then(
          (r) => r.json() as Promise<ShiftMetrics>,
        ),
        queryClient.fetchQuery({
          queryKey: queryKeys.mesState(),
          queryFn: fetchMesState,
          staleTime: 2000,
        }).catch(
          () => [] as LineState[],
        ),
        queryClient.fetchQuery({
          queryKey: queryKeys.adminConfig(),
          queryFn: fetchAdminConfig,
          staleTime: 2000,
        }).catch(() => ({} as Record<string, AdminLineConfig>)),
      ]);

      const toHide: string[] = [];
      const toOmit = Object.entries(adminConfig)
        .filter(([, config]) => config.isRunning === false)
        .map(([lineId]) => lineIdToLineKey(lineId));

      setOmittedLines(new Set(toOmit));

      setFormData((prev) => {
        const updatedLines = { ...prev.lines };

        metrics.lines.forEach((line) => {
          const lineKey = lineIdToLineKey(line.id);
          if (!(lineKey in updatedLines)) return;
          const merged = {
            ...updatedLines[lineKey],
            output: String(line.output),
            headcount: String(line.headcount),
          };
          merged.hpu = calculateHPU(
            merged.output,
            merged.headcount,
            merged.hoursWorked,
          );
          updatedLines[lineKey] = merged;
        });

        mesStates.forEach((state) => {
          const lineKey = lineIdToLineKey(state.lineId);
          if (!(lineKey in updatedLines)) return;
          if (!state.schedule) {
            toHide.push(lineKey);
            return;
          }
          updatedLines[lineKey] = {
            ...updatedLines[lineKey],
            orderAtPackout: state.currentOrder ?? "",
            remainingOnOrder: String(state.remainingOnOrder),
            remainingOnRunSheet: String(state.remainingOnRunSheet),
            changeovers: String(state.completedOrders),
          };
        });

        return { ...prev, lines: updatedLines };
      });

      if (toHide.length > 0) autoHide(toHide);
    } catch {
      // silently ignore
    } finally {
      setMesRefreshing(false);
    }
  }

  useEffect(() => {
    refreshFromMes(formData.shift, (keys) =>
      setHiddenLines((prev) => new Set([...prev, ...keys])),
    );
  }, [formData.shift]);

  // ── Draft: persist on every form change ───────────────────────────────────
  const saveDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const payload: EosDraftPayload = {
      savedAt: new Date().toISOString(),
      formData,
      hiddenLines: [...hiddenLines],
      activeStream,
    };
    try {
      localStorage.setItem(
        draftKey(formData.shift, formData.date),
        JSON.stringify(payload),
      );
    } catch {
      // quota exceeded or private mode — silently ignore
    }
  }, [formData, hiddenLines, activeStream]);

  // Persist whenever form state changes (no deps array — reads latest via closures)
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleMeta = (key: keyof Omit<EOSFormData, "lines">, value: string) =>
    setFormData((p) => ({ ...p, [key]: value }));

  const handleNotes = (field: keyof EOSFormData["notes"], value: string) =>
    setFormData((p) => ({ ...p, notes: { ...p.notes, [field]: value } }));

  const handleLine = (
    lineKey: string,
    field: keyof EOSLineEntry,
    value: string,
  ) =>
    setFormData((p) => {
      const updated = { ...p.lines[lineKey], [field]: value };
      if (
        field === "output" ||
        field === "headcount" ||
        field === "hoursWorked"
      ) {
        updated.hpu = calculateHPU(
          updated.output,
          updated.headcount,
          updated.hoursWorked,
        );
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
      clearDraft(formData.shift, formData.date);
      setDraftInfo(null);
    }
  };

  const resumeDraft = () => {
    const saved = loadDraft(formData.shift, formData.date);
    if (!saved) return;
    setFormData(saved.formData);
    setHiddenLines(new Set(saved.hiddenLines));
    setActiveStream(saved.activeStream);
    setDraftInfo(null);
  };

  const discardDraft = () => {
    clearDraft(formData.shift, formData.date);
    setDraftInfo(null);
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const currentStream = VALUE_STREAMS.find((vs) => vs.id === activeStream)!;
  const activeLines = ALL_LINES.filter(
    ({ vsId, line }) =>
      vsId === activeStream &&
      !omittedLines.has(`${vsId}:${line}`) &&
      !hiddenLines.has(`${vsId}:${line}`),
  );
  const visibleLines = currentStream.lines.filter(
    (line) =>
      !omittedLines.has(`${currentStream.id}:${line}`) &&
      !hiddenLines.has(`${currentStream.id}:${line}`),
  );
  const hiddenVsLines = currentStream.lines.filter(
    (line) =>
      !omittedLines.has(`${currentStream.id}:${line}`) &&
      hiddenLines.has(`${currentStream.id}:${line}`),
  );
  const omittedVsLines = currentStream.lines.filter((line) =>
    omittedLines.has(`${currentStream.id}:${line}`),
  );

  const filledLines = activeLines.filter(
    ({ lineKey }) => formData.lines[lineKey].output,
  ).length;
  const progress =
    activeLines.length > 0
      ? Math.round((filledLines / activeLines.length) * 100)
      : 0;

  const shiftWindow =
    formData.shift === "Day" ? "06:00 – 14:00" : "14:00 – 22:00";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">
      {/* ── Header ── */}
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <SidebarNav
          items={SIDE_NAV_ITEMS}
          activePath={pathname}
          header={
            <div className="p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
                <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
                  OP-CENTER
                </span>
              </div>
            </div>
          }
        />

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-background">
          <div className="p-6 md:p-10 max-w-[1400px] mx-auto space-y-8">
            {/* Draft restore banner */}
            {draftInfo && (
              <div className="flex items-center gap-4 px-5 py-3 bg-vs2/10 border border-vs2/30 rounded-sm">
                <span className="material-symbols-outlined text-vs2 text-sm">
                  restore
                </span>
                <p className="text-sm text-[#e1e2ec] flex-1">
                  Resume draft from{" "}
                  <span className="font-mono text-vs2">
                    {new Date(draftInfo.savedAt).toLocaleString()}
                  </span>
                  ?
                </p>
                <button
                  onClick={resumeDraft}
                  className="px-4 py-1.5 bg-vs2 text-black rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-vs2/80 transition-colors cursor-pointer"
                >
                  Resume
                </button>
                <button
                  onClick={discardDraft}
                  className="px-4 py-1.5 bg-transparent text-[#e1e2ec]/50 border border-border rounded-sm text-xs font-bold uppercase tracking-wider hover:border-status-red hover:text-status-red transition-colors cursor-pointer"
                >
                  Discard
                </button>
              </div>
            )}

            {/* Page header */}
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-accent pl-6 py-2">
              <div>
                <h1 className="font-['Space_Grotesk',sans-serif] text-4xl md:text-5xl font-extrabold tracking-tight uppercase mb-2">
                  End-of-Shift Report
                </h1>
                <div className="flex flex-wrap items-center gap-6 text-[#e1e2ec]/60 font-medium text-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-sm">
                      calendar_today
                    </span>
                    <span>{formData.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-sm">
                      schedule
                    </span>
                    <span>
                      {formData.shift} Shift ({shiftWindow})
                    </span>
                  </div>
                  {formData.supervisor && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-accent text-sm">
                        badge
                      </span>
                      <span>Shift Lead: {formData.supervisor}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-sm">
                      mail
                    </span>
                    <input
                      type="email"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                      className="bg-transparent border-b border-border/40 text-[#e1e2ec]/60 text-sm outline-none focus:border-accent w-52 px-0.5 placeholder:text-[#e1e2ec]/20"
                      placeholder="ops-leads@kineticcommand.io"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => downloadAllReports(formData, activeLines)}
                  className="px-5 py-2.5 bg-surface-highest text-[#e1e2ec] rounded-sm border border-border hover:bg-surface-high transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-sm">
                    download
                  </span>
                  CSV Export
                </button>
                <button
                  onClick={() => {
                    const body =
                      document.querySelector("#eos-email-body")?.textContent ??
                      "";
                    navigator.clipboard.writeText(body);
                  }}
                  title="Copies email body to clipboard"
                  className="px-6 py-2.5 bg-surface-highest text-[#e1e2ec] border border-border rounded-sm hover:bg-surface-high transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-sm">
                    content_copy
                  </span>
                  Copy Email
                </button>
                <button
                  onClick={() => {
                    setNotesValidation(true);
                    if (!formData.notes.topIssueToday.trim()) return;
                    const body =
                      document.querySelector("#eos-email-body")?.textContent ??
                      "";
                    navigator.clipboard.writeText(
                      `To: ${emailRecipient}\n\n${body}`,
                    );
                    clearDraft(formData.shift, formData.date);
                    setDraftInfo(null);
                  }}
                  title="Validate and copy email body to clipboard"
                  className="px-6 py-2.5 bg-accent text-black rounded-sm hover:bg-orange-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">
                    send
                  </span>
                  Submit &amp; Send
                </button>
              </div>
            </section>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              {/* ── Left column ── */}
              <div className="xl:col-span-8 space-y-6">
                {/* Meta form + Operational Summary */}
                <EOSMetaForm data={formData} onChangeMeta={handleMeta} />

                {/* Structured Notes */}
                <div className="bg-surface-low p-6 border-l-2 border-accent/30">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined text-accent">
                      notes
                    </span>
                    <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">
                      Operational Summary
                    </h3>
                  </div>
                  <div className="space-y-5">
                    {/* Top Issue Today — required */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[10px] text-[#e1e2ec]/40 mb-1.5 tracking-widest uppercase font-bold">
                        <span>Top Issue Today</span>
                        <span className="text-status-red">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.notes.topIssueToday}
                        onChange={(e) =>
                          handleNotes("topIssueToday", e.target.value)
                        }
                        onBlur={() => setNotesValidation(true)}
                        placeholder="Primary issue impacting production this shift"
                        className={[
                          "w-full bg-surface-highest rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none font-mono focus:ring-1 focus:ring-accent/40 placeholder:text-[#e1e2ec]/20",
                          notesValidation &&
                          !formData.notes.topIssueToday.trim()
                            ? "ring-1 ring-status-red/60"
                            : "",
                        ].join(" ")}
                      />
                      {notesValidation &&
                        !formData.notes.topIssueToday.trim() && (
                          <p className="mt-1 text-[10px] text-status-red font-bold tracking-widest uppercase">
                            Required — enter the primary issue for this shift
                          </p>
                        )}
                    </div>

                    {/* Resolved During Shift */}
                    <NoteCheckboxField
                      label="Resolved During Shift"
                      value={formData.notes.resolvedDuringShift}
                      onChange={(v) => handleNotes("resolvedDuringShift", v)}
                    />

                    {/* Open Items Next Shift */}
                    <NoteCheckboxField
                      label="Open Items for Next Shift"
                      value={formData.notes.openItemsNextShift}
                      onChange={(v) => handleNotes("openItemsNextShift", v)}
                    />

                    {/* Equipment Concerns */}
                    <NoteCheckboxField
                      label="Equipment Concerns"
                      value={formData.notes.equipmentConcerns}
                      onChange={(v) => handleNotes("equipmentConcerns", v)}
                    />

                    {/* General Notes */}
                    <div>
                      <label className="block text-[10px] text-[#e1e2ec]/40 mb-1.5 tracking-widest uppercase font-bold">
                        General Notes
                        <span className="ml-2 text-[#e1e2ec]/20 normal-case tracking-normal font-normal">
                          (optional)
                        </span>
                      </label>
                      <textarea
                        value={formData.notes.generalNotes}
                        onChange={(e) =>
                          handleNotes("generalNotes", e.target.value)
                        }
                        rows={3}
                        placeholder="Any additional observations, safety incidents, or production notes..."
                        className="w-full bg-surface-highest border-none rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm leading-relaxed resize-y placeholder:text-[#e1e2ec]/20 outline-none focus:ring-1 focus:ring-accent/40 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* VS Tabs */}
                <div className="flex border-b border-border">
                  {VALUE_STREAMS.map((vs) => (
                    <button
                      key={vs.id}
                      onClick={() => setActiveStream(vs.id)}
                      className={[
                        "px-5 py-3 text-xs tracking-widest uppercase border-b-2 transition-all bg-transparent cursor-pointer",
                        activeStream === vs.id
                          ? "text-accent border-accent font-bold"
                          : "text-[#e1e2ec]/30 border-transparent hover:text-[#e1e2ec]/60",
                      ].join(" ")}
                    >
                      {vs.id === "vs1" ? "HFC" : "HRC"}
                    </button>
                  ))}
                </div>

                {/* Line cards */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-accent">
                        settings_input_component
                      </span>
                      <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">
                        Line Metrics
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#e1e2ec]/30 font-bold uppercase tracking-widest">
                        Auto-Synced from MES
                      </span>
                      <button
                        onClick={() =>
                          refreshFromMes(formData.shift, (keys) =>
                            setHiddenLines(
                              (prev) => new Set([...prev, ...keys]),
                            ),
                          )
                        }
                        disabled={mesRefreshing}
                        className="text-[10px] text-accent uppercase font-bold tracking-wider hover:underline disabled:opacity-50 cursor-pointer bg-transparent border-none"
                      >
                        {mesRefreshing ? "Refreshing…" : "Refresh"}
                      </button>
                    </div>
                  </div>

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

                  {visibleLines.length === 0 && (
                    <div className="px-4 py-5 bg-surface border border-border rounded-sm text-sm text-[#e1e2ec]/55">
                      No running lines in this value stream for the current EOS
                      report.
                    </div>
                  )}

                  {hiddenVsLines.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 py-3 bg-surface border border-dashed border-border rounded-sm">
                      <span className="text-[10px] text-[#e1e2ec]/30 tracking-widest uppercase self-center mr-1 font-bold">
                        Hidden:
                      </span>
                      {hiddenVsLines.map((line) => (
                        <button
                          key={line}
                          onClick={() => handleShowLine(currentStream.id, line)}
                          title={`Restore ${line}`}
                          className="border border-border rounded-sm text-[#e1e2ec]/40 text-xs px-2.5 py-0.5 bg-transparent cursor-pointer hover:border-accent hover:text-accent transition-colors"
                        >
                          + {line}
                        </button>
                      ))}
                    </div>
                  )}

                  {omittedVsLines.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 py-3 bg-surface border border-border rounded-sm">
                      <span className="text-[10px] text-[#e1e2ec]/30 tracking-widest uppercase self-center mr-1 font-bold">
                        Omitted:
                      </span>
                      {omittedVsLines.map((line) => (
                        <span
                          key={line}
                          className="border border-border rounded-sm text-[#e1e2ec]/40 text-xs px-2.5 py-0.5"
                        >
                          {line} not running
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom actions */}
                <div className="flex gap-3 flex-wrap pt-2">
                  <button
                    onClick={() =>
                      refreshFromMes(formData.shift, (keys) =>
                        setHiddenLines((prev) => new Set([...prev, ...keys])),
                      )
                    }
                    disabled={mesRefreshing}
                    className="px-5 py-2.5 bg-surface text-[#e1e2ec]/50 border border-border rounded-sm cursor-pointer text-xs tracking-widest uppercase hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                  >
                    {mesRefreshing ? "Refreshing…" : "Refresh from MES"}
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-5 py-2.5 bg-transparent text-[#e1e2ec]/30 border border-border rounded-sm cursor-pointer text-xs tracking-widest uppercase hover:border-status-red hover:text-status-red transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* ── Right column: Email preview ── */}
              <div className="xl:col-span-4 xl:sticky xl:top-6">
                <EOSEmailPreview
                  data={formData}
                  activeLines={activeLines}
                  streamName={currentStream.name}
                  emailRecipient={emailRecipient}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
