"use client";
import { ShiftName } from "@/lib/types";

interface ShiftSelectorProps {
  value: ShiftName;
  onChange: (shift: ShiftName) => void;
}

const SHIFTS: ShiftName[] = ["day", "night"];

function formatShift(shift: ShiftName): string {
  return shift.charAt(0).toUpperCase() + shift.slice(1);
}

export default function ShiftSelector({ value, onChange }: ShiftSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {SHIFTS.map((shift) => (
        <button
          key={shift}
          onClick={() => {
            if (shift === value) return;
            if (window.confirm("Switch shift? Unsaved data will be lost.")) {
              onChange(shift);
            }
          }}
          className={`
            px-4 py-1.5 rounded-full text-sm font-medium
            border transition-colors cursor-pointer ${
              value === shift
                ? "bg-accent text-black"
                : "bg-transparent border-border text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }
          `}
        >
          {formatShift(shift)}
        </button>
      ))}
    </div>
  );
}
