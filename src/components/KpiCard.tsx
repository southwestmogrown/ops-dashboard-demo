import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  valueColor?: string;
  /** Tailwind bg class for the left accent border, e.g. "bg-accent" */
  accentClass?: string;
  /** Optional tooltip content — renders an info icon next to the label */
  tooltip?: React.ReactNode;
}

export default function KpiCard({
  label,
  value,
  unit,
  subtext,
  valueColor = "text-[#e1e2ec]",
  accentClass = "bg-accent",
  tooltip,
}: KpiCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function handleMouseEnter() {
    if (!tooltip || !iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    setTooltipPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    setShowTooltip(true);
  }

  function handleMouseLeave() {
    setShowTooltip(false);
  }

  const tooltipEl = showTooltip && tooltip && mounted
    ? createPortal(
        <div
          className="fixed z-[9999] w-60 bg-surface-highest border border-border rounded-sm shadow-2xl p-3 text-[10px] text-[#e1e2ec]/80 leading-relaxed pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {tooltip}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="bg-surface p-5 rounded-sm relative overflow-hidden">
        {/* Left accent border */}
        <div className={`absolute top-0 left-0 w-1 h-full ${accentClass}`} />

        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#e1e2ec]/50 uppercase tracking-widest">
              {label}
            </span>
            {tooltip && (
              <button
                ref={iconRef}
                className="text-[#e1e2ec]/20 hover:text-[#e1e2ec]/50 transition-colors cursor-help"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => setShowTooltip((v) => !v)}
                aria-label={`Info: ${label}`}
              >
                <span className="material-symbols-outlined text-[12px] leading-none select-none">
                  info
                </span>
              </button>
            )}
          </div>
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
      {tooltipEl}
    </>
  );
}
