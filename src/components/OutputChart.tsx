"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
  }));

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-4">
        Output vs Target
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          barCategoryGap="25%"
          barGap={3}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" vertical={false} />
          <XAxis
            dataKey="line"
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#1e2433" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              backgroundColor: "#131720",
              border: "1px solid #1e2433",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#e2e8f0" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "#64748b" }}
          />
          <Bar
            dataKey="output"
            name="Output"
            fill="#f97316"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="target"
            name="Target"
            fill="#1e2433"
            radius={[3, 3, 0, 0]}
            stroke="#334155"
            strokeWidth={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}