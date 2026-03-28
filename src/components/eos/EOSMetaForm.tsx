"use client";

import type { EOSFormData, EOSShift } from "@/lib/eosTypes";

const SHIFTS: EOSShift[] = ["Day", "Night"];

interface Props {
  data: EOSFormData;
  onChangeMeta: (key: keyof Omit<EOSFormData, "lines">, value: string) => void;
}

const inputCls =
  "w-full bg-surface-highest border-none rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none font-mono focus:ring-1 focus:ring-accent/40 placeholder:text-[#e1e2ec]/20";

export default function EOSMetaForm({ data, onChangeMeta }: Props) {
  return (
    <div className="bg-surface-low p-6 border-l-2 border-vs2/30">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-vs2">assignment_ind</span>
        <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold tracking-tight uppercase">
          Shift Information
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] text-[#e1e2ec]/40 mb-1.5 tracking-widest uppercase font-bold">
            Supervisor
          </label>
          <input
            type="text"
            value={data.supervisor}
            onChange={(e) => onChangeMeta("supervisor", e.target.value)}
            placeholder="Your name"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#e1e2ec]/40 mb-1.5 tracking-widest uppercase font-bold">
            Date
          </label>
          <input
            type="date"
            value={data.date}
            onChange={(e) => onChangeMeta("date", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#e1e2ec]/40 mb-1.5 tracking-widest uppercase font-bold">
            Shift
          </label>
          <select
            value={data.shift}
            onChange={(e) => onChangeMeta("shift", e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            {SHIFTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
