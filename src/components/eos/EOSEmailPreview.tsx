"use client";

import { useState } from "react";
import type { EOSFormData, EOSLineDescriptor } from "@/lib/eosTypes";
import { generateEmailBody, downloadAllReports } from "@/lib/eosReports";

interface Props {
  data: EOSFormData;
  activeLines: EOSLineDescriptor[];
  streamName: string;
  onBack?: () => void;
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
      {/* Glass panel wrapper */}
      <div className="glass-panel p-px rounded-sm">
        <div className="bg-background p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-accent">mail</span>
              <h3 className="font-['Space_Grotesk',sans-serif] text-sm font-bold tracking-tight uppercase">
                Email Draft Preview
              </h3>
            </div>
            <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-sm font-bold">
              AUTO-GENERATED
            </span>
          </div>

          {/* Email fields */}
          <div className="space-y-3 text-xs text-[#e1e2ec]/70">
            <div className="border-b border-border/30 pb-2">
              <span className="text-[#e1e2ec]/30 uppercase font-bold mr-2">To:</span>
              ops-leads@kineticcommand.io
            </div>
            <div className="border-b border-border/30 pb-2">
              <span className="text-[#e1e2ec]/30 uppercase font-bold mr-2">Subject:</span>
              <span className="text-accent">{subject}</span>
            </div>
          </div>

          {/* Email body */}
          <div className="mt-4 bg-surface p-4 rounded-sm border border-border/20 overflow-y-auto max-h-[400px] custom-scrollbar">
            <pre
              id="eos-email-body"
              className="text-xs text-[#e1e2ec]/60 leading-relaxed whitespace-pre-wrap break-words m-0 font-mono"
            >
              {emailBody}
            </pre>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={[
              "w-full mt-4 py-2.5 rounded-sm cursor-pointer font-bold text-xs tracking-widest uppercase transition-colors",
              copied
                ? "bg-status-green text-black"
                : "bg-surface-highest text-[#e1e2ec] border border-border hover:bg-surface-high hover:border-accent/30",
            ].join(" ")}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="mt-6 p-4 bg-surface-high/40 rounded-sm border border-border/30">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-vs2 mt-0.5 text-sm">info</span>
          <p className="text-xs leading-relaxed text-[#e1e2ec]/40">
            This report will be distributed to the executive operations group and logged in the
            permanent record. Ensure all manual notes are accurate before sending.
          </p>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={() => downloadAllReports(data, activeLines)}
        className="w-full mt-4 py-2.5 bg-accent text-black rounded-sm cursor-pointer font-bold text-xs tracking-widest uppercase hover:bg-orange-500 transition-colors active:scale-95"
      >
        Download All Reports
      </button>
    </div>
  );
}
