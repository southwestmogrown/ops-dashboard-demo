"use client";

import "./globals.css";

import { Line, ShiftName } from "@/lib/types";
import Header from "@/components/Header";
import KpiCard from "@/components/KpiCard";
import LineTable from "@/components/LineTable";
import { useState } from "react";
import dynamic from "next/dynamic";

const TrendChart = dynamic(() => import("@/components/TrendChart"), {
  ssr: false,
  loading: () => (
    <div className="bg-surface border border-border rounded-lg p-5 h-[364px]" />
  ),
});

// Add to your test data in page.tsx
const trendData = [
  { time: "06:00", vs1Output: 0, vs2Output: 0 },
  { time: "06:30", vs1Output: 45, vs2Output: 28 },
  { time: "07:00", vs1Output: 92, vs2Output: 58 },
  { time: "07:30", vs1Output: 134, vs2Output: 84 },
  { time: "08:00", vs1Output: 180, vs2Output: 112 },
  { time: "08:30", vs1Output: 224, vs2Output: 138 },
  { time: "09:00", vs1Output: 271, vs2Output: 165 },
  { time: "09:30", vs1Output: 315, vs2Output: 190 },
];

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

function getOutputColor(output: number, target: number): string {
  const pct = output / target;
  if (pct >= 0.9) return "text-status-green";
  if (pct >= 0.75) return "text-status-amber";
  return "text-status-red";
}

export default function Home() {
  const [shift, setShift] = useState<ShiftName>("day");

  const totalOutput = 847;   // replace with real data in Issue #9
  const totalTarget = 1200;
  const avgFpy = 94.7;
  const avgHpu = 0.38;

  return (
    <main className="p-8">
      <Header shift={shift} onShiftChange={setShift} lastUpdated={new Date()} />
      <div className="p-8 grid grid-cols-4 gap-4">
        <KpiCard
          label="Total Output"
          value={totalOutput}
          unit="units"
          subtext={`Target: ${totalTarget}`}
          valueColor={getOutputColor(totalOutput, totalTarget)}
        />
        <KpiCard
          label="Avg FPY"
          value={avgFpy}
          unit="%"
          valueColor={getFpyColor(avgFpy)}
        />
        <KpiCard
          label="Avg HPU"
          value={avgHpu}
          unit="hrs"
          valueColor={getHpuColor(avgHpu)}
        />
        <KpiCard label="Headcount" value={42} unit="operators" />
      </div>
      <LineTable
        lines={[
          { id: "vs1-l1", name: "Folding Line 1", valueStream: "VS1", output: 274, target: 275, fpy: 95.2, hpu: 0.34, headcount: 20, changeovers: 2 },
          { id: "vs1-l2", name: "Folding Line 2", valueStream: "VS1", output: 300, target: 225, fpy: 92.5, hpu: 0.42, headcount: 22, changeovers: 3 },
          { id: "vs1-l3", name: "Folding Line 3", valueStream: "VS1", output: 200, target: 250, fpy: 88.7, hpu: 0.50, headcount: 18, changeovers: 4 },
          { id: "vs2-l1", name: "Rolling Line 1", valueStream: "VS2", output: 90, target: 100, fpy: 90.1, hpu: 0.40, headcount: 16, changeovers: 2 },
          { id: "vs2-l2", name: "Rolling Line 2", valueStream: "VS2", output: 225, target: 225, fpy: 96.5, hpu: 0.30, headcount: 25, changeovers: 1 },
        ]}
        onSelectLine={(lineId) => console.log(lineId)}
        selectedLineId={null}
      />
      <TrendChart data={trendData} />
    </main>
  );
}
