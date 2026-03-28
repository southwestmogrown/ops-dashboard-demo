"use client";

import { useState } from "react";
import { Line, ShiftName } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import HourlyTable from "./HourlyTable";
import ReworkPanel from "./ReworkPanel";
import ScrapForm from "./ScrapForm";
import type { HourlyTargetRow } from "@/lib/shiftBreaks";
import type { ScrapEntry, ScrapStats } from "@/lib/reworkTypes";
import { getFpyColor, getHpuColor, getOutputColor } from "@/lib/status";

interface LineDetailCardProps {
  line: Line;
  mesState: LineState | null;
  shift: ShiftName;
  shiftProgress: ShiftProgress;
  hourlyTargets: HourlyTargetRow[];
  comments: Record<string, string>;
  onSaveComment: (hour: string, comment: string) => void;
  onBack: () => void;
  scrapEntries: ScrapEntry[];
  scrapStats: ScrapStats;
  onRefreshScrap: () => void;
}

export default function LineDetailCard({
  line,
  mesState,
  shift,
  shiftProgress,
  hourlyTargets,
  comments,
  onSaveComment,
  onBack,
  scrapEntries,
  scrapStats,
  onRefreshScrap,
}: LineDetailCardProps) {
  const [showScrapForm, setShowScrapForm] = useState(false);

  const orderPct = mesState?.schedule
    ? Math.min(100, Math.round(
        (mesState.schedule.items.reduce((s, i) => s + i.completed, 0) / mesState.schedule.totalTarget) * 100
      ))
    : 0;

  const completed = mesState?.schedule
    ? mesState.schedule.items.reduce((s, i) => s + i.completed, 0)
    : 0;

  return (
    <div className="space-y-6">

      {/* Header & KPI Strip */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 flex flex-col justify-end">
          <button
            onClick={onBack}
            className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] transition-colors text-[10px] uppercase tracking-widest mb-2 bg-transparent border-none p-0 cursor-pointer text-left flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            All Lines
          </button>
          <h1 className="text-4xl font-black font-['Space_Grotesk',sans-serif] leading-none mb-1">
            {line.valueStream} — {line.name}
          </h1>
          <p className="text-sm font-medium text-accent tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>radio_button_checked</span>
            LIVE PRODUCTION TELEMETRY
          </p>
        </div>

        <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface p-4 border-t-2 border-status-green">
            <span className="block text-[10px] font-bold text-[#e1e2ec]/40 uppercase mb-1">Current Output</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-['Space_Grotesk',sans-serif] font-bold tabular-nums ${getOutputColor(line.output, line.target)}`}>
                {line.output.toLocaleString()}
              </span>
              <span className="text-xs text-[#e1e2ec]/40">/ {line.target.toLocaleString()}</span>
            </div>
          </div>
          <div className="bg-surface p-4 border-t-2 border-status-green">
            <span className="block text-[10px] font-bold text-[#e1e2ec]/40 uppercase mb-1">First Pass Yield</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-['Space_Grotesk',sans-serif] font-bold tabular-nums ${getFpyColor(line.fpy)}`}>
                {line.fpy.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="bg-surface p-4 border-t-2 border-accent">
            <span className="block text-[10px] font-bold text-[#e1e2ec]/40 uppercase mb-1">Hours Per Unit</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-['Space_Grotesk',sans-serif] font-bold tabular-nums ${getHpuColor(line.hpu)}`}>
                {line.hpu.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="bg-surface p-4 border-t-2 border-status-green">
            <span className="block text-[10px] font-bold text-[#e1e2ec]/40 uppercase mb-1">Headcount</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-['Space_Grotesk',sans-serif] font-bold tabular-nums">
                {line.headcount}
              </span>
              <span className="material-symbols-outlined text-[16px] text-[#e1e2ec]/40">group</span>
            </div>
          </div>
        </div>
      </section>

      {/* Order Progress & Hourly Performance */}
      <div className="grid grid-cols-12 gap-6">

        {/* Left Column: Progress & Rework */}
        <div className="col-span-12 xl:col-span-4 space-y-6">

          {/* Current Order Progress */}
          {mesState?.schedule && (
            <div className="bg-surface p-6 relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] font-bold text-accent block mb-1">CURRENT JOB</span>
                  <h3 className="text-xl font-bold font-['Space_Grotesk',sans-serif] uppercase">
                    {mesState.currentOrder ?? "All Complete"}
                  </h3>
                  <p className="text-xs text-[#e1e2ec]/40 mt-1">
                    {mesState.remainingOnOrder} remaining on order &middot; {mesState.remainingOnRunSheet} on sheet
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold font-['Space_Grotesk',sans-serif] tabular-nums">{orderPct}%</span>
                </div>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${orderPct}%`,
                    background: `linear-gradient(to right, #f97316, #1d9e75)`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-3 text-[10px] font-mono tracking-tighter">
                <span>PROD: {completed.toLocaleString()}</span>
                <span className="text-[#e1e2ec]/40">TARGET: {mesState.schedule.totalTarget.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Scrap & Quality Panel */}
          <div className="bg-surface-low border border-border/40">
            <div className="p-4 border-b border-border/40 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-status-red">dangerous</span>
                Scrap &amp; Quality
              </h3>
              <button
                onClick={() => setShowScrapForm(true)}
                className="bg-accent text-black px-3 py-1 text-[10px] font-bold rounded-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer border-none"
              >
                ADD ENTRY
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center bg-background/40 p-3">
                <div>
                  <span className="block text-xs font-bold">Scrapped Panels</span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-mono">No FPY impact</span>
                </div>
                <span className="text-xl font-['Space_Grotesk',sans-serif] font-bold text-status-red tabular-nums">
                  {String(scrapStats.scrappedPanels).padStart(2, "0")}
                </span>
              </div>
              <div className="flex justify-between items-center bg-background/40 p-3">
                <div>
                  <span className="block text-xs font-bold">Kicked Lids</span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-mono">Reduces FPY</span>
                </div>
                <span className="text-xl font-['Space_Grotesk',sans-serif] font-bold text-status-amber tabular-nums">
                  {String(scrapStats.kickedLids).padStart(2, "0")}
                </span>
              </div>

              {/* Rework log entries */}
              {scrapEntries.length > 0 && (
                <ReworkPanel
                  entries={scrapEntries}
                  kickedLids={scrapStats.kickedLids}
                  scrappedPanels={scrapStats.scrappedPanels}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Hourly Performance Table */}
        <div className="col-span-12 xl:col-span-8">
          <HourlyTable
            rows={hourlyTargets}
            comments={comments}
            onSaveComment={onSaveComment}
          />
        </div>
      </div>

      {showScrapForm && (
        <ScrapForm
          lineId={line.id}
          shift={shift}
          onClose={() => setShowScrapForm(false)}
          onCreated={() => {
            onRefreshScrap();
          }}
        />
      )}
    </div>
  );
}
