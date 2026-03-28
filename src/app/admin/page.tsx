"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { AdminLineConfig, LineSchedule, LineState } from "@/lib/mesTypes";
import { LINES, LINE_ADMIN_LABELS } from "@/lib/lines";
import AdminLayout from "@/components/admin/AdminLayout";

const AdminLineCard = dynamic(() => import("@/components/admin/AdminLineCard"), { ssr: false });

const SIDE_NAV = [
  { icon: "inventory_2", label: "Inventory" },
  { icon: "verified", label: "Quality Control" },
  { icon: "build", label: "Maintenance" },
] as const;

function AdminPageContent() {
  const [mesStates, setMesStates] = useState<LineState[]>([]);
  const [adminConfig, setAdminConfig] = useState<Record<string, AdminLineConfig>>({});
  const [now, setNow] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    const [stateRes, configRes] = await Promise.all([
      fetch("/api/mes/state"),
      fetch("/api/admin/config"),
    ]);
    if (stateRes.ok) setMesStates(await stateRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  function stateFor(lineId: string) {
    return mesStates.find((s) => s.lineId === lineId) ?? null;
  }

  async function handleScheduleLoaded(lineId: string, schedule: LineSchedule) {
    const mode = stateFor(lineId)?.schedule ? "queue" : "replace";
    await fetch("/api/mes/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, schedule, mode }),
    });
    await refresh();
  }

  async function handleClearSchedule(lineId: string) {
    await fetch("/api/mes/schedule", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId }),
    });
    await refresh();
  }

  async function handleConfigSaved(
    lineId: string,
    target: number | undefined,
    headcount: number | undefined,
    isRunning: boolean
  ) {
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, target, headcount, isRunning }),
    });
    await refresh();
  }

  async function handleRemoveQueued(lineId: string, index: number) {
    await fetch("/api/admin/queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, index }),
    });
    await refresh();
  }

  async function handleSkipOrder(lineId: string, model: string) {
    await fetch("/api/mes/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, model, action: "skip" }),
    });
    await refresh();
  }

  async function handleUnskipOrder(lineId: string, model: string) {
    await fetch("/api/mes/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, model, action: "unskip" }),
    });
    await refresh();
  }

  async function handleResetAll() {
    const confirmed = confirm("Clear all schedules and MES data? This cannot be undone.");
    if (confirmed) {
      await fetch("/api/mes/reset", { method: "POST" });
      await refresh();
    }
  }

  const totalTarget = Object.values(adminConfig).reduce((sum, cfg) => sum + (cfg.target || 0), 0);
  const totalHeadcount = Object.values(adminConfig).reduce((sum, cfg) => sum + (cfg.headcount || 0), 0);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">

      {/* ── Top Nav ── */}
      <nav className="shrink-0 z-50 bg-background border-b border-border font-['Space_Grotesk',sans-serif] tracking-tight">
        <div className="flex justify-between items-center w-full px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-accent uppercase select-none">
              KINETIC COMMAND
            </span>
            <div className="hidden md:flex items-center space-x-6">
              <Link href="/eos" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                EOS
              </Link>
              <Link href="/admin" className="text-accent border-b-2 border-accent pb-0.5 font-bold text-sm">
                Admin
              </Link>
              <Link href="/team-lead" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                Team Lead
              </Link>
              <Link href="/sim" className="text-sm text-[#e1e2ec]/60 hover:text-[#e1e2ec] transition-colors">
                SIM
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-xs text-[#e1e2ec]/60 font-medium">Shift: Day</span>
              <span className="text-[10px] text-[#e1e2ec]/40 tabular-nums">{now.toLocaleTimeString("en-GB")} UTC</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 bg-surface-low border-r border-border flex-col overflow-y-auto custom-scrollbar hidden lg:flex">
          <div className="p-6 border-b border-border">
            <div className="flex items-center space-x-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
              <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
                OP-CENTER
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold">
              Station 04 Active
            </p>
          </div>

          <nav className="flex-1 py-4">
            <div className="space-y-1">
              <Link
                href="/"
                className="flex items-center space-x-3 text-[#e1e2ec]/40 px-4 py-3 hover:bg-surface-high/50 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest hover:text-accent transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">dashboard</span>
                <span>Dashboard</span>
              </Link>
              <div className="flex items-center space-x-3 bg-surface-high text-accent border-l-4 border-accent px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest">
                <span className="material-symbols-outlined text-[18px]">factory</span>
                <span>Assembly Lines</span>
              </div>
              {SIDE_NAV.map(({ icon, label }) => (
                <div
                  key={label}
                  title="Coming Soon"
                  className="flex items-center space-x-3 text-[#e1e2ec]/15 px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest cursor-not-allowed select-none"
                >
                  <span className="material-symbols-outlined text-[18px]">{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </nav>

          <div className="p-4 bg-surface border-t border-border">
            <div className="w-full bg-[#93000a]/80 text-[#ffdad6]/60 py-3 rounded-sm font-bold uppercase tracking-tighter text-sm flex items-center justify-center space-x-2 select-none cursor-not-allowed">
              <span className="material-symbols-outlined text-[18px]">dangerous</span>
              <span>Emergency Stop</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                title="Coming Soon"
                className="flex flex-col items-center py-2 text-[#e1e2ec]/15 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">help_center</span>
                <span className="text-[9px] mt-1 font-bold tracking-widest">SUPPORT</span>
              </button>
              <button
                title="Coming Soon"
                className="flex flex-col items-center py-2 text-[#e1e2ec]/15 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">history_edu</span>
                <span className="text-[9px] mt-1 font-bold tracking-widest">LOGS</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-background">

          {/* Header */}
          <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="font-['Space_Grotesk',sans-serif] text-4xl font-bold tracking-tight mb-2">
                Configuration <span className="text-accent/50 text-2xl font-light">v4.2.0</span>
              </h1>
              <p className="text-[#e1e2ec]/60 max-w-xl text-sm leading-relaxed">
                System-wide parameters for assembly floor synchronization. Ensure all shift targets align with the ERP master schedule before committing changes.
              </p>
            </div>
            <div className="flex gap-4 items-center bg-surface-low p-4 rounded-sm border-l-2 border-accent">
              <div className="flex flex-col pr-6 border-r border-border">
                <span className="text-[10px] uppercase font-bold tracking-widest text-accent mb-1">Shift Targets</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">{totalTarget.toLocaleString()}</span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-medium">units</span>
                </div>
              </div>
              <div className="flex flex-col pl-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-status-green mb-1">Global Headcount</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">{totalHeadcount}</span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-medium">OPS</span>
                </div>
              </div>
            </div>
          </header>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            {LINES.map(({ id, valueStream }) => (
              <AdminLineCard
                key={id}
                lineId={id}
                label={LINE_ADMIN_LABELS[id] ?? id}
                schedule={stateFor(id)?.schedule ?? null}
                queuedSchedules={stateFor(id)?.queue ?? []}
                savedTarget={adminConfig[id]?.target}
                savedHeadcount={adminConfig[id]?.headcount}
                savedIsRunning={adminConfig[id]?.isRunning}
                skippedItems={stateFor(id)?.skippedItems ?? []}
                onScheduleLoaded={handleScheduleLoaded}
                onConfigSaved={handleConfigSaved}
                onRemoveQueued={handleRemoveQueued}
                onClearSchedule={handleClearSchedule}
                onSkipOrder={handleSkipOrder}
                onUnskipOrder={handleUnskipOrder}
              />
            ))}
          </div>

          {/* Master Controls */}
          <section className="bg-surface/40 rounded-sm border border-border/30 p-8 flex flex-col justify-center gap-6">
            <div>
              <h3 className="font-['Space_Grotesk',sans-serif] text-xl font-bold mb-2">Master Controls</h3>
              <p className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest leading-loose">
                All changes are logged with operator ID. Permanent deletion of historical data cannot be undone via this interface.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                title="Coming Soon"
                className="flex-1 bg-surface-highest text-[#e1e2ec]/30 font-black py-4 rounded-sm text-xs uppercase tracking-[0.2em] cursor-not-allowed pointer-events-none select-none"
              >
                Save All Config (Coming Soon)
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 bg-surface-highest text-[#e1e2ec] hover:bg-status-red/10 hover:text-status-red hover:border-status-red/40 transition-all font-black py-4 rounded-sm border border-border text-xs uppercase tracking-[0.2em]"
              >
                Reset All MES Data
              </button>
            </div>
            <div className="bg-background p-4 border-l-4 border-accent/20 flex items-start gap-4">
              <span className="material-symbols-outlined text-accent/60">info</span>
              <div>
                <p className="text-[10px] font-bold text-[#e1e2ec]/60 uppercase mb-1">Last Configuration Sync</p>
                <p className="text-xs text-[#e1e2ec]/40 tabular-nums">2026-03-28 09:12:44 - User: ADMIN_01</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminLayout>
      <AdminPageContent />
    </AdminLayout>
  );
}
