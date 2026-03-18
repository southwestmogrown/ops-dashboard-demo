"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TimePoint } from "@/lib/types";

interface TrendChartProps {
  data: TimePoint[];
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-4">
        Output Trend
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
          <XAxis
            dataKey="time"
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
          <Line
            type="monotone"
            dataKey="vs1Output"
            name="VS1"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#f97316" }}
          />
          <Line
            type="monotone"
            dataKey="vs2Output"
            name="VS2"
            stroke="#1D9E75"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#1D9E75" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}