"use client";

import { useState } from "react";
import type { EOSFormData, EOSLineDescriptor } from "@/lib/eosTypes";
import { generateEmailBody, downloadAllReports } from "@/lib/eosReports";

interface Props {
  data: EOSFormData;
  activeLines: EOSLineDescriptor[];
  streamName: string;
  onBack: () => void;
}

export default function EOSEmailPreview({ data, activeLines, streamName, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const emailBody = generateEmailBody(data, activeLines, streamName);
  const subject = `EOS Report (${streamName}) — ${data.shift} Shift | ${data.date} | ${data.supervisor || "Supervisor"}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="text-slate-200 font-semibold text-base">
            EOS Email Draft — {streamName}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Copy and paste into Outlook — attach the 4 downloaded reports
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={[
            "border-none px-6 py-2.5 rounded cursor-pointer font-bold text-xs tracking-widest uppercase transition-colors",
            copied ? "bg-status-green text-black" : "bg-accent text-black",
          ].join(" ")}
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
      </div>

      {/* Subject */}
      <div className="bg-surface border border-border rounded px-4 py-3 mb-3 text-sm">
        <span className="text-slate-500 mr-2">SUBJECT:</span>
        <span className="text-accent">{subject}</span>
      </div>

      {/* Body */}
      <pre className="bg-surface border border-border rounded-lg px-6 py-6 text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words m-0 font-mono">
        {emailBody}
      </pre>

      <div className="flex gap-3 mt-4">
        <button
          onClick={onBack}
          className="bg-transparent text-slate-500 border border-border px-5 py-3 rounded cursor-pointer text-sm hover:border-slate-500 transition-colors"
        >
          ← Back to Entry
        </button>
        <button
          onClick={() => downloadAllReports(data, activeLines)}
          className="bg-accent text-black border-none px-6 py-3 rounded cursor-pointer font-bold text-xs tracking-widest uppercase"
        >
          ↓ Download All 4 Reports
        </button>
      </div>
    </div>
  );
}
