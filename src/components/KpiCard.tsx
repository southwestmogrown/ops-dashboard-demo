interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  valueColor?: string;
  /** Tailwind bg class for the left accent border, e.g. "bg-accent" */
  accentClass?: string;
}

export default function KpiCard({
  label,
  value,
  unit,
  subtext,
  valueColor = "text-[#e1e2ec]",
  accentClass = "bg-accent",
}: KpiCardProps) {
  return (
    <div className="bg-surface p-5 rounded-sm relative overflow-hidden">
      {/* Left accent border */}
      <div className={`absolute top-0 left-0 w-1 h-full ${accentClass}`} />

      <div className="flex justify-between items-start mb-3">
        <span className="text-[10px] font-bold text-[#e1e2ec]/50 uppercase tracking-widest">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-4xl font-bold font-['Space_Grotesk',sans-serif] ${valueColor}`}
            >
              {value}
            </span>
            {unit && (
              <span className="text-[#e1e2ec]/40 text-sm">{unit}</span>
            )}
          </div>
          {subtext && (
            <span className="text-[#e1e2ec]/40 text-xs mt-1 block">
              {subtext}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
