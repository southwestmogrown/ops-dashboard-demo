"use client";

import type { EOSLineEntry } from "@/lib/eosTypes";

interface Props {
  lineKey: string;
  vsId: string;
  line: string;
  vsName: string;
  data: EOSLineEntry;
  onChange: (lineKey: string, field: keyof EOSLineEntry, value: string) => void;
  onHide: (vsId: string, line: string) => void;
}

const FIELDS: { key: keyof EOSLineEntry; label: string; type: string; readOnly?: boolean }[] = [
  { key: "output",              label: "Output",                 type: "number" },
  { key: "headcount",           label: "Headcount",              type: "number" },
  { key: "hoursWorked",         label: "Hours Worked",           type: "number" },
  { key: "hpu",                 label: "HPU",                    type: "number", readOnly: true },
  { key: "orderAtPackout",      label: "Order @ Packout",        type: "text" },
  { key: "remainingOnOrder",    label: "Remaining on Order",     type: "number" },
  { key: "remainingOnRunSheet", label: "Remaining on Run Sheet", type: "number" },
  { key: "changeovers",         label: "Changeovers",            type: "number" },
];

export default function EOSLineCard({ lineKey, vsId, line, vsName, data, onChange, onHide }: Props) {
  const hasOutput = Boolean(data.output);

  return (
    <div className="bg-surface border border-border border-l-4 border-l-accent rounded-lg p-5 mb-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-accent font-bold text-sm tracking-widest uppercase">{line}</div>
          <div className="text-slate-400 text-xs mt-0.5">{vsName}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${hasOutput ? "bg-status-green" : "bg-slate-700"}`} />
          <button
            onClick={() => onHide(vsId, line)}
            title="Hide this line for the current shift"
            className="border border-border rounded text-slate-500 text-xs px-2 py-0.5 bg-transparent cursor-pointer hover:border-slate-500 transition-colors"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {FIELDS.map(({ key, label, type, readOnly }) => (
          <div key={key}>
            <label className="block text-xs text-slate-400 mb-1.5 tracking-widest uppercase font-medium">
              {label}
            </label>
            <input
              type={type}
              value={data[key]}
              readOnly={readOnly}
              onChange={(e) => onChange(lineKey, key, e.target.value)}
              className={[
                "w-full border border-border rounded px-2.5 py-2 text-sm outline-none box-border font-mono",
                readOnly
                  ? "bg-background text-slate-500 cursor-not-allowed"
                  : "bg-background text-slate-200 focus:border-accent",
              ].join(" ")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
