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

// ── Test data (replaced by real API data in Issue #9) ────────────────────────

// const testLines = [
//   { id: "vs1-l1", name: "Line 1", valueStream: "VS1", output: 274, target: 275, fpy: 95.2, hpu: 0.34, headcount: 20, changeovers: 2 },
//   { id: "vs1-l2", name: "Line 2", valueStream: "VS1", output: 300, target: 225, fpy: 92.5, hpu: 0.42, headcount: 22, changeovers: 3 },
//   { id: "vs1-l3", name: "Line 3", valueStream: "VS1", output: 200, target: 250, fpy: 88.7, hpu: 0.50, headcount: 18, changeovers: 4 },
//   { id: "vs2-l1", name: "Line 1", valueStream: "VS2", output: 90,  target: 100, fpy: 90.1, hpu: 0.40, headcount: 16, changeovers: 2 },
//   { id: "vs2-l2", name: "Line 2", valueStream: "VS2", output: 225, target: 225, fpy: 96.5, hpu: 0.30, headcount: 25, changeovers: 1 },
// ];

// // ── Derived summary values ───────────────────────────────────────────────────

// const totalOutput   = testLines.reduce((sum, l) => sum + l.output, 0);
// const totalTarget   = testLines.reduce((sum, l) => sum + l.target, 0);
// const avgFpy        = testLines.reduce((sum, l) => sum + l.fpy, 0) / testLines.length;
// const avgHpu        = testLines.reduce((sum, l) => sum + l.hpu, 0) / testLines.length;
// const totalHeadcount = testLines.reduce((sum, l) => sum + l.headcount, 0);

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shift, setShift] = useState<ShiftName>("day");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setSelectedLineId(null), []);

  const fetchMetrics = async () => {
    const res = await fetch(`/api/metrics?shift=${shift}`);
    const data: ShiftMetrics = await res.json();
    setMetrics(data);
    setLastUpdated(new Date());
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [shift]);

  if (isLoading && !metrics) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </main>
    );
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

  return (
    <main className="min-h-screen bg-background">

      <Header
        shift={shift}
        onShiftChange={setShift}
        lastUpdated={lastUpdated}
        lines={lines}
      />

      {/* KPI cards */}
      <div className="p-6 grid grid-cols-4 gap-4">
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
      <div className="px-6 pb-6 grid grid-cols-3 gap-4">
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