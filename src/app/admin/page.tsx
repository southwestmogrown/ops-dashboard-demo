"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import type { AdminLineConfig, LineSchedule, LineState } from "@/lib/mesTypes";
import type { ShiftName } from "@/lib/types";
import { LINES, LINE_ADMIN_LABELS } from "@/lib/lines";
import Header from "@/components/Header";
import AdminLayout from "@/components/admin/AdminLayout";
import SidebarNav, { SidebarNavItem } from "@/components/SidebarNav";
import { useRedirectTeamLead } from "@/hooks/useRedirectTeamLead";

const SIDE_NAV_ITEMS: SidebarNavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/admin", label: "Admin", icon: "factory" },
];

const AdminLineCard = dynamic(
  () => import("@/components/admin/AdminLineCard"),
  { ssr: false },
);

function AdminPageContent() {
  const pathname = usePathname();
  useRedirectTeamLead();

  const [mesStates, setMesStates] = useState<LineState[]>([]);
  const [adminConfig, setAdminConfig] = useState<
    Record<string, AdminLineConfig>
  >({});
  const [now, setNow] = useState<Date>(new Date());
  const [savingAll, setSavingAll] = useState(false);
  const [shift, setShift] = useState<ShiftName>("day");
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Refs for each line card — allows Save All to trigger each card's save
  const cardRefs = useRef<Record<string, { save: () => Promise<void> } | null>>(
    {},
  );

  const refresh = useCallback(async () => {
    const [stateRes, configRes] = await Promise.all([
      fetch("/api/mes/state"),
      fetch("/api/admin/config"),
    ]);
    if (stateRes.ok) setMesStates(await stateRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
    setLastSync(new Date());
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
    isRunning: boolean,
    supervisorName: string,
  ) {
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineId,
        target,
        headcount,
        isRunning,
        supervisorName,
      }),
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
    const confirmed = confirm(
      "Clear all schedules and MES data? This cannot be undone.",
    );
    if (confirmed) {
      await fetch("/api/mes/reset", { method: "POST" });
      await refresh();
    }
  }

  async function handleSaveAll() {
    setSavingAll(true);
    await Promise.all(LINES.map(({ id }) => cardRefs.current[id]?.save()));
    await refresh();
    setSavingAll(false);
  }

  const totalTarget = Object.values(adminConfig).reduce(
    (sum, cfg) => sum + (cfg.target || 0),
    0,
  );
  const totalHeadcount = Object.values(adminConfig).reduce(
    (sum, cfg) => sum + (cfg.headcount || 0),
    0,
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">
      {/* ── Header ── */}
      <Header
        shift={shift}
        onShiftChange={setShift}
      />

      <div className="flex flex-1 overflow-hidden">
        <SidebarNav items={SIDE_NAV_ITEMS} activePath={pathname} />

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-background">
          {/* Header */}
          <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="font-['Space_Grotesk',sans-serif] text-4xl font-bold tracking-tight mb-2">
                Configuration
              </h1>
              <p className="text-[#e1e2ec]/60 max-w-xl text-sm leading-relaxed">
                Daily target and headcount per production line.
              </p>
            </div>
            <div className="flex gap-4 items-center bg-surface-low p-4 rounded-sm border-l-2 border-accent">
              <div className="flex flex-col pr-6 border-r border-border">
                <span className="text-[10px] uppercase font-bold tracking-widest text-accent mb-1">
                  Shift Targets
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
                    {totalTarget.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-medium">
                    units
                  </span>
                </div>
              </div>
              <div className="flex flex-col pl-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-status-green mb-1">
                  Global Headcount
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tabular-nums">
                    {totalHeadcount}
                  </span>
                  <span className="text-[10px] text-[#e1e2ec]/40 font-medium">
                    OPS
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            {LINES.map(({ id, valueStream }) => (
              <AdminLineCard
                key={id}
                ref={(el: { save: () => Promise<void> } | null) => {
                  cardRefs.current[id] = el;
                }}
                lineId={id}
                label={LINE_ADMIN_LABELS[id] ?? id}
                schedule={stateFor(id)?.schedule ?? null}
                queuedSchedules={stateFor(id)?.queue ?? []}
                savedTarget={adminConfig[id]?.target}
                savedHeadcount={adminConfig[id]?.headcount}
                savedIsRunning={adminConfig[id]?.isRunning}
                savedSupervisorName={adminConfig[id]?.supervisorName}
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
              <h3 className="font-['Space_Grotesk',sans-serif] text-xl font-bold mb-2">
                Master Controls
              </h3>
              <p className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest leading-loose">
                All changes are logged with operator ID. Permanent deletion of
                historical data cannot be undone via this interface.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleSaveAll}
                disabled={savingAll}
                className="flex-1 bg-accent text-black font-black py-4 rounded-sm text-xs uppercase tracking-[0.2em] hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAll ? "Saving…" : "Save All Config"}
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 bg-surface-highest text-[#e1e2ec] hover:bg-status-red/10 hover:text-status-red hover:border-status-red/40 transition-all font-black py-4 rounded-sm border border-border text-xs uppercase tracking-[0.2em]"
              >
                Reset All MES Data
              </button>
            </div>
            <div className="bg-background p-4 border-l-4 border-accent/20 flex items-start gap-4">
              <span className="material-symbols-outlined text-accent/60">
                info
              </span>
              <div>
                <p className="text-[10px] font-bold text-[#e1e2ec]/60 uppercase mb-1">
                  Last Configuration Sync
                </p>
                <p className="text-xs text-[#e1e2ec]/40 tabular-nums">
                  {lastSync
                    ? `${lastSync.toLocaleDateString("en-GB")} ${lastSync.toLocaleTimeString("en-GB")}`
                    : "Never"}
                </p>
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
