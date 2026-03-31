"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShiftMetrics, ShiftName } from "@/lib/types";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import type { DowntimeEntry } from "@/lib/downtimeTypes";
import { getShiftProgress } from "@/lib/shiftTime";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import KpiCard from "@/components/KpiCard";
import LineTable from "@/components/LineTable";
import { getOutputColor, getFpyColor, getHpuColor, getOeeColor } from "@/lib/status";

const OutputChart = dynamic(() => import("@/components/OutputChart"), {
  ssr: false,
  loading: () => (
    <div className="bg-surface rounded-sm p-6 h-[340px] animate-pulse" />
  ),
});

const LineDrawer = dynamic(() => import("@/components/LineDrawer"), {
  ssr: false,
});

// ── Sidebar nav items ─────────────────────────────────────────────────────────

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="bg-background border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="h-5 w-44 bg-border rounded animate-pulse" />
          <div className="h-8 w-48 bg-border rounded animate-pulse" />
          <div className="h-5 w-24 bg-border rounded animate-pulse" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 shrink-0 bg-surface-low border-r border-border hidden md:block" />
        <div className="flex-1 p-6 space-y-6">
          <div className="grid grid-cols-3 xl:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-surface rounded-sm p-5 h-28 animate-pulse" />
            ))}
          </div>
          <div className="bg-surface rounded-sm h-72 animate-pulse" />
          <div className="bg-surface rounded-sm h-64 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ── Error screen ──────────────────────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-status-red text-sm font-medium">Failed to load metrics</p>
      <p className="text-[#e1e2ec]/40 text-xs">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-sm text-sm border border-border text-[#e1e2ec]/50
                   hover:text-[#e1e2ec] hover:border-accent transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const pathname = usePathname();
  const { role } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [mesStates, setMesStates] = useState<LineState[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [shift, setShift] = useState<ShiftName>("day");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setSelectedLineId(null), []);

  useEffect(() => {
    if (role !== null && role === "team-lead") {
      router.push("/team-lead");
    }
  }, [role]);

  const [adminConfig, setAdminConfig] = useState<Record<string, AdminLineConfig>>({});
  const [simClock, setSimClock] = useState<Date | null>(null);
  const lastOutputRef = useRef<Record<string, number>>({});
  const fetchRequestId = useRef(0);
  const [openDowntimeByLine, setOpenDowntimeByLine] = useState<Record<string, boolean>>({});

  const {
    totalOutput,
    totalTarget,
    avgFpy,
    avgHpu,
    avgOee,
    avgAvailability,
    avgPerformance,
    totalHeadcount,
    activeLines,
  } = useMemo(() => {
    if (!metrics)
      return {
        totalOutput: 0,
        totalTarget: 0,
        avgFpy: 0,
        avgHpu: 0,
        avgOee: 0,
        avgAvailability: 0,
        avgPerformance: 0,
        totalHeadcount: 0,
        activeLines: [],
      };
    const allLines = metrics.lines;
    const active = allLines.filter(
      (l) => adminConfig[l.id]?.isRunning !== false
    );
    return {
      totalOutput: active.reduce((sum, l) => sum + l.output, 0),
      totalTarget: active.reduce((sum, l) => sum + l.target, 0),
      avgFpy:         active.reduce((sum, l) => sum + l.fpy,         0) / (active.length || 1),
      avgHpu:         active.reduce((sum, l) => sum + l.hpu,         0) / (active.length || 1),
      avgOee:         active.reduce((sum, l) => sum + l.oee,         0) / (active.length || 1),
      avgAvailability: active.reduce((sum, l) => sum + l.availability, 0) / (active.length || 1),
      avgPerformance:  active.reduce((sum, l) => sum + l.performance, 0) / (active.length || 1),
      totalHeadcount: active.reduce((sum, l) => sum + l.headcount, 0),
      activeLines: active,
    };
  }, [metrics, adminConfig]);

  const lineStateMap = useMemo(
    () => new Map(mesStates.map((s) => [s.lineId, s])),
    [mesStates]
  );

  const fetchMetrics = async () => {
    const requestId = ++fetchRequestId.current;
    try {
      const [metricsRes, mesRes, configRes, clockRes, downtimeRes] = await Promise.all([
        fetch(`/api/metrics?shift=${shift}`, { cache: "no-store" }),
        fetch("/api/mes/state", { cache: "no-store" }),
        fetch("/api/admin/config", { cache: "no-store" }),
        fetch("/api/sim/clock", { cache: "no-store" }),
        fetch(`/api/downtime?shift=${shift}`, { cache: "no-store" }),
      ]);
      if (requestId !== fetchRequestId.current) return;
      if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
      const data: ShiftMetrics = await metricsRes.json();
      setMetrics(data);
      if (mesRes.ok) {
        const states: LineState[] = await mesRes.json();
        setMesStates(states);
        for (const s of states) {
          lastOutputRef.current[s.lineId] = s.totalOutput;
        }
      }
      if (configRes.ok) setAdminConfig(await configRes.json());
      if (clockRes.ok) {
        const { clock } = await clockRes.json();
        setSimClock(clock ? new Date(clock) : null);
      }
      if (downtimeRes.ok) {
        const allEntries: DowntimeEntry[] = await downtimeRes.json();
        const openMap: Record<string, boolean> = {};
        for (const e of allEntries) {
          if (e.endTime === null) openMap[e.lineId] = true;
        }
        setOpenDowntimeByLine(openMap);
      }
      setLastUpdated(new Date());
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMetrics(null);
    setIsLoading(true);
    setFetchError(null);
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [shift]);

  if (isLoading && !metrics) return <DashboardSkeleton />;
  if (fetchError && !metrics) {
    return <ErrorScreen message={fetchError} onRetry={fetchMetrics} />;
  }

  const lines = metrics!.lines;
  const selectedLine = selectedLineId
    ? (lines.find((l) => l.id === selectedLineId) ?? null)
    : null;

  const shiftProgress = getShiftProgress(shift, simClock ?? new Date());

  const hasSchedule = mesStates.some((s) => s.schedule !== null);
  const mesTotal = mesStates.reduce((sum, s) => sum + s.totalOutput, 0);
  const pacedOutput =
    shiftProgress.elapsedHours >= 0.25
      ? Math.round(
          ((hasSchedule ? mesTotal : totalOutput) / shiftProgress.elapsedHours) *
            shiftProgress.totalHours
        )
      : null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header
        shift={shift}
        onShiftChange={setShift}
        lastUpdated={lastUpdated}
        lines={activeLines}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 bg-surface-low border-r border-border flex-col overflow-y-auto custom-scrollbar hidden md:flex">
          {/* OP-CENTER heading */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
              <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
                OP-CENTER
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4">
            <div className="space-y-1">
              {/* Dashboard */}
              <Link
                href="/"
                className={`flex items-center space-x-3 px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest transition-colors ${
                  pathname === "/"
                    ? "bg-surface-high text-accent border-l-4 border-accent"
                    : "text-[#e1e2ec]/40 hover:bg-surface-high/50 hover:text-[#e1e2ec] border-l-4 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">dashboard</span>
                <span>Dashboard</span>
              </Link>

              {/* Admin */}
              <Link
                href="/admin"
                className={`flex items-center space-x-3 px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest transition-colors ${
                  pathname === "/admin"
                    ? "bg-surface-high text-accent border-l-4 border-accent"
                    : "text-[#e1e2ec]/40 hover:bg-surface-high/50 hover:text-[#e1e2ec] border-l-4 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">factory</span>
                <span>Admin</span>
              </Link>

            </div>
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
          {/* Background poll error banner */}
          {fetchError && metrics && (
            <div className="mb-6 bg-status-red/10 border border-status-red/30 rounded-sm px-4 py-2.5 text-sm text-status-red">
              Refresh failed — showing last known data · {fetchError}
            </div>
          )}

          {/* KPI cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
            <KpiCard
              label="Aggregate Output vs Target"
              value={totalOutput.toLocaleString()}
              unit={`/ ${totalTarget.toLocaleString()}`}
              subtext={
                totalTarget > 0
                  ? `${((totalOutput / totalTarget) * 100).toFixed(1)}% of target`
                  : undefined
              }
              valueColor={getOutputColor(totalOutput, totalTarget)}
              accentClass="bg-accent"
            />
            <KpiCard
              label="Aggregate FPY"
              value={avgFpy.toFixed(1)}
              unit="%"
              valueColor={getFpyColor(avgFpy)}
              accentClass="bg-vs2"
            />
            <KpiCard
              label="Aggregate HPU"
              value={avgHpu.toFixed(2)}
              unit="Hrs/Unit"
              valueColor={getHpuColor(avgHpu)}
              accentClass="bg-status-red"
              tooltip={
                <div>
                  <p className="font-bold text-[#e1e2ec] mb-1.5 uppercase tracking-widest text-[9px]">
                    Hours Per Unit
                  </p>
                  <p className="mb-2 text-[#e1e2ec]/60">
                    How many operator-hours per finished unit. Lower is better.
                  </p>
                  <div className="bg-surface-low rounded-sm px-2 py-1.5 font-mono text-[9px] text-[#e1e2ec]/80 leading-relaxed">
                    <div>HPU = (HC × hrs) / output</div>
                    <div className="mt-1 text-[#e1e2ec]/40">
                      = ({totalHeadcount} × {shiftProgress.elapsedHours.toFixed(1)}) / {totalOutput}
                    </div>
                    {totalOutput > 0 && (
                      <div className="mt-1 text-accent">
                        = {(totalHeadcount * shiftProgress.elapsedHours / totalOutput).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              }
            />
            <KpiCard
              label="Total Headcount"
              value={totalHeadcount}
              unit="operators"
              accentClass="bg-border"
            />
            <KpiCard
              label="Avg OEE"
              value={avgOee.toFixed(1)}
              unit="%"
              subtext={
                avgOee >= 85
                  ? "World-class"
                  : avgOee >= 70
                  ? "Typical plant avg"
                  : "Below target"
              }
              valueColor={getOeeColor(avgOee)}
              accentClass="bg-vs2"
              tooltip={
                <div>
                  <p className="font-bold text-[#e1e2ec] mb-1.5 uppercase tracking-widest text-[9px]">
                    Overall Equipment Effectiveness
                  </p>
                  <p className="mb-2 text-[#e1e2ec]/60">
                    Availability × Performance × Quality. Target: 85%+ (world-class).
                  </p>
                  <div className="bg-surface-low rounded-sm px-2 py-1.5 font-mono text-[9px] text-[#e1e2ec]/80 leading-relaxed">
                    <div className="text-[#e1e2ec]/40 mb-0.5">Formula</div>
                    <div>OEE = A × P × Q</div>
                    <div className="mt-1.5 text-[#e1e2ec]/40 mb-0.5">Live values</div>
                    <div>
                      = {avgAvailability.toFixed(1)}% × {avgPerformance.toFixed(1)}% × {avgFpy.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-accent">
                      = {avgOee.toFixed(1)}%
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[9px] text-[#e1e2ec]/50 leading-relaxed">
                    <div><span className="text-[#e1e2ec]/70 font-medium">A</span> — uptime vs planned shift</div>
                    <div><span className="text-[#e1e2ec]/70 font-medium">P</span> — actual vs standard UPH</div>
                    <div><span className="text-[#e1e2ec]/70 font-medium">Q</span> — first-pass yield</div>
                  </div>
                </div>
              }
            />
          </section>

          {/* Output chart */}
          <section className="mb-6">
            <OutputChart lines={activeLines} trend={metrics?.trend} totalTarget={totalTarget} />
          </section>

          {/* Line table */}
          <section>
            <LineTable
              lines={activeLines}
              mesStateMap={lineStateMap}
              shiftProgress={shiftProgress}
              onSelectLine={setSelectedLineId}
              selectedLineId={selectedLineId}
              adminConfig={adminConfig}
              lastOutputRef={lastOutputRef}
              openDowntimeByLine={openDowntimeByLine}
            />
          </section>
        </main>
      </div>

      <LineDrawer
        line={selectedLine}
        mesState={selectedLine ? (lineStateMap.get(selectedLine.id) ?? null) : null}
        shiftProgress={shiftProgress}
        onClose={closeDrawer}
        nowOverride={simClock}
        adminConfig={adminConfig}
        shift={shift}
      />
    </div>
  );
}
