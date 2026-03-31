"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShiftMetrics, ShiftName } from "@/lib/types";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import type { ScrapEntry, ScrapStats } from "@/lib/reworkTypes";
import type { DowntimeEntry } from "@/lib/downtimeTypes";
import { getHourlyTargets } from "@/lib/shiftBreaks";
import { getShiftProgress } from "@/lib/shiftTime";
import LineDetailCard from "@/components/team-lead/LineDetailCard";
import FloorOverview from "@/components/team-lead/FloorOverview";
import FloorAlertStrip from "@/components/team-lead/FloorAlertStrip";

export default function TeamLeadPage() {
  const [shift, setShift] = useState<ShiftName>("day");
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [mesStates, setMesStates] = useState<LineState[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Record<string, string>>>({});
  const [scrapEntries, setScrapEntries] = useState<ScrapEntry[]>([]);
  const [allScrapEntries, setAllScrapEntries] = useState<ScrapEntry[]>([]);
  const [downtimeEntries, setDowntimeEntries] = useState<DowntimeEntry[]>([]);
  const [adminConfig, setAdminConfig] = useState<Record<string, AdminLineConfig>>({});
  const [simClock, setSimClock] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState<"floor" | "detail">("floor");
  const prevDataRef = useRef<string>("");
  const fetchRequestId = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++fetchRequestId.current;
    const [metricsRes, mesRes, clockRes, allScrapRes, configRes] = await Promise.all([
      fetch(`/api/metrics?shift=${shift}`, { cache: "no-store" }),
      fetch("/api/mes/state", { cache: "no-store" }),
      fetch("/api/sim/clock", { cache: "no-store" }),
      fetch(`/api/scrap?lineId=all&shift=${shift}`, { cache: "no-store" }),
      fetch("/api/admin/config", { cache: "no-store" }),
    ]);
    if (requestId !== fetchRequestId.current) return;
    if (metricsRes.ok) {
      const data: ShiftMetrics = await metricsRes.json();
      // Use generatedAt timestamp as a cheap change detector instead of JSON.stringify
      if (data.generatedAt !== prevDataRef.current) {
        prevDataRef.current = data.generatedAt;
        setMetrics(data);
      }
    }
    if (mesRes.ok) setMesStates(await mesRes.json());
    if (clockRes.ok) {
      const { clock } = await clockRes.json();
      setSimClock(clock ? new Date(clock) : null);
    }
    if (allScrapRes.ok) setAllScrapEntries(await allScrapRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
    setIsLoading(false);
  }, [shift]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clock); };
  }, [fetchData]);

  useEffect(() => {
    if (!selectedLineId) return;
    fetch(`/api/line/comments?lineId=${selectedLineId}`)
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setComments((prev) => ({ ...prev, [selectedLineId]: data }));
      });
  }, [selectedLineId]);

  const saveComment = useCallback(async (hour: string, comment: string) => {
    if (!selectedLineId) return;
    await fetch("/api/line/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: selectedLineId, hour, comment }),
    });
    setComments((prev) => ({
      ...prev,
      [selectedLineId]: { ...prev[selectedLineId], [hour]: comment },
    }));
  }, [selectedLineId]);

  const refreshScrap = useCallback(() => {
    if (selectedLineId) {
      fetch(`/api/scrap?lineId=${selectedLineId}&shift=${shift}`)
        .then((r) => r.json())
        .then((data: ScrapEntry[]) => setScrapEntries(data));
    } else {
      // No line selected — FloorOverview shows all lines; skip per-line scrap state
      setScrapEntries([]);
    }
  }, [selectedLineId, shift]);

  const refreshDowntime = useCallback(() => {
    if (selectedLineId) {
      fetch(`/api/downtime?lineId=${selectedLineId}&shift=${shift}`)
        .then((r) => r.json())
        .then((data: DowntimeEntry[]) => setDowntimeEntries(data));
    } else {
      setDowntimeEntries([]);
    }
  }, [selectedLineId, shift]);

  const scrapStats = useMemo<ScrapStats>(() => {
    let kickedLids = 0, scrappedPanels = 0, totalBoughtIn = 0;
    for (const e of scrapEntries) {
      if (e.kind === "kicked-lid") kickedLids++;
      else if (e.kind === "scrapped-panel") scrappedPanels++;
      if (e.boughtIn) totalBoughtIn++;
    }
    return { kickedLids, scrappedPanels, totalBoughtIn };
  }, [scrapEntries]);

  useEffect(() => {
    if (!selectedLineId) return;
    refreshScrap();
    refreshDowntime();
  }, [selectedLineId, shift, refreshScrap, refreshDowntime]);

  const { lines, selectedLine, selectedMesState } = useMemo(() => {
    if (!metrics) return { lines: [], selectedLine: null, selectedMesState: null };
    const lines = metrics.lines;
    return {
      lines,
      selectedLine: selectedLineId
        ? (lines.find((l) => l.id === selectedLineId) ?? null)
        : null,
      selectedMesState: selectedLineId
        ? mesStates.find((s) => s.lineId === selectedLineId) ?? null
        : null,
    };
  }, [metrics, selectedLineId, mesStates]);

  const hourlyTargets = useMemo(
    () =>
      selectedLine
        ? getHourlyTargets(selectedLine.target, shift, selectedMesState?.hourlyOutput ?? {})
        : [],
    [selectedLine, selectedMesState, shift]
  );

  const stateMap = useMemo(
    () => new Map(mesStates.map((s) => [s.lineId, s])),
    [mesStates]
  );

  const shiftProgress = getShiftProgress(shift, simClock ?? new Date());

  const filteredLines = useMemo(() => {
    if (!filter) return lines;
    const q = filter.toLowerCase();
    return lines.filter(
      (l) =>
        l.name.toLowerCase().startsWith(q) ||
        l.valueStream.toLowerCase().startsWith(q) ||
        l.id.toLowerCase().startsWith(q)
    );
  }, [lines, filter]);

  function getLineStatus(lineId: string) {
    const state = stateMap.get(lineId);
    const line = lines.find((l) => l.id === lineId);
    if (!state?.schedule) return { label: "IDLE", color: "text-[#e1e2ec]/40", dot: "bg-[#e1e2ec]/20" };
    if (line && line.output === 0) return { label: "STOPPED", color: "text-status-red", dot: "bg-status-red shadow-[0_0_8px_rgba(239,68,68,0.5)]" };
    if (line && line.output / line.target < 0.75) return { label: "BEHIND", color: "text-accent", dot: "bg-accent shadow-[0_0_8px_rgba(249,115,22,0.5)]" };
    return { label: "RUNNING", color: "text-status-green", dot: "bg-status-green shadow-[0_0_8px_rgba(34,197,94,0.5)]" };
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">
      {isLoading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/80">
          <div className="text-[#e1e2ec]/40 text-sm">Loading...</div>
        </div>
      )}

      {/* ── Top Nav ── */}
      <nav className="shrink-0 z-50 bg-background border-b border-border font-['Space_Grotesk',sans-serif] tracking-tight">
        <div className="flex justify-between items-center w-full px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-accent uppercase select-none">
              KINETIC COMMAND
            </span>
            <div className="hidden md:flex items-center space-x-6">
              <Link href="/eos" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                EOS
              </Link>
              <Link href="/admin" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                Admin
              </Link>
              <Link href="/team-lead" className="text-accent border-b-2 border-accent pb-0.5 font-bold text-sm">
                Team Lead
              </Link>
              <Link href="/sim" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                SIM
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-wider">
              <div className="flex gap-1">
                {(["day", "night"] as ShiftName[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                      shift === s
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "text-[#e1e2ec]/40 hover:text-[#e1e2ec] border border-transparent"
                    }`}
                  >
                    {s === "day" ? "Day" : "Night"}
                  </button>
                ))}
              </div>
              <span className="text-[#e1e2ec]/40 tabular-nums text-[10px]">{now.toLocaleTimeString("en-GB")} UTC</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar: Line Selector ── */}
        <aside className="w-72 shrink-0 bg-surface-low border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-lg text-accent font-['Space_Grotesk',sans-serif]">OP-CENTER</h2>
              </div>
              <span className="material-symbols-outlined text-accent">factory</span>
            </div>
            <div className="relative">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-background border-none text-[10px] tracking-widest p-2 rounded-sm text-[#e1e2ec] outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-[#e1e2ec]/30"
                placeholder="FILTER LINES..."
                type="text"
              />
              <span className="material-symbols-outlined absolute right-2 top-2 text-[16px] text-[#e1e2ec]/30">search</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {filteredLines.map((line) => {
              const state = stateMap.get(line.id);
              const status = getLineStatus(line.id);
              const isSelected = selectedLineId === line.id;
              return (
                <button
                  key={line.id}
                  onClick={() => {
                    setSelectedLineId(line.id);
                    setViewMode("detail");
                  }}
                  className={`w-full flex items-center justify-between p-3 transition-all cursor-pointer text-left ${
                    isSelected
                      ? "bg-surface-high border-l-4 border-accent"
                      : "hover:bg-surface-high/50 border-l-4 border-transparent"
                  }`}
                >
                  <div>
                    <span className={`block text-[10px] font-bold ${isSelected ? "text-accent" : "text-[#e1e2ec]/40"}`}>
                      {line.valueStream} — {line.name}
                    </span>
                    <span className="block text-xs text-[#e1e2ec]/60">
                      {line.output}/{line.target}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`w-2 h-2 rounded-full ${status.dot} mb-1`} />
                    <span className={`text-[9px] font-mono ${status.color}`}>{status.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
          {/* Tab toggle */}
          <div className="flex items-center gap-1 mb-6 p-1 bg-surface-low rounded-sm w-fit">
            <button
              onClick={() => setViewMode("floor")}
              className={`px-4 py-2 rounded-sm text-xs font-bold tracking-wider transition-colors ${
                viewMode === "floor"
                  ? "bg-accent text-background"
                  : "text-[#e1e2ec]/40 hover:text-[#e1e2ec]"
              }`}
            >
              FLOOR OVERVIEW
            </button>
            <button
              onClick={() => setViewMode("detail")}
              className={`px-4 py-2 rounded-sm text-xs font-bold tracking-wider transition-colors ${
                viewMode === "detail"
                  ? "bg-accent text-background"
                  : "text-[#e1e2ec]/40 hover:text-[#e1e2ec]"
              }`}
            >
              LINE DETAIL
            </button>
          </div>

          {/* View content */}
          {viewMode === "detail" && selectedLine ? (
            <LineDetailCard
              line={selectedLine}
              mesState={selectedMesState}
              shift={shift}
              shiftProgress={shiftProgress}
              hourlyTargets={hourlyTargets}
              comments={selectedLineId ? (comments[selectedLineId] ?? {}) : {}}
              onSaveComment={saveComment}
              onBack={() => {
                setSelectedLineId(null);
                setViewMode("floor");
              }}
              scrapEntries={scrapEntries}
              scrapStats={scrapStats}
              onRefreshScrap={refreshScrap}
              downtimeEntries={downtimeEntries}
              onRefreshDowntime={refreshDowntime}
            />
          ) : viewMode === "detail" ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[#e1e2ec]/10 text-7xl mb-4">factory</span>
              <h2 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#e1e2ec]/20 mb-2">
                No Line Selected
              </h2>
              <p className="text-[#e1e2ec]/30 text-sm max-w-sm mb-6">
                Choose an assembly line from the sidebar, or switch to Floor Overview to see all lines at a glance.
              </p>
              <button
                onClick={() => setViewMode("floor")}
                className="px-4 py-2 bg-accent/15 text-accent border border-accent/30 rounded-sm text-xs font-bold tracking-wider hover:bg-accent/25 transition-colors"
              >
                FLOOR OVERVIEW
              </button>
            </div>
          ) : metrics ? (
            <>
              <FloorAlertStrip
                lines={metrics.lines}
                mesStates={mesStates}
                adminConfig={adminConfig}
              />
              <FloorOverview
                metrics={metrics}
                mesStates={mesStates}
                scrapEntries={allScrapEntries}
                shiftProgress={shiftProgress}
                adminConfig={adminConfig}
                onSelectLine={(lineId) => {
                  setSelectedLineId(lineId);
                  setViewMode("detail");
                }}
              />
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[#e1e2ec]/10 text-7xl mb-4">factory</span>
              <h2 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#e1e2ec]/20 mb-2">
                Loading...
              </h2>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
