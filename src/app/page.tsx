"use client";

import "./globals.css";

import { ShiftName } from "@/lib/types";
import Header from "@/components/Header";
import KpiCard from "@/components/KpiCard";
import LineTable from "@/components/LineTable";
import { useState } from "react";

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

  return (
    <main className="p-8">
      <Header shift={shift} onShiftChange={setShift} lastUpdated={new Date()} />
      <div className="p-8 grid grid-cols-4 gap-4">
        <KpiCard
          label="Total Output"
          value={847}
          unit="units"
          subtext="Target: 1200"
          valueColor="text-status-amber"
        />
        <KpiCard
          label="Avg FPY"
          value="94.7"
          unit="%"
          valueColor="text-status-green"
        />
        <KpiCard
          label="Avg HPU"
          value="0.38"
          unit="hrs"
          valueColor="text-status-amber"
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
    </main>
  );
}
