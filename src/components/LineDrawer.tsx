"use client";

import { useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line as RechartsLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Line as LineData, TimePoint } from "@/lib/types";
import type { LineState } from "@/lib/mesTypes";
import type { ShiftProgress } from "@/lib/shiftTime";

interface LineDrawerProps {
  line: LineData | null;
  trend: TimePoint[];
  mesState: LineState | null;
  shiftProgress: ShiftProgress;
  onClose: () => void;
}

// Mulberry32 seeded RNG — matches generateMetrics.ts so per-line data is stable
function createRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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

function getPaceColor(projected: number, target: number): string {
  const r = projected / target;
  if (r >= 0.9) return "text-status-green";
  if (r >= 0.75) return "text-status-amber";
  return "text-status-red";
}

type ChartPoint = {
  time: string;
  output: number;
  fpy: number;
  hpu: number;
  isChangeover?: boolean;
};

// Derives per-line time-series from the VS-aggregate trend.
// FPY and HPU oscillate around the line's current value for visual interest.
function buildChartData(line: LineData, trend: TimePoint[]): ChartPoint[] {
  const rng = createRng(hashSeed(line.id));
  const linesInVs = line.valueStream === "VS1" ? 3 : 2;

  // Spread changeovers evenly across the timeline
  const coIndices = new Set<number>();
  if (line.changeovers > 0) {
    const step = Math.floor(trend.length / (line.changeovers + 1));
    for (let i = 0; i < line.changeovers; i++) {
      const jitter = Math.floor(rng() * 3) - 1;
      const idx = step * (i + 1) + jitter;
      coIndices.add(Math.max(0, Math.min(trend.length - 1, idx)));
    }
  }

  let prevVsOutput = 0;
  return trend.map((point, i) => {
    const vsOutput =
      line.valueStream === "VS1" ? point.vs1Output : point.vs2Output;
    const intervalDelta = vsOutput - prevVsOutput;
    prevVsOutput = vsOutput;

    // Scale down to per-line with ±15% random variation
    const variation = 0.85 + rng() * 0.3;
    const output = Math.max(0, Math.round((intervalDelta / linesInVs) * variation));

    // FPY: ±2 percentage points around line's current value
    const fpyDelta = (rng() - 0.5) * 4;
    const fpy = parseFloat(
      Math.max(80, Math.min(100, line.fpy + fpyDelta)).toFixed(1)
    );

    // HPU: ±0.05 around line's current value
    const hpuDelta = (rng() - 0.5) * 0.1;
    const hpu = parseFloat(
      Math.max(0.2, Math.min(0.7, line.hpu + hpuDelta)).toFixed(2)
    );

    return { time: point.time, output, fpy, hpu, isChangeover: coIndices.has(i) };
  });
}

/** Convert MES hourlyOutput bucket map to sorted chart data. */
function buildMesHourlyData(hourlyOutput: Record<string, number>) {
  return Object.entries(hourlyOutput)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, output]) => ({ time, output }));
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#161c2a",
    border: "1px solid #253044",
    borderRadius: "6px",
    fontSize: "12px",
  },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#edf2f8" },
};

