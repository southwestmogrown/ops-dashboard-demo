"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Line as LineData, TimePoint } from "@/lib/types";

interface OutputChartProps {
  lines: LineData[];
  trend?: TimePoint[];
  totalTarget?: number;
}

export default function OutputChart({ lines, trend, totalTarget }: OutputChartProps) {
  const data = lines.map((line: LineData) => ({
    line: `${line.valueStream} L${line.name.slice(-1)}`,
    output: line.output,
    target: line.target,
    isVs1: line.valueStream === "VS1",
  }));

  /** True when any line in the VS has output > 2 std devs below the VS average. */
  function vsHasDramaticOff(vs: "VS1" | "VS2") {
    const vsLines = lines.filter((l) => l.valueStream === vs);
    if (vsLines.length < 2) return false;
    const outputs = vsLines.map((l) => l.output);
    const avg = outputs.reduce((a, b) => a + b, 0) / outputs.length;
    const variance = outputs.reduce((s, v) => s + (v - avg) ** 2, 0) / outputs.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return false;
    return vsLines.some((l) => l.output < avg - 2 * stdDev);
  }

  const vs1Warn = vsHasDramaticOff("VS1");
  const vs2Warn = vsHasDramaticOff("VS2");

  return (
    <div className="bg-surface rounded-sm p-6">
      {/* Section header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-lg font-bold font-['Space_Grotesk',sans-serif] tracking-tight uppercase text-[#e1e2ec]">
            Line Output Performance
          </h2>
          <p className="text-xs text-[#e1e2ec]/40 mt-0.5">
            Real-time throughput analysis per production line
          </p>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-accent rounded-sm" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
              VS1 (Folding)
            </span>
            {vs1Warn && (
              <span title="One or more VS1 lines are dramatically underperforming" className="text-status-amber text-sm leading-none">⚠</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-vs2 rounded-sm" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
              VS2 (Revolver)
            </span>
            {vs2Warn && (
              <span title="One or more VS2 lines are dramatically underperforming" className="text-status-amber text-sm leading-none">⚠</span>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          barCategoryGap="25%"
          barGap={3}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1e2433"
            vertical={false}
          />
          <XAxis
            dataKey="line"
            tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 11, fontWeight: 700 }}
            axisLine={{ stroke: "#1e2433" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            label={{ value: "Units", angle: -90, position: "insideLeft", fill: "#e1e2ec", fillOpacity: 0.3, fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              backgroundColor: "#131720",
              border: "1px solid #1e2433",
              borderRadius: "4px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#e1e2ec", opacity: 0.6 }}
            itemStyle={{ color: "#e1e2ec" }}
          />
          <Bar
            dataKey="output"
            name="Output"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            fill="#f97316"
          />
          <Bar
            dataKey="target"
            name="Target"
            fill="#334155"
            radius={[2, 2, 0, 0]}
            stroke="#475569"
            strokeWidth={1}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* ── Shift Progress Trend ── */}
      {trend && trend.length > 0 && (
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-bold font-['Space_Grotesk',sans-serif] tracking-tight uppercase text-[#e1e2ec]">
                Shift Progress
              </h3>
              <p className="text-xs text-[#e1e2ec]/40 mt-0.5">
                Cumulative output vs target trajectory
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-0.5 bg-accent rounded-full" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
                  VS1 (Folding)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-0.5 bg-vs2 rounded-full" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
                  VS2 (Revolver)
                </span>
              </div>
              {totalTarget && totalTarget > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-0.5 border-t-2 border-dashed border-[#e1e2ec]/30 rounded-full" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
                    Target Trajectory
                  </span>
                </div>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={trend}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e2433"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 11 }}
                axisLine={{ stroke: "#1e2433" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#e1e2ec", fillOpacity: 0.4, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "#1e2433", strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: "#131720",
                  border: "1px solid #1e2433",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#e1e2ec", opacity: 0.6 }}
                itemStyle={{ color: "#e1e2ec" }}
              />

              {/* VS1 cumulative output line */}
              <Line
                type="monotone"
                dataKey="vs1Output"
                name="VS1 Output"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#f97316" }}
                isAnimationActive={false}
              />

              {/* VS2 cumulative output line */}
              <Line
                type="monotone"
                dataKey="vs2Output"
                name="VS2 Output"
                stroke="#1d9e75"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#1d9e75" }}
                isAnimationActive={false}
              />

              {/* Target trajectory — straight line from 0 to totalTarget at the last time point */}
              {totalTarget && totalTarget > 0 && (
                <ReferenceLine
                  segment={[
                    { x: trend[0]?.time, y: 0 },
                    { x: trend[trend.length - 1]?.time, y: totalTarget },
                  ]}
                  stroke="#e1e2ec"
                  strokeOpacity={0.25}
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{
                    value: "Target",
                    position: "insideEnd",
                    fill: "#e1e2ec",
                    fillOpacity: 0.4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
