"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ShiftMetrics, ShiftName } from "@/lib/types";
import Header from "@/components/Header";
import KpiCard from "@/components/KpiCard";
import LineTable from "@/components/LineTable";

const OutputChart = dynamic(() => import("@/components/OutputChart"), {
  ssr: false,
  loading: () => (
    <div className="bg-surface border border-border rounded-lg p-5 h-[364px]" />
  ),
});

const LineDrawer = dynamic(() => import("@/components/LineDrawer"), {
  ssr: false,
});

// ── Color helpers ────────────────────────────────────────────────────────────

function getOutputColor(output: number, target: number): string {
  const pct = output / target;
  if (pct >= 0.9) return "text-status-green";
  if (pct >= 0.75) return "text-status-amber";
  return "text-status-red";
}

function getFpyColor(fpy: number): string {
  if (fpy >= 95) return "text-status-green";
  if (fpy >= 90) return "text-status-amber";
  return "text-status-red";
}

function getHpuColor(hpu: number): string {
  if (hpu <= 0.35) return "text-status-green";
  if (hpu <= 0.45) return "text-status-amber";
  return "text-status-red";
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-surface border-b border-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-border rounded animate-pulse" />
          <div className="h-8 w-40 bg-border rounded animate-pulse" />
          <div className="h-5 w-24 bg-border rounded animate-pulse" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="p-6 grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-3"
          >
            <div className="h-3 w-20 bg-border rounded animate-pulse" />
            <div className="h-8 w-24 bg-border rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table + chart */}
      <div className="px-6 pb-6 grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-surface border border-border rounded-lg p-5">
          <div className="flex flex-col gap-3">
            <div className="h-3 w-16 bg-border rounded animate-pulse mb-2" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 bg-border/50 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-5 h-[364px] animate-pulse" />
      </div>
    </main>
  );
}

// ── Error screen (initial load failure) ──────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-status-red text-sm font-medium">Failed to load metrics</p>
      <p className="text-slate-500 text-xs">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded text-sm border border-border text-slate-400
                   hover:text-white hover:border-accent transition-colors"
      >
        Retry
      </button>
    </main>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [shift, setShift] = useState<ShiftName>("day");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setSelectedLineId(null), []);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/metrics?shift=${shift}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ShiftMetrics = await res.json();
      setMetrics(data);
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
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [shift]);

  // Initial load — show skeleton instead of empty flash
  if (isLoading && !metrics) return <DashboardSkeleton />;

  // Initial fetch failed — show error screen with retry
  if (fetchError && !metrics) {
    return <ErrorScreen message={fetchError} onRetry={fetchMetrics} />;
  }

  const lines = metrics!.lines;
  const selectedLine = selectedLineId
    ? (lines.find((l) => l.id === selectedLineId) ?? null)
    : null;

  const totalOutput    = lines.reduce((sum, l) => sum + l.output, 0);
  const totalTarget    = lines.reduce((sum, l) => sum + l.target, 0);
  const avgFpy         = lines.reduce((sum, l) => sum + l.fpy, 0) / lines.length;
  const avgHpu         = lines.reduce((sum, l) => sum + l.hpu, 0) / lines.length;
  const totalHeadcount = lines.reduce((sum, l) => sum + l.headcount, 0);

  // True only during background polls — dims metrics to signal a refresh is in flight
  const isRefreshing = isLoading && !!metrics;

  return (
    <main className="min-h-screen bg-background">

      <Header
        shift={shift}
        onShiftChange={setShift}
        lastUpdated={lastUpdated}
        lines={lines}
      />

      {/* Background poll error banner — keeps existing data visible */}
      {fetchError && metrics && (
        <div className="px-6 pt-4">
          <div className="bg-status-red/10 border border-status-red/30 rounded-lg px-4 py-2.5 text-sm text-status-red">
            Refresh failed — showing last known data · {fetchError}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div
        className={`p-6 grid grid-cols-4 gap-4 transition-opacity duration-300 ${
          isRefreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        <KpiCard
          label="Total Output"
          value={totalOutput}
          unit="units"
          subtext={`Target: ${totalTarget}`}
          valueColor={getOutputColor(totalOutput, totalTarget)}
        />
        <KpiCard
          label="Avg FPY"
          value={avgFpy.toFixed(1)}
          unit="%"
          valueColor={getFpyColor(avgFpy)}
        />
        <KpiCard
          label="Avg HPU"
          value={avgHpu.toFixed(2)}
          unit="hrs"
          valueColor={getHpuColor(avgHpu)}
        />
        <KpiCard
          label="Headcount"
          value={totalHeadcount}
          unit="operators"
        />
      </div>

      {/* Main content */}
      <div
        className={`px-6 pb-6 grid grid-cols-3 gap-4 transition-opacity duration-300 ${
          isRefreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        <div className="col-span-2">
          <LineTable
            lines={lines}
            onSelectLine={setSelectedLineId}
            selectedLineId={selectedLineId}
          />
        </div>
        <OutputChart lines={lines} />
      </div>

      <LineDrawer
        line={selectedLine}
        trend={metrics!.trend}
        onClose={closeDrawer}
      />

    </main>
  );
}
