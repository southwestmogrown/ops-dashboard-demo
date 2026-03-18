import { Line } from "@/lib/types";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  valueColor?: string;
}

export default function KpiCard({
  label,
  value,
  unit,
  subtext,
  valueColor = "text-white",
}: KpiCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-1">
      <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-3xl font-semibold ${valueColor}`}>
          {value}
        </span>
        {unit && (
          <span className="text-slate-500 text-sm">{unit}</span>
        )}
      </div>
      {subtext && (
        <span className="text-slate-500 text-xs">{subtext}</span>
      )}
    </div>
  );
}