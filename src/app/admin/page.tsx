"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { LineSchedule, LineState } from "@/lib/mesTypes";
import type { AdminLineConfig } from "@/lib/mesStore";

const AdminLineCard = dynamic(() => import("@/components/admin/AdminLineCard"), { ssr: false });

// ── Config ────────────────────────────────────────────────────────────────────

const LINES: { lineId: string; label: string; vs: string }[] = [
  { lineId: "vs1-l1", label: "Line 1", vs: "vs1" },
  { lineId: "vs1-l2", label: "Line 2", vs: "vs1" },
  { lineId: "vs1-l3", label: "Line 3", vs: "vs1" },
  { lineId: "vs1-l4", label: "Line 4", vs: "vs1" },
  { lineId: "vs2-l1", label: "Line 1", vs: "vs2" },
  { lineId: "vs2-l2", label: "Line 2", vs: "vs2" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [mesStates,   setMesStates]   = useState<LineState[]>([]);
  const [adminConfig, setAdminConfig] = useState<Record<string, AdminLineConfig>>({});

  const refresh = useCallback(async () => {
    const [stateRes, configRes] = await Promise.all([
      fetch("/api/mes/state"),
      fetch("/api/admin/config"),
    ]);
    if (stateRes.ok)  setMesStates(await stateRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function scheduleFor(lineId: string): LineSchedule | null {
    return mesStates.find((s) => s.lineId === lineId)?.schedule ?? null;
  }

  async function handleScheduleLoaded(lineId: string, schedule: LineSchedule) {
    await fetch("/api/mes/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, schedule }),
    });
    await refresh();
  }

  async function handleConfigSaved(
    lineId: string,
    target: number | undefined,
    headcount: number | undefined
  ) {
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, target, headcount }),
    });
    await refresh();
  }

  const vs1Lines = LINES.filter((l) => l.vs === "vs1");
  const vs2Lines = LINES.filter((l) => l.vs === "vs2");

  return (
    <div className="min-h-screen bg-background text-slate-200">

      {/* Header */}
      <header className="bg-surface border-b border-border px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-accent text-black font-black text-xs px-2.5 py-1 rounded tracking-widest">
            BAK
          </span>
          <span className="text-slate-500 text-sm">|</span>
          <span className="text-slate-400 text-sm tracking-widest uppercase">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/sim"
            className="text-xs text-slate-500 hover:text-slate-300 tracking-widest uppercase transition-colors"
          >
            MES Sim
          </Link>
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 tracking-widest uppercase transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="px-8 py-8 max-w-6xl mx-auto flex flex-col gap-8">

        {/* VS1 */}
        <section>
          <div className="text-xs text-slate-500 tracking-widest uppercase font-semibold mb-4">
            Value Stream 1 — HFC (Hard Folding Cover)
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {vs1Lines.map(({ lineId, label }) => (
              <AdminLineCard
                key={lineId}
                lineId={lineId}
                label={label}
                schedule={scheduleFor(lineId)}
                savedTarget={adminConfig[lineId]?.target}
                savedHeadcount={adminConfig[lineId]?.headcount}
                onScheduleLoaded={handleScheduleLoaded}
                onConfigSaved={handleConfigSaved}
              />
            ))}
          </div>
        </section>

        {/* VS2 */}
        <section>
          <div className="text-xs text-slate-500 tracking-widest uppercase font-semibold mb-4">
            Value Stream 2 — HRC (Hard Rolling Cover)
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {vs2Lines.map(({ lineId, label }) => (
              <AdminLineCard
                key={lineId}
                lineId={lineId}
                label={label}
                schedule={scheduleFor(lineId)}
                savedTarget={adminConfig[lineId]?.target}
                savedHeadcount={adminConfig[lineId]?.headcount}
                onScheduleLoaded={handleScheduleLoaded}
                onConfigSaved={handleConfigSaved}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
