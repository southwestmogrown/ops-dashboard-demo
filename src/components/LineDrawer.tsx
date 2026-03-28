"use client";

import { useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Line as LineData } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";
import { getFpyColor, getHpuColor, getPaceColor } from "@/lib/status";

interface LineDrawerProps {
  line: LineData | null;
  mesState: LineState | null;
  shiftProgress: ShiftProgress;
  onClose: () => void;
  /** Override clock time (from sim clock); falls back to real time */
  nowOverride?: Date | null;
}

function buildMesHourlyData(hourlyOutput: Record<string, number>) {
  return Object.entries(hourlyOutput)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, output]) => ({ time, output }));
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#131720",
    border: "1px solid #1e2433",
    borderRadius: "4px",
    fontSize: "12px",
  },
  labelStyle: { color: "#e1e2ec", opacity: 0.5 },
  itemStyle: { color: "#e1e2ec" },
};

export default function LineDrawer({
  line,
  mesState,
  shiftProgress,
  onClose,
  nowOverride,
}: LineDrawerProps) {
  const isOpen = line !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Only show charts when MES has actual data — no mock fallbacks
  const hasMesData = mesState && mesState.schedule !== null;
  const hasMesHourly =
    mesState && Object.keys(mesState.hourlyOutput).length > 0;
  const hourlyBarData = useMemo(
    () => hasMesHourly ? buildMesHourlyData(mesState!.hourlyOutput) : [],
    [hasMesHourly, mesState?.hourlyOutput]
  );

  const linePace =
    shiftProgress.elapsedHours >= 0.25
      ? Math.round(
          ((mesState?.schedule ? mesState.totalOutput : (line?.output ?? 0)) /
            shiftProgress.elapsedHours) *
            shiftProgress.totalHours
        )
      : null;

  const etaInfo = (() => {
    if (
      !mesState ||
      mesState.remainingOnOrder <= 0 ||
      shiftProgress.elapsedHours < 0.25
    )
      return null;
    const output = mesState.schedule ? mesState.totalOutput : (line?.output ?? 0);
    if (output === 0) return null;
    const uph = output / shiftProgress.elapsedHours;
    if (uph === 0) return null;
    const minutesLeft = Math.ceil((mesState.remainingOnOrder / uph) * 60);
    const now = nowOverride ?? new Date();
    const etaTime = new Date(now.getTime() + minutesLeft * 60_000);
    return { etaTime, minutesLeft };
  })();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out glass panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-[480px] glass-panel overflow-hidden z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={line ? `${line.valueStream} ${line.name} details` : "Line details"}
      >
        {line && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <p className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold">
                  {line.valueStream}
                </p>
                <h2 className="text-xl font-bold font-['Space_Grotesk',sans-serif] uppercase text-accent">
                  {line.valueStream} · {line.name}
                </h2>
                <p className="text-[10px] font-bold text-vs2 uppercase tracking-widest mt-0.5">
                  Operational
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] transition-colors p-1 rounded-sm"
                aria-label="Close drawer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Metric summary strip */}
            <div className="grid grid-cols-5 gap-3 p-5 border-b border-border shrink-0">
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  Output
                </p>
                <p className="text-xl font-semibold font-['Space_Grotesk',sans-serif]">
                  {line.output}
                </p>
                <p className="text-xs text-[#e1e2ec]/40">/ {line.target}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  FPY
                </p>
                <p className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getFpyColor(line.fpy)}`}>
                  {line.fpy.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  HPU
                </p>
                <p className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getHpuColor(line.hpu)}`}>
                  {line.hpu.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  C/O
                </p>
                <p className="text-xl font-semibold font-['Space_Grotesk',sans-serif]">
                  {line.changeovers}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  Pace
                </p>
                {linePace !== null ? (
                  <>
                    <p className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getPaceColor(linePace, line.target)}`}>
                      {linePace}
                    </p>
                    <p className="text-xs text-[#e1e2ec]/40">proj.</p>
                  </>
                ) : (
                  <p className="text-xl font-semibold text-[#e1e2ec]/20">—</p>
                )}
              </div>
            </div>

            {/* Active order strip — only when MES schedule is loaded */}
            {mesState?.schedule && (
              <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-background border-b border-border shrink-0">
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Active Order
                  </p>
                  <p className="text-sm font-mono text-[#e1e2ec] truncate">
                    {mesState.currentOrder ?? (
                      <span className="text-status-green">All complete</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Rem. on Order
                  </p>
                  <p className="text-sm text-[#e1e2ec]">
                    {mesState.remainingOnOrder}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    ETA
                  </p>
                  {etaInfo ? (
                    <p className="text-sm text-[#e1e2ec] font-semibold">
                      {etaInfo.etaTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-[#e1e2ec]/20">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Rem. on Sheet
                  </p>
                  <p className="text-sm text-[#e1e2ec]">
                    {mesState.remainingOnRunSheet}
                  </p>
                </div>
              </div>
            )}

            {/* Charts — only shown when MES has loaded a schedule */}
            {hasMesData ? (
              <div className="flex flex-col gap-6 p-5 overflow-y-auto custom-scrollbar">
                {/* Hourly output */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                    Hourly Output
                    {hasMesHourly ? (
                      <span className="ml-2 text-accent/70 normal-case font-normal">
                        · live MES
                      </span>
                    ) : (
                      <span className="ml-2 text-[#e1e2ec]/20 normal-case font-normal">
                        · waiting for output...
                      </span>
                    )}
                  </p>
                  {hourlyBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={hourlyBarData}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1e2433"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 10 }}
                          axisLine={{ stroke: "#1e2433" }}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.03)" }}
                          {...tooltipStyle}
                        />
                        <Bar
                          dataKey="output"
                          name="Output"
                          fill="#f97316"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-[#e1e2ec]/20 text-xs italic">
                      No hourly output recorded yet
                    </div>
                  )}
                </div>

                {/* FPY trend */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                    FPY Trend
                    <span className="ml-2 text-vs2/60 normal-case font-normal">
                      · from scan log
                    </span>
                  </p>
                  <div className="h-8 flex items-center justify-center text-[#e1e2ec]/20 text-xs italic">
                    Trend tracking — coming soon
                  </div>
                </div>

                {/* HPU trend */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                    HPU Trend
                    <span className="ml-2 text-vs2/60 normal-case font-normal">
                      · from scan log
                    </span>
                  </p>
                  <div className="h-8 flex items-center justify-center text-[#e1e2ec]/20 text-xs italic">
                    Trend tracking — coming soon
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-8 items-center justify-center text-center">
                <span className="material-symbols-outlined text-[#e1e2ec]/10 text-5xl">radio_button_unchecked</span>
                <p className="text-sm text-[#e1e2ec]/30 max-w-xs">
                  No MES schedule loaded. Start the simulator to see live production data.
                </p>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