export default function LineDrawer({
  line,
  trend,
  mesState,
  shiftProgress,
  onClose,
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

  const chartData = line && trend.length > 0 ? buildChartData(line, trend) : [];
  const changeoverTimes = chartData.filter((d) => d.isChangeover).map((d) => d.time);

  // Use real MES hourly output when available; fall back to synthetic
  const hasMesHourly =
    mesState && Object.keys(mesState.hourlyOutput).length > 0;
  const hourlyBarData = hasMesHourly
    ? buildMesHourlyData(mesState!.hourlyOutput)
    : chartData.map(({ time, output }) => ({ time, output }));

  // Pace for this line (only when schedule loaded and elapsed > 15 min)
  const linePace =
    mesState?.schedule && shiftProgress.elapsedHours >= 0.25
      ? Math.round(
          (mesState.totalOutput / shiftProgress.elapsedHours) * shiftProgress.totalHours
        )
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-[480px] bg-surface border-l border-border z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
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
                <p className="text-xs text-slate-400 uppercase tracking-wider">
                  {line.valueStream}
                </p>
                <h2 className="text-lg font-semibold text-white">{line.name}</h2>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded"
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

            {/* Metric summary row */}
            <div className="grid grid-cols-5 gap-3 p-5 border-b border-border shrink-0">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  Output
                </p>
                <p className="text-xl font-semibold">{line.output}</p>
                <p className="text-xs text-slate-400">/ {line.target}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  FPY
                </p>
                <p className={`text-xl font-semibold ${getFpyColor(line.fpy)}`}>
                  {line.fpy.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  HPU
                </p>
                <p className={`text-xl font-semibold ${getHpuColor(line.hpu)}`}>
                  {line.hpu.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  C/O
                </p>
                <p className="text-xl font-semibold">{line.changeovers}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  Pace
                </p>
                {linePace !== null ? (
                  <>
                    <p className={`text-xl font-semibold ${getPaceColor(linePace, line.target)}`}>
                      {linePace}
                    </p>
                    <p className="text-xs text-slate-400">proj.</p>
                  </>
                ) : (
                  <p className="text-xl font-semibold text-slate-600">—</p>
                )}
              </div>
            </div>

            {/* Active order strip — only when MES schedule is loaded */}
            {mesState?.schedule && (
              <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-background border-b border-border shrink-0">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">
                    Active Order
                  </p>
                  <p className="text-sm font-mono text-white truncate">
                    {mesState.currentOrder ?? (
                      <span className="text-status-green">All complete</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">
                    Rem. on Order
                  </p>
                  <p className="text-sm text-white">{mesState.remainingOnOrder}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">
                    Rem. on Sheet
                  </p>
                  <p className="text-sm text-white">{mesState.remainingOnRunSheet}</p>
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="flex flex-col gap-6 p-5 overflow-y-auto">
              {/* Hourly output — real MES data when available, else synthetic */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
                  Hourly Output
                  {hasMesHourly ? (
                    <span className="ml-2 text-accent/70 normal-case">· live MES</span>
                  ) : (
                    line.changeovers > 0 && (
                      <span className="ml-2 text-status-amber normal-case">
                        · amber lines = changeovers
                      </span>
                    )
                  )}
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={hourlyBarData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#253044"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={{ stroke: "#253044" }}
                      tickLine={false}
                      interval={hasMesHourly ? 0 : 3}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      {...tooltipStyle}
                    />
                    {/* Changeover markers only on synthetic data */}
                    {!hasMesHourly &&
                      changeoverTimes.map((t) => (
                        <ReferenceLine
                          key={t}
                          x={t}
                          stroke="#f59e0b"
                          strokeDasharray="4 2"
                          label={{ value: "C/O", fill: "#f59e0b", fontSize: 9 }}
                        />
                      ))}
                    <Bar
                      dataKey="output"
                      name="Output"
                      fill="#edb81a"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* FPY trend */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
                  FPY Trend
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#253044"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={{ stroke: "#253044" }}
                      tickLine={false}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [`${(v as number).toFixed(1)}%`, "FPY"]}
                    />
                    {changeoverTimes.map((t) => (
                      <ReferenceLine
                        key={t}
                        x={t}
                        stroke="#f59e0b"
                        strokeDasharray="4 2"
                      />
                    ))}
                    <RechartsLine
                      type="monotone"
                      dataKey="fpy"
                      stroke="#22c55e"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* HPU trend */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
                  HPU Trend
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#253044"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={{ stroke: "#253044" }}
                      tickLine={false}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [(v as number).toFixed(2), "HPU"]}
                    />
                    {changeoverTimes.map((t) => (
                      <ReferenceLine
                        key={t}
                        x={t}
                        stroke="#f59e0b"
                        strokeDasharray="4 2"
                      />
                    ))}
                    <RechartsLine
                      type="monotone"
                      dataKey="hpu"
                      stroke="#1d9e75"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
