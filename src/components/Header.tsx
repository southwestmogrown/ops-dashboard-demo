"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Line, ShiftName } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import ExportButton from "./ExportButton";
import { getShiftWindows, getShiftProgress, formatShiftTime } from "@/lib/shiftTime";

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
  const { role, logout } = useAuth();
  const [simClock, setSimClock] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());

  // Poll sim clock every 5 s
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/sim/clock");
        if (res.ok) {
          const { clock } = await res.json();
          const parsed = clock ? new Date(clock) : null;
          setSimClock(parsed);
        }
      } catch {
        // silent
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Tick display clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const displayTime = simClock ?? now;

  // Shift clock derived from `now` (already ticking every second)
  const win = getShiftWindows(shift);
  const progress = getShiftProgress(shift, displayTime);

  // Shift end clock time
  const endHour = win.endHour;
  const endH = endHour % 24;
  const shiftEndTime = `${String(Math.floor(endH)).padStart(2, "0")}:${String(Math.round((endH % 1) * 60)).padStart(2, "0")}`;

  // Break proximity — find next break start (in decimal hours from midnight)
  function nextBreakHours(n: Date): number | null {
    const cur = n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600;
    for (const b of win.breakWindows) {
      if (b.start > cur) return b.start;
    }
    return null; // no more breaks
  }

  const nextBreak = nextBreakHours(displayTime);
  const minutesToNextBreak = nextBreak != null ? Math.round((nextBreak - (displayTime.getHours() + displayTime.getMinutes() / 60 + displayTime.getSeconds() / 3600)) * 60) : null;
  const isNearBreak = minutesToNextBreak != null && minutesToNextBreak <= 30 && minutesToNextBreak > 0;
  const isNearEnd = progress.remainingHours <= 0.25;

  return (
    <header className="shrink-0 z-50 bg-background border-b border-border font-['Space_Grotesk',sans-serif] tracking-tight">
      <div className="flex justify-between items-center w-full px-6 py-3">
        {/* Left: brand + nav */}
        <div className="flex items-center space-x-8">
          <span className="text-xl font-bold tracking-tighter text-accent uppercase select-none">
            KINETIC COMMAND
          </span>
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/eos"
              className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors"
            >
              EOS
            </Link>
            {role === "supervisor" && (
              <Link
                href="/admin"
                className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors"
              >
                Admin
              </Link>
            )}
            <Link
              href="/team-lead"
              className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors"
            >
              Team Lead
            </Link>
            <Link
              href="/sim"
              className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors"
            >
              SIM
            </Link>
          </nav>
        </div>

        {/* Right: shift pill + actions */}
        <div className="flex items-center space-x-3">
          {simClock && (
            <span className="bg-accent text-white text-[9px] px-1.5 py-0.5 uppercase tracking-widest font-black rounded-sm">
              SIM
            </span>
          )}

          {/* Shift clock */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-surface border border-border rounded-sm">
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold leading-none">
                Remaining
              </span>
              <span className={`text-sm font-medium font-mono leading-tight ${isNearEnd || isNearBreak ? 'text-status-amber animate-pulse' : 'text-[#e1e2ec]'}`}>
                {formatShiftTime(progress.remainingHours)}
              </span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold leading-none">
                End
              </span>
              <span className={`text-sm font-medium font-mono leading-tight ${isNearEnd || isNearBreak ? 'text-status-amber animate-pulse' : 'text-[#e1e2ec]'}`}>
                {shiftEndTime}
              </span>
            </div>
          </div>

          {/* Shift + time pill */}
          <div className="flex items-center space-x-3 px-3 py-1.5 bg-surface border border-border rounded-sm">
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold">
                Shift Status
              </span>
              <button
                onClick={() =>
                  onShiftChange(shift === "day" ? "night" : "day")
                }
                className="text-sm font-bold text-accent hover:text-orange-300 transition-colors leading-tight"
                title="Click to toggle shift"
              >
                Shift: {shift === "day" ? "Day" : "Night"}
              </button>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold">
                Current Time
              </span>
              <span className="text-sm font-medium font-mono text-[#e1e2ec] leading-tight">
                {displayTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Last updated */}
          <span className="text-xs text-[#e1e2ec]/40 hidden xl:block whitespace-nowrap">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Fetching..."}
          </span>

          <ExportButton lines={lines} shift={shift} />

          {/* Logout */}
          <button
            onClick={logout}
            className="p-2 text-[#e1e2ec]/40 hover:text-[#e1e2ec] hover:bg-surface transition-all rounded-sm"
            title="Logout"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>

          {/* Role badge */}
          <div className="h-8 w-8 rounded-sm bg-surface-high border border-border flex items-center justify-center">
            <span
              className={`text-xs font-black ${
                role === "supervisor" ? "text-accent" : "text-vs2"
              }`}
            >
              {role === "supervisor" ? "SUP" : "TL"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
