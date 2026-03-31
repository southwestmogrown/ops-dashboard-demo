"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShiftMetrics, ShiftName } from "@/lib/types";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import type { ScrapEntry, ScrapStats } from "@/lib/reworkTypes";
import type { DowntimeEntry } from "@/lib/downtimeTypes";
import { getHourlyTargets } from "@/lib/shiftBreaks";
import LineDetailCard from "@/components/team-lead/LineDetailCard";
import FloorOverview from "@/components/team-lead/FloorOverview";
import FloorAlertStrip from "@/components/team-lead/FloorAlertStrip";

export default function TeamLeadPage() {
  const [shift, setShift] = useState<ShiftName>("day");
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [mesStates, setMesStates] = useState<LineState[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [comments, setComments] = useState<
    Record<string, Record<string, string>>
  >({});
  const [allScrapEntries, setAllScrapEntries] = useState<ScrapEntry[]>([]);
  const [allDowntimeEntries, setAllDowntimeEntries] = useState<DowntimeEntry[]>(
    [],
  );
  const [adminConfig, setAdminConfig] = useState<
    Record<string, AdminLineConfig>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState<"floor" | "detail">("floor");
  const prevDataRef = useRef<string>("");
  const fetchRequestId = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++fetchRequestId.current;
    const [
      metricsRes,
      mesRes,
      clockRes,
      allScrapRes,
      allDowntimeRes,
      configRes,
    ] = await Promise.all([
      fetch(`/api/metrics?shift=${shift}`, { cache: "no-store" }),
      fetch("/api/mes/state", { cache: "no-store" }),
      fetch("/api/sim/clock", { cache: "no-store" }),
      fetch(`/api/scrap?lineId=all&shift=${shift}`, { cache: "no-store" }),
      fetch(`/api/downtime?shift=${shift}`, { cache: "no-store" }),
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
    if (clockRes.ok) await clockRes.json();
    if (allScrapRes.ok) setAllScrapEntries(await allScrapRes.json());
    if (allDowntimeRes.ok) setAllDowntimeEntries(await allDowntimeRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
    setIsLoading(false);
  }, [shift]);

  useEffect(() => {
    const initialFetch = setTimeout(() => {
      void fetchData();
    }, 0);
    const interval = setInterval(fetchData, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!selectedLineId) return;
    fetch(`/api/line/comments?lineId=${selectedLineId}`)
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setComments((prev) => ({ ...prev, [selectedLineId]: data }));
      });
  }, [selectedLineId]);

  const saveComment = useCallback(
    async (hour: string, comment: string) => {
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
    },
    [selectedLineId],
  );

  const refreshScrap = useCallback(() => {
    fetch(`/api/scrap?lineId=all&shift=${shift}`)
      .then((r) => r.json())
      .then((data: ScrapEntry[]) => setAllScrapEntries(data));
  }, [shift]);

  const refreshDowntime = useCallback(() => {
    fetch(`/api/downtime?shift=${shift}`)
      .then((r) => r.json())
      .then((data: DowntimeEntry[]) => setAllDowntimeEntries(data));
  }, [shift]);

  const selectedScrapEntries = useMemo(() => {
    if (!selectedLineId) return [];
    return allScrapEntries.filter((entry) => entry.lineId === selectedLineId);
  }, [selectedLineId, allScrapEntries]);

  const selectedDowntimeEntries = useMemo(() => {
    if (!selectedLineId) return [];
    return allDowntimeEntries.filter(
      (entry) => entry.lineId === selectedLineId,
    );
  }, [selectedLineId, allDowntimeEntries]);

  const scrapStats = useMemo<ScrapStats>(() => {
    let kickedLids = 0,
      scrappedPanels = 0,
      totalBoughtIn = 0;
    for (const e of selectedScrapEntries) {
      if (e.kind === "kicked-lid") kickedLids++;
      else if (e.kind === "scrapped-panel") scrappedPanels++;
      if (e.boughtIn) totalBoughtIn++;
    }
    return { kickedLids, scrappedPanels, totalBoughtIn };
  }, [selectedScrapEntries]);

  useEffect(() => {
    const initialRefresh = setTimeout(() => {
      refreshScrap();
      refreshDowntime();
    }, 0);
    return () => clearTimeout(initialRefresh);
  }, [shift, refreshScrap, refreshDowntime]);

  const { lines, selectedLine, selectedMesState } = useMemo(() => {
    if (!metrics)
      return { lines: [], selectedLine: null, selectedMesState: null };
    const lines = metrics.lines;
    return {
      lines,
      selectedLine: selectedLineId
        ? (lines.find((l) => l.id === selectedLineId) ?? null)
        : null,
      selectedMesState: selectedLineId
        ? (mesStates.find((s) => s.lineId === selectedLineId) ?? null)
        : null,
    };
  }, [metrics, selectedLineId, mesStates]);

  const hourlyTargets = useMemo(
    () =>
      selectedLine
        ? getHourlyTargets(
            selectedLine.target,
            shift,
            selectedMesState?.hourlyOutput ?? {},
          )
        : [],
    [selectedLine, selectedMesState, shift],
  );

  const stateMap = useMemo(
    () => new Map(mesStates.map((s) => [s.lineId, s])),
    [mesStates],
  );

  const filteredLines = useMemo(() => {
    if (!filter) return lines;
    const q = filter.toLowerCase();
    return lines.filter(
      (l) =>
        l.name.toLowerCase().startsWith(q) ||
        l.valueStream.toLowerCase().startsWith(q) ||
        l.id.toLowerCase().startsWith(q),
    );
  }, [lines, filter]);

  function getLineStatus(lineId: string) {
    const state = stateMap.get(lineId);
    const line = lines.find((l) => l.id === lineId);
    const isRunning = adminConfig?.[lineId]?.isRunning !== false;

    if (!isRunning) {
      return {
        label: "NOT RUNNING",
        color: "text-[#94a3b8]",
        dot: "bg-[#64748b]",
      };
    }

    if (!state?.schedule)
      return {
        label: "IDLE",
        color: "text-[#e1e2ec]/40",
        dot: "bg-[#e1e2ec]/20",
      };
    if (line && line.output === 0)
      return {
        label: "STOPPED",
        color: "text-status-red",
        dot: "bg-status-red shadow-[0_0_8px_rgba(239,68,68,0.5)]",
      };
    if (line && line.output / line.target < 0.75)
      return {
        label: "BEHIND",
        color: "text-accent",
        dot: "bg-accent shadow-[0_0_8px_rgba(249,115,22,0.5)]",
      };
    return {
      label: "RUNNING",
      color: "text-status-green",
      dot: "bg-status-green shadow-[0_0_8px_rgba(34,197,94,0.5)]",
    };
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#f3f4f8]">
      {isLoading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/80">
          <div className="text-[#e1e2ec]/60 text-base">Loading...</div>
        </div>
      )}

      {/* ── Top Nav ── */}
      <nav className="shrink-0 z-50 bg-background border-b border-border/80 font-['Space_Grotesk',sans-serif] tracking-tight">
        <div className="flex justify-between items-center w-full px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-accent uppercase select-none">
              KINETIC COMMAND
            </span>
            <div className="hidden md:flex items-center space-x-6">
              <Link
                href="/eos"
                className="text-base text-[#e1e2ec]/75 hover:text-[#f8f8fb] transition-colors"
              >
                EOS
              </Link>
              <Link
                href="/admin"
                className="text-base text-[#e1e2ec]/75 hover:text-[#f8f8fb] transition-colors"
              >
                Admin
              </Link>
              <Link
                href="/team-lead"
                className="text-accent border-b-2 border-accent pb-0.5 font-bold text-base"
              >
                Team Lead
              </Link>
              <Link
                href="/sim"
                className="text-base text-[#e1e2ec]/75 hover:text-[#f8f8fb] transition-colors"
              >
                SIM
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm font-medium uppercase tracking-wider">
              <div className="flex gap-1">
                {(["day", "night"] as ShiftName[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`px-3.5 py-1.5 rounded-sm text-sm font-medium transition-colors cursor-pointer ${
                      shift === s
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "text-[#e1e2ec]/65 hover:text-[#f8f8fb] border border-transparent"
                    }`}
                  >
                    {s === "day" ? "Day" : "Night"}
                  </button>
                ))}
              </div>
              <span className="text-[#e1e2ec]/60 tabular-nums text-[11px]">
                {now.toLocaleTimeString("en-GB")} UTC
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar: Line Selector ── */}
        <aside className="w-72 shrink-0 bg-surface border-r border-border/80 flex flex-col">
          <div className="p-4 border-b border-border/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-xl text-accent font-['Space_Grotesk',sans-serif]">
                  OP-CENTER
                </h2>
              </div>
              <span className="material-symbols-outlined text-accent">
                factory
              </span>
            </div>
            <div className="relative">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-surface-highest border-none text-[11px] tracking-[0.18em] p-2.5 rounded-sm text-[#f3f4f8] outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-[#e1e2ec]/45"
                placeholder="FILTER LINES..."
                type="text"
              />
              <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[16px] text-[#e1e2ec]/45">
                search
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {filteredLines.map((line) => {
              const isRunning = adminConfig?.[line.id]?.isRunning !== false;
              const status = getLineStatus(line.id);
              const isSelected = selectedLineId === line.id;
              return (
                <button
                  key={line.id}
                  disabled={!isRunning}
                  onClick={() => {
                    if (!isRunning) return;
                    setSelectedLineId(line.id);
                    setViewMode("detail");
                  }}
                  className={`w-full flex items-center justify-between p-3.5 transition-all text-left border rounded-sm ${
                    !isRunning
                      ? "bg-surface-low/60 border-slate-500/35 opacity-50 grayscale cursor-not-allowed"
                      : isSelected
                        ? "bg-surface-highest border-accent shadow-[inset_3px_0_0_0_#f97316] cursor-pointer"
                        : "border-border/30 hover:bg-surface-high/70 hover:border-border/60 cursor-pointer"
                  }`}
                >
                  <div>
                    <span
                      className={`block text-xs font-bold ${
                        !isRunning
                          ? "text-[#94a3b8]"
                          : isSelected
                            ? "text-accent"
                            : "text-[#e1e2ec]/65"
                      }`}
                    >
                      {line.valueStream} — {line.name}
                    </span>
                    <span
                      className={`block text-sm ${!isRunning ? "text-[#94a3b8]/80" : "text-[#e1e2ec]/80"}`}
                    >
                      {line.output}/{line.target}
                    </span>
                    {!isRunning && (
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#94a3b8]/75">
                        Hidden in admin
                      </span>
                    )}
                    {isRunning && !isSelected && (
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#e1e2ec]/35">
                        Active floor line
                      </span>
                    )}
                    {isRunning && isSelected && (
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-accent/80">
                        Selected line
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${status.dot}`}
                    />
                    <span className={`text-[10px] font-mono ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
          {/* Tab toggle */}
          <div className="flex items-center gap-1 mb-6 p-1 bg-surface-low rounded-sm w-fit border border-border/50">
            <button
              onClick={() => setViewMode("floor")}
              className={`px-4 py-2 rounded-sm text-sm font-bold tracking-wider transition-colors ${
                viewMode === "floor"
                  ? "bg-accent text-background"
                  : "text-[#e1e2ec]/65 hover:text-[#f8f8fb]"
              }`}
            >
              FLOOR OVERVIEW
            </button>
            <button
              onClick={() => setViewMode("detail")}
              className={`px-4 py-2 rounded-sm text-sm font-bold tracking-wider transition-colors ${
                viewMode === "detail"
                  ? "bg-accent text-background"
                  : "text-[#e1e2ec]/65 hover:text-[#f8f8fb]"
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
              hourlyTargets={hourlyTargets}
              comments={selectedLineId ? (comments[selectedLineId] ?? {}) : {}}
              onSaveComment={saveComment}
              onBack={() => {
                setSelectedLineId(null);
                setViewMode("floor");
              }}
              scrapEntries={selectedScrapEntries}
              scrapStats={scrapStats}
              onRefreshScrap={refreshScrap}
              downtimeEntries={selectedDowntimeEntries}
              onRefreshDowntime={refreshDowntime}
            />
          ) : viewMode === "detail" ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[#e1e2ec]/10 text-7xl mb-4">
                factory
              </span>
              <h2 className="font-['Space_Grotesk',sans-serif] text-3xl font-bold text-[#e1e2ec]/35 mb-2">
                No Line Selected
              </h2>
              <p className="text-[#e1e2ec]/50 text-base max-w-sm mb-6">
                Choose an assembly line from the sidebar, or switch to Floor
                Overview to see all lines at a glance.
              </p>
              <button
                onClick={() => setViewMode("floor")}
                className="px-4 py-2 bg-accent/15 text-accent border border-accent/30 rounded-sm text-sm font-bold tracking-wider hover:bg-accent/25 transition-colors"
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
                adminConfig={adminConfig}
                onSelectLine={(lineId) => {
                  setSelectedLineId(lineId);
                  setViewMode("detail");
                }}
              />
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[#e1e2ec]/10 text-7xl mb-4">
                factory
              </span>
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
