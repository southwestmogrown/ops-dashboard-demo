"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { LineState } from "@/lib/mesTypes";

const SimControls = dynamic(() => import("@/components/sim/SimControls"),  { ssr: false });
const HourlyTable  = dynamic(() => import("@/components/sim/HourlyTable"),  { ssr: false });

// ── Config ────────────────────────────────────────────────────────────────────

const LINES: { lineId: string; label: string }[] = [
  { lineId: "vs1-l1", label: "VS1 · Line 1" },
  { lineId: "vs1-l2", label: "VS1 · Line 2" },
  { lineId: "vs1-l3", label: "VS1 · Line 3" },
  { lineId: "vs1-l4", label: "VS1 · Line 4" },
  { lineId: "vs2-l1", label: "VS2 · Line 1" },
  { lineId: "vs2-l2", label: "VS2 · Line 2" },
];

const LINE_LABELS: Record<string, string> = Object.fromEntries(
  LINES.map(({ lineId, label }) => [lineId, label])
);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SimPage() {
  const [states, setStates]         = useState<LineState[]>([]);
  const [running, setRunning]       = useState(false);
  const [speed, setSpeed]           = useState(5);
  const tickInterval                = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInterval                = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling ──────────────────────────────────────────────────────────────

  const pollState = useCallback(async () => {
    const res = await fetch("/api/mes/state");
    if (res.ok) setStates(await res.json());
  }, []);

  useEffect(() => {
    pollState();
    pollInterval.current = setInterval(pollState, 2000);
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [pollState]);

  // ── Simulation controls ───────────────────────────────────────────────────

  function startSim() {
    if (tickInterval.current) return;
    setRunning(true);
    tickInterval.current = setInterval(async () => {
      await fetch("/api/mes/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, units: speed }),
      });
    }, 1000);
  }

  function pauseSim() {
    if (tickInterval.current) {
      clearInterval(tickInterval.current);
      tickInterval.current = null;
    }
    setRunning(false);
  }

  async function resetSim() {
    pauseSim();
    await fetch("/api/mes/reset", { method: "POST" });
    await pollState();
  }

  // Restart interval when speed changes while running
  function handleSpeedChange(newSpeed: number) {
    setSpeed(newSpeed);
    if (running) {
      if (tickInterval.current) clearInterval(tickInterval.current);
      tickInterval.current = setInterval(async () => {
        await fetch("/api/mes/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, units: newSpeed }),
        });
      }, 1000);
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (tickInterval.current) clearInterval(tickInterval.current);
    };
  }, []);

  const totalOutput   = states.reduce((s, st) => s + st.totalOutput, 0);
  const totalTarget   = states.reduce((s, st) => s + (st.schedule?.totalTarget ?? 0), 0);
  const scheduledLines = states.filter((s) => s.schedule !== null).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-slate-200">

      {/* Header */}
      <header className="bg-surface border-b border-border px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-accent text-black font-black text-xs px-2.5 py-1 rounded tracking-widest">
            BAK
          </span>
          <span className="text-slate-500 text-sm">|</span>
          <span className="text-slate-400 text-sm tracking-widest uppercase">MES Simulator</span>
        </div>
        <div className="flex items-center gap-6">
          {totalTarget > 0 && (
            <span className="text-xs text-slate-400">
              <span className="text-accent font-semibold">{totalOutput}</span>
              <span className="text-slate-600"> / {totalTarget} units</span>
            </span>
          )}
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 tracking-widest uppercase transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="px-8 py-8 max-w-6xl mx-auto flex flex-col gap-6">

        {/* Sim controls */}
        <SimControls
          running={running}
          speed={speed}
          onStart={startSim}
          onPause={pauseSim}
          onReset={resetSim}
          onSpeedChange={handleSpeedChange}
        />

        {scheduledLines === 0 && (
          <div className="text-xs text-slate-600 text-center py-2">
            Load run sheets from the{" "}
            <Link href="/admin" className="text-slate-500 hover:text-slate-300 underline">
              Admin panel
            </Link>
            , then use the controls above to simulate production.
          </div>
        )}

        {/* Hour-by-hour table */}
        {scheduledLines > 0 && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="text-xs text-slate-500 tracking-widest uppercase font-semibold mb-4">
              Hour-by-Hour Output
            </div>
            <HourlyTable states={states} lineLabels={LINE_LABELS} />
          </div>
        )}
      </div>
    </div>
  );
}
