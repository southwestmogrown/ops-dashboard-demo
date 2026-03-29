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
  const outputNum = Number(data.output) || 0;

  // Status bar color — "LIVE" when line produced output, "STOPPED" otherwise
  const statusBarColor = hasOutput ? "bg-vs2" : "bg-border";
  const statusLabel = hasOutput ? "Live" : "Stopped";
  const statusCls = hasOutput
    ? "bg-vs2/10 text-vs2 border-vs2/20"
    : "bg-border/20 text-[#e1e2ec]/30 border-border";

  return (
    <div className="bg-surface hover:bg-surface-high transition-colors relative overflow-hidden group">
      {/* Top status bar */}
      <div className={`absolute top-0 left-0 w-full h-[2px] ${statusBarColor}`} />

      <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-6">
        {/* Station identifier */}
        <div className="col-span-2 md:col-span-1">
          <p className="text-[10px] text-accent uppercase font-black tracking-widest mb-1">
            Station
          </p>
          <p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold">
            {line}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[9px] font-bold border uppercase ${statusCls}`}>
              {statusLabel}
            </span>
            <button
              onClick={() => onHide(vsId, line)}
              title="Hide this line"
              className="text-[10px] text-[#e1e2ec]/20 hover:text-accent uppercase font-bold cursor-pointer bg-transparent border-none transition-colors"
            >
              Hide
            </button>
          </div>
          <p className="text-[10px] text-[#e1e2ec]/30 mt-1">{vsName}</p>
        </div>

        {/* Summary metrics (display) */}
        <div>
          <p className="text-[10px] text-[#e1e2ec]/40 uppercase font-bold tracking-widest mb-1">Output</p>
          <p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
            {data.output || "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#e1e2ec]/40 uppercase font-bold tracking-widest mb-1">HC / HPU</p>
          <p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
            {data.headcount || "—"}
            <span className="text-sm font-normal text-[#e1e2ec]/30 ml-1">
              / {data.hpu || "0"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#e1e2ec]/40 uppercase font-bold tracking-widest mb-1">Rem. Order</p>
          <p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
            {data.remainingOnOrder || "—"}
          </p>
        </div>
        <div className="flex flex-col justify-start">
          <p className="text-[10px] text-[#e1e2ec]/40 uppercase font-bold tracking-widest mb-1">C/O</p>
          <p className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
            {data.changeovers || "0"}
          </p>
        </div>
      </div>

      {/* Expandable edit fields */}
      <div className="px-5 pb-5 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 border-t border-border/30 pt-4">
        {FIELDS.map(({ key, label, type, readOnly }) => (
          <div key={key}>
            <label className="block text-[10px] text-[#e1e2ec]/30 mb-1 tracking-widest uppercase font-bold">
              {label}
            </label>
            <input
              type={type}
              value={data[key]}
              readOnly={readOnly}
              onChange={(e) => onChange(lineKey, key, e.target.value)}
              className={[
                "w-full border border-border rounded-sm px-2.5 py-2 text-sm outline-none box-border font-mono",
                readOnly
                  ? "bg-background text-[#e1e2ec]/30 cursor-not-allowed"
                  : "bg-surface-highest text-[#e1e2ec] focus:ring-1 focus:ring-accent/30 focus:border-accent/30",
              ].join(" ")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
