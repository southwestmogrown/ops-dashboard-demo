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

const SIDE_NAV = [
  { icon: "dashboard", label: "Dashboard" },
  { icon: "factory", label: "Assembly Lines" },
  { icon: "inventory_2", label: "Inventory" },
  { icon: "verified", label: "Quality Control" },
  { icon: "build", label: "Maintenance" },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EOSPage() {
  const [formData, setFormData]       = useState<EOSFormData>(emptyFormData());
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [activeStream, setActiveStream] = useState("vs1");
  const [mesRefreshing, setMesRefreshing] = useState(false);

  async function refreshFromMes(shift: string, autoHide: (keys: string[]) => void) {
    setMesRefreshing(true);
    try {
      const [metrics, mesStates] = await Promise.all([
        fetch(`/api/metrics?shift=${shift.toLowerCase()}`).then((r) => r.json() as Promise<ShiftMetrics>),
        fetch("/api/mes/state").then((r) => r.json() as Promise<LineState[]>).catch(() => [] as LineState[]),
      ]);

      const toHide: string[] = [];

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
          const lineKey = state.lineId.replace("-l", ":Line ");
          if (!(lineKey in updatedLines)) return;
          if (!state.schedule) {
            toHide.push(lineKey);
            return;
          }
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

  const shiftWindow = formData.shift === "Day" ? "06:00 – 14:00" : "14:00 – 22:00";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">

      {/* ── Top Nav ── */}
      <nav className="shrink-0 z-50 bg-background border-b border-border font-['Space_Grotesk',sans-serif] tracking-tight">
        <div className="flex justify-between items-center w-full px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-accent uppercase select-none">
              KINETIC COMMAND
            </span>
            <div className="hidden md:flex items-center space-x-6">
              <Link
                href="/eos"
                className="text-accent border-b-2 border-accent pb-0.5 font-bold text-sm"
              >
                EOS
              </Link>
              <Link href="/admin" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                Admin
              </Link>
              <Link href="/team-lead" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                Team Lead
              </Link>
              <Link href="/sim" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                SIM
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Progress pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-sm text-xs font-mono">
              <span className="text-[#e1e2ec]/50">{filledLines}/{activeLines.length} lines</span>
              <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden">
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
              className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 bg-surface-low border-r border-border flex-col overflow-y-auto custom-scrollbar hidden lg:flex">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
              <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
                OP-CENTER
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold">
              Station 04 Active
            </p>
          </div>

          <nav className="flex-1 py-4 space-y-1">
            {SIDE_NAV.map(({ icon, label }) => (
              <div
                key={label}
                title="Coming Soon"
                className="flex items-center space-x-3 text-[#e1e2ec]/15 px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest cursor-not-allowed select-none"
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </nav>

          <div className="p-4 bg-surface border-t border-border">
            <div className="w-full bg-[#93000a]/80 text-[#ffdad6]/60 py-3 rounded-sm font-bold uppercase tracking-tighter text-sm flex items-center justify-center space-x-2 select-none cursor-not-allowed">
              <span className="material-symbols-outlined text-[18px]">dangerous</span>
              <span>Emergency Stop</span>
            </div>
          </div>

          <div className="p-2 border-t border-border space-y-1">
            <div
              title="Coming Soon"
              className="flex items-center space-x-3 text-[#e1e2ec]/15 px-4 py-2 text-xs cursor-not-allowed select-none"
            >
              <span className="material-symbols-outlined text-sm">help_center</span>
              <span>Support</span>
            </div>
            <div
              title="Coming Soon"
              className="flex items-center space-x-3 text-[#e1e2ec]/15 px-4 py-2 text-xs cursor-not-allowed select-none"
            >
              <span className="material-symbols-outlined text-sm">history_edu</span>
              <span>Logs</span>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-background">
          <div className="p-6 md:p-10 max-w-[1400px] mx-auto space-y-8">

            {/* Page header */}
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-accent pl-6 py-2">
              <div>
                <h1 className="font-['Space_Grotesk',sans-serif] text-4xl md:text-5xl font-extrabold tracking-tight uppercase mb-2">
                  End-of-Shift Report
                </h1>
                <div className="flex flex-wrap items-center gap-6 text-[#e1e2ec]/60 font-medium text-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-sm">calendar_today</span>
                    <span>{formData.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-sm">schedule</span>
                    <span>{formData.shift} Shift ({shiftWindow})</span>
                  </div>
                  {formData.supervisor && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-accent text-sm">badge</span>
                      <span>Shift Lead: {formData.supervisor}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => downloadAllReports(formData, activeLines)}
                  className="px-5 py-2.5 bg-surface-highest text-[#e1e2ec] rounded-sm border border-border hover:bg-surface-high transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  CSV Export
                </button>
                <button
                  onClick={() => {
                    const body = document.querySelector("#eos-email-body")?.textContent ?? "";
                    navigator.clipboard.writeText(body);
                  }}
                  title="Copies email body to clipboard"
                  className="px-6 py-2.5 bg-accent text-black rounded-sm hover:bg-orange-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  Copy Email
                </button>
              </div>
            </section>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

              {/* ── Left column ── */}
              <div className="xl:col-span-8 space-y-6">

                {/* Meta form + Operational Summary */}
                <EOSMetaForm data={formData} onChangeMeta={handleMeta} />

                {/* Notes */}
                <div className="bg-surface-low p-6 border-l-2 border-accent/30">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-accent">notes</span>
                    <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">
                      Operational Summary
                    </h3>
                  </div>
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                    <textarea
                      value={formData.notes}
                      onChange={(e) => handleMeta("notes", e.target.value)}
                      rows={4}
                      placeholder="Enter shift-wide notes, safety incidents, or overall production roadblocks..."
                      className="w-full bg-surface-highest border-none text-[#e1e2ec] p-4 min-h-[120px] text-sm leading-relaxed resize-y placeholder:text-[#e1e2ec]/20 outline-none focus:ring-1 focus:ring-accent/40"
                    />
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
                      <span className="material-symbols-outlined text-accent">settings_input_component</span>
                      <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">
                        Line Metrics
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[#e1e2ec]/30 font-bold uppercase tracking-widest">
                        Auto-Synced from MES
                      </span>
                      <button
                        onClick={() => refreshFromMes(formData.shift, (keys) =>
                          setHiddenLines((prev) => new Set([...prev, ...keys])),
                        )}
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
                </div>

                {/* Bottom actions */}
                <div className="flex gap-3 flex-wrap pt-2">
                  <button
                    onClick={() => refreshFromMes(formData.shift, (keys) =>
                      setHiddenLines((prev) => new Set([...prev, ...keys])),
                    )}
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
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
