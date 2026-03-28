"use client";

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

interface OutputChartProps {
  lines: LineData[];
}

export default function OutputChart({ lines }: OutputChartProps) {
  const data = lines.map((line: LineData) => ({
    line: `${line.valueStream} L${line.name.slice(-1)}`,
    output: line.output,
    target: line.target,
    isVs1: line.valueStream === "VS1",
  }));

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
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-vs2 rounded-sm" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/50">
              VS2 (Revolver)
            </span>
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
            fill="#1e2433"
            radius={[2, 2, 0, 0]}
            stroke="#253044"
            strokeWidth={1}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
