"use client";

import type { EOSFormData, EOSShift } from "@/lib/eosTypes";

const SHIFTS: EOSShift[] = ["Day", "Night"];

interface Props {
  data: EOSFormData;
  onChangeMeta: (key: keyof Omit<EOSFormData, "lines">, value: string) => void;
}

const inputCls =
  "w-full bg-background border border-border rounded px-3.5 py-2.5 text-slate-200 text-sm outline-none font-mono focus:border-accent";

export default function EOSMetaForm({ data, onChangeMeta }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6 mb-8">
      <div className="text-xs text-slate-500 tracking-widest uppercase font-semibold mb-4">
        Shift Information
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 tracking-widest uppercase font-medium">
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
          <label className="block text-xs text-slate-400 mb-1.5 tracking-widest uppercase font-medium">
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
          <label className="block text-xs text-slate-400 mb-1.5 tracking-widest uppercase font-medium">
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
