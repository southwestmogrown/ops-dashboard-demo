"use client";

import Link from "next/link";
import { Line, ShiftName } from "@/lib/types";
import ShiftSelector from "./ShiftSelector";
import ExportButton from "./ExportButton";

interface HeaderProps {
  shift: ShiftName;
  onShiftChange: (shift: ShiftName) => void;
  lastUpdated: Date | null;
  lines: Line[];
}

export default function Header({
  shift,
  onShiftChange,
  lastUpdated,
  lines,
}: HeaderProps) {
  return (
    <header className="bg-surface border-b border-border px-8 py-4">
      <div className="flex items-center justify-between">
        {/* Left — app name */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-accent font-semibold text-lg tracking-tight whitespace-nowrap">
            Ops Dashboard
          </span>
          <span className="text-slate-500 text-sm hidden md:block">
            RealTruck BAK · Demo
          </span>
        </div>

        {/* Center — shift selector */}
        <div className="flex-1 flex justify-center px-8">
          <ShiftSelector value={shift} onChange={onShiftChange} />
        </div>

        {/* Right — timestamp + export placeholder */}
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-slate-400 text-sm whitespace-nowrap">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Fetching..."}
          </span>
          <ExportButton lines={lines} shift={shift} />
          <Link
            href="/eos"
            className="text-xs text-slate-500 hover:text-accent border border-border hover:border-accent px-3 py-1.5 rounded tracking-widest uppercase transition-colors whitespace-nowrap"
          >
            EOS Report
          </Link>
          <Link
            href="/admin"
            className="text-xs text-slate-500 hover:text-accent border border-border hover:border-accent px-3 py-1.5 rounded tracking-widest uppercase transition-colors whitespace-nowrap"
          >
            Admin
          </Link>
        </div>
      </div>
    </header>
  );
}
