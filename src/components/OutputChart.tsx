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
      <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">
        Output vs Target
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          barCategoryGap="25%"
          barGap={3}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#253044" vertical={false} />
          <XAxis
            dataKey="line"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#253044" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              backgroundColor: "#161c2a",
              border: "1px solid #253044",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#edf2f8" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }}
          />
          <Bar
            dataKey="output"
            name="Output"
            fill="#edb81a"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="target"
            name="Target"
            fill="#2d4f7a"
            radius={[3, 3, 0, 0]}
            stroke="#3d5a88"
            strokeWidth={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
