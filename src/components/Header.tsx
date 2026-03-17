"use client";

import { ShiftName } from "@/lib/types";
import ShiftSelector from "./ShiftSelector";

interface HeaderProps {
  shift: ShiftName;
  onShiftChange: (shift: ShiftName) => void;
  lastUpdated: Date | null;
}

export default function Header({
  shift,
  onShiftChange,
  lastUpdated,
}: HeaderProps) {
  return (
    <header className="bg-surface border-b border-border px-8 py-4">
      <div className="flex items-center justify-between">
        {/* Left — app name */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-accent font-semibold text-lg tracking-tight whitespace-nowrap">
            Ops Dashboard
          </span>
          <span className="text-slate-600 text-sm hidden md:block">
            RealTruck BAK · Demo
          </span>
        </div>

        {/* Center — shift selector */}
        <div className="flex-1 flex justify-center px-8">
          <ShiftSelector value={shift} onChange={onShiftChange} />
        </div>

        {/* Right — timestamp + export placeholder */}
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-slate-500 text-sm whitespace-nowrap">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Fetching..."}
          </span>
          <button
            disabled
            className="px-3 py-1.5 rounded text-sm border border-border
                       text-slate-600 opacity-50 cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>
    </header>
  );
}
