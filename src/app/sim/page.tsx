"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { AdminLineConfig, LineState } from "@/lib/mesTypes";
import { useAuth } from "@/hooks/useAuth";
import type { ShiftName } from "@/lib/types";
import { LINES, LINE_LABELS, getDefaultTarget } from "@/lib/lines";
import { getShiftWindows } from "@/lib/shiftTime";

const HourlyTable = dynamic(() => import("@/components/sim/HourlyTable"), {
  ssr: false,
});

const SIDE_NAV: { icon: string; label: string; href?: string }[] = [
  { icon: "dashboard", label: "Dashboard", href: "/" },
  { icon: "factory", label: "Admin", href: "/admin" },
];

const SPEED_OPTIONS = [
  { label: "1×", value: 60, desc: "Realtime" },
  { label: "5×", value: 300, desc: "Medium" },
  { label: "15×", value: 900, desc: "Fast" },
] as const;

function unitsForSpeed(speed: number): number {
  // Fractional units are accumulated server-side so 1x stays realistic without starving output.
  return speed / 100;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SimPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, logout } = useAuth();

  // Team-lead route guard
  useEffect(() => {
    if (role === "team-lead") {
      router.push("/team-lead");
    }
  }, [role, router]);

  const [states, setStates] = useState<LineState[]>([]);
  const [adminConfig, setAdminConfig] = useState<
    Record<string, AdminLineConfig>
  >({});
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(60);
  const speedRef = useRef(speed); // always mirrors speed; used in interval closures
  const [shift, setShift] = useState<ShiftName>("day");
  const [simClock, setSimClock] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRequestId = useRef(0);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Polling ─────────────────────────────────────────────────────────────────
  const pollState = useCallback(async () => {
    const requestId = ++pollRequestId.current;
    const [stateRes, clockRes, configRes] = await Promise.all([
      fetch("/api/mes/state", { cache: "no-store" }),
      fetch("/api/sim/clock", { cache: "no-store" }),
      fetch("/api/admin/config", { cache: "no-store" }),
    ]);
    if (requestId !== pollRequestId.current) return;
    if (stateRes.ok) setStates(await stateRes.json());
    if (configRes.ok) setAdminConfig(await configRes.json());
    if (clockRes.ok) {
      const c = await clockRes.json();
      setRunning(c.running);
      setSpeed(c.speed);
      speedRef.current = c.speed; // keep ref in sync so interval uses latest speed
      setSimClock(c.clock ? new Date(c.clock) : null);
    }
  }, []);

  useEffect(() => {
    const initialPoll = setTimeout(() => {
      void pollState();
    }, 0);
    pollInterval.current = setInterval(pollState, 2000);
    return () => {
      clearTimeout(initialPoll);
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [pollState]);

  // ── Simulation controls ─────────────────────────────────────────────────────
  async function startSim() {
    if (tickInterval.current) return;
    const shiftStart = new Date();
    shiftStart.setUTCHours(getShiftWindows(shift).startHour, 0, 0, 0);
    await fetch("/api/sim/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clock: shiftStart.toISOString(),
        running: true,
        speed: speedRef.current,
      }),
    });
    setRunning(true);
    tickInterval.current = setInterval(async () => {
      // Scale units with speed so production stays in a realistic band while
      // still accelerating smoothly at higher sim speeds.
      const units = unitsForSpeed(speedRef.current);
      const res = await fetch("/api/mes/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, units }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stopped) {
          // Server reached shift end — stop the client interval.
          if (tickInterval.current) {
            clearInterval(tickInterval.current);
            tickInterval.current = null;
          }
          setRunning(false);
          await pollState();
        }
      }
    }, 1000);
    await pollState();
  }

  async function pauseSim() {
    if (tickInterval.current) {
      clearInterval(tickInterval.current);
      tickInterval.current = null;
    }
    await fetch("/api/sim/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ running: false }),
    });
    setRunning(false);
    await pollState();
  }

  async function resetSim() {
    if (tickInterval.current) {
      clearInterval(tickInterval.current);
      tickInterval.current = null;
    }
    await Promise.all([
      fetch("/api/sim/reset", { method: "POST" }),
      fetch("/api/sim/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock: null, running: false }),
      }),
    ]);
    setSimClock(null);
    setRunning(false);
    setSpeed(60);
    speedRef.current = 60;
    await pollState();
  }

  async function handleSpeedChange(newSpeed: number) {
    speedRef.current = newSpeed;
    setSpeed(newSpeed);
    await fetch("/api/sim/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: newSpeed }),
    });
  }

  useEffect(() => {
    return () => {
      if (tickInterval.current) clearInterval(tickInterval.current);
    };
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────
  const { totalOutput, totalTarget, scheduledLines, efficiency } =
    useMemo(() => {
      const runningLineIds = LINES.map((line) => line.id).filter(
        (lineId) => adminConfig[lineId]?.isRunning !== false,
      );

      const totalOutput = states
        .filter((st) => runningLineIds.includes(st.lineId))
        .reduce((sum, st) => sum + st.totalOutput, 0);

      const totalTarget = runningLineIds.reduce(
        (sum, lineId) =>
          sum + (adminConfig[lineId]?.target ?? getDefaultTarget(lineId)),
        0,
      );

      const scheduledLines = states.filter(
        (s) => runningLineIds.includes(s.lineId) && s.schedule !== null,
      ).length;

      const efficiency =
        totalTarget > 0
          ? Math.round((totalOutput / totalTarget) * 1000) / 10
          : 0;
      return { totalOutput, totalTarget, scheduledLines, efficiency };
    }, [states, adminConfig]);

  const stateMap = useMemo(
    () => new Map(states.map((s) => [s.lineId, s])),
    [states],
  );

  const { speedLabel, speedDesc } = useMemo(() => {
    const opt = SPEED_OPTIONS.find((o) => o.value === speed);
    return { speedLabel: opt?.label ?? `${speed}`, speedDesc: opt?.desc ?? "" };
  }, [speed]);

  // ── Hourly production bars data (extracted from IIFE) ───────────────────────
  const hourlyBars = useMemo(() => {
    const hourMap: Record<string, number> = {};
    for (const st of states) {
      for (const [hour, count] of Object.entries(st.hourlyOutput)) {
        hourMap[hour] = (hourMap[hour] ?? 0) + count;
      }
    }
    const hours = Object.keys(hourMap).sort();
    const maxHourly = Math.max(1, ...Object.values(hourMap));
    return { hourMap, hours, maxHourly };
  }, [states]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-[#e1e2ec]">
      {/* ── Header ── */}
      <Header
        shift={shift}
        onShiftChange={setShift}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 bg-surface-low flex flex-col border-r border-border/10 hidden lg:flex">
          <div className="p-6 flex items-center space-x-3 border-b border-border/10">
            <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center border border-accent/20">
              <span
                className="material-symbols-outlined text-accent"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                precision_manufacturing
              </span>
            </div>
            <div>
              <h2 className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif] uppercase leading-none">
                OP-CENTER
              </h2>
              <p className="text-[10px] text-status-green font-medium tracking-tighter uppercase">
                {running ? "Simulation Active" : "Standby"}
              </p>
            </div>
          </div>
          <nav className="flex-1 py-4 text-sm font-medium uppercase tracking-widest overflow-y-auto">
            {SIDE_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href ?? "#"}
                  className={`flex items-center space-x-3 px-4 py-3 ${
                    isActive
                      ? "text-accent bg-surface-high border-l-4 border-accent"
                      : "text-[#e1e2ec]/40 hover:bg-surface-high/50 hover:text-[#e1e2ec] border-l-4 border-transparent transition-colors"
                  }`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-background">
          {/* ── Simulator Control Bar + Status Bento ─────────────────────────── */}
          <section className="grid grid-cols-12 gap-6 mb-10">
            {/* Control Panel — left 7 cols */}
            <div className="col-span-12 lg:col-span-7 bg-surface-low rounded-sm p-6 border-l-4 border-accent relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[120px]">
                  play_circle
                </span>
              </div>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold uppercase tracking-tight">
                    MES Simulator
                  </h3>
                  <p className="text-[#e1e2ec]/40 text-xs font-medium uppercase tracking-widest">
                    Global Master Controls
                  </p>
                </div>
                <div className="flex gap-2">
                  {!running ? (
                    <button
                      onClick={startSim}
                      className="px-4 py-2 bg-accent text-black rounded-sm font-bold text-xs uppercase flex items-center gap-2 hover:opacity-90 transition-colors cursor-pointer border-none"
                    >
                      <span
                        className="material-symbols-outlined text-sm"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        play_arrow
                      </span>
                      Start
                    </button>
                  ) : (
                    <button
                      onClick={pauseSim}
                      className="px-4 py-2 bg-surface-highest text-[#e1e2ec] rounded-sm font-bold text-xs uppercase flex items-center gap-2 border border-border/30 hover:bg-surface-high transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">
                        pause
                      </span>
                      Pause
                    </button>
                  )}
                  <button
                    onClick={resetSim}
                    className="px-4 py-2 bg-surface-highest text-[#e1e2ec] rounded-sm font-bold text-xs uppercase flex items-center gap-2 border border-border/30 hover:bg-surface-high transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">
                      refresh
                    </span>
                    Reset
                  </button>
                </div>
              </div>

              {/* Speed slider area */}
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs uppercase font-bold tracking-widest text-[#e1e2ec]/40">
                  <span>Simulation Speed</span>
                  <span className="text-accent">
                    Current: {speedLabel} ({speedDesc})
                  </span>
                </div>
                <div className="flex gap-2">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSpeedChange(opt.value)}
                      className={`flex-1 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${
                        speed === opt.value
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                      }`}
                    >
                      {opt.label} · {opt.desc}
                    </button>
                  ))}
                </div>

                {/* Shift selector */}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-[10px] uppercase tracking-widest text-[#e1e2ec]/40 font-bold">
                    Shift
                  </span>
                  {(["day", "night"] as ShiftName[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setShift(s)}
                      className={`px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${
                        shift === s
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-transparent text-[#e1e2ec]/40 border-border hover:border-[#e1e2ec]/30"
                      }`}
                    >
                      {s}
                    </button>
                  ))}

                  {simClock && (
                    <div className="ml-auto flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      <span className="font-mono text-accent">
                        {simClock.getHours().toString().padStart(2, "0")}:
                        {simClock.getMinutes().toString().padStart(2, "0")}
                      </span>
                      <span className="text-[#e1e2ec]/30">sim clock</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status Bento — right 5 cols */}
            <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-4">
              <div className="bg-surface p-4 rounded-sm flex flex-col justify-between border-t-2 border-status-green">
                <span className="text-[10px] font-bold uppercase tracking-widest text-status-green">
                  Output %
                </span>
                <span className="font-['Space_Grotesk',sans-serif] text-4xl font-light tabular-nums">
                  {efficiency}
                  <span className="text-lg opacity-40">%</span>
                </span>
                <div className="h-1 w-full bg-surface-highest mt-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-green transition-all duration-500"
                    style={{ width: `${Math.min(efficiency, 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-surface p-4 rounded-sm flex flex-col justify-between border-t-2 border-accent">
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  Total Output
                </span>
                <span className="font-['Space_Grotesk',sans-serif] text-4xl font-light tabular-nums">
                  {totalOutput.toLocaleString()}
                </span>
                <span className="text-[10px] text-[#e1e2ec]/40 mt-2 font-mono">
                  / {totalTarget.toLocaleString()} target
                </span>
              </div>
              <div className="col-span-2 bg-surface p-4 rounded-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e1e2ec]/40">
                    {running
                      ? "Simulation Running"
                      : scheduledLines > 0
                        ? "Simulation Paused"
                        : "No Schedules Loaded"}
                  </span>
                  <div className="font-['Space_Grotesk',sans-serif] text-xl font-medium flex items-center gap-2 mt-0.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${running ? "bg-status-green animate-pulse" : "bg-[#e1e2ec]/20"}`}
                    />
                    {scheduledLines} / {LINES.length}{" "}
                    <span className="text-sm opacity-50">Lines Active</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-accent/20 text-4xl">
                  timer
                </span>
              </div>
            </div>
          </section>

          {/* ── Empty state ──────────────────────────────────────────────────── */}
          {scheduledLines === 0 && (
            <div className="bg-surface-low rounded-sm p-12 text-center border border-border/10">
              <span className="material-symbols-outlined text-5xl text-[#e1e2ec]/10 mb-4 block">
                upload_file
              </span>
              <p className="text-sm text-[#e1e2ec]/40 mb-2">
                No run sheets loaded
              </p>
              <p className="text-xs text-[#e1e2ec]/25">
                Load run sheets from the{" "}
                <Link href="/admin" className="text-accent hover:underline">
                  Admin panel
                </Link>
                , then use the controls above to simulate production.
              </p>
            </div>
          )}

          {/* ── Lines + Scan Log / Hourly Production ─────────────────────────── */}
          {scheduledLines > 0 && (
            <div className="grid grid-cols-12 gap-10">
              {/* Left: Assembly Line Cards + Scan Log */}
              <div className="col-span-12 xl:col-span-8 space-y-10">
                {/* Assembly Line Cards */}
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-border/10 pb-2">
                    <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold uppercase tracking-widest">
                      Active Assembly Lines
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border font-bold uppercase ${
                        running
                          ? "text-status-green bg-status-green/10 border-status-green/20"
                          : "text-[#e1e2ec]/40 bg-surface-highest border-border"
                      }`}
                    >
                      {running ? "All Systems Running" : "Paused"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {LINES.map(({ id, name, valueStream }) => {
                      const st = stateMap.get(id);
                      if (!st?.schedule) return null;
                      const pct =
                        st.schedule.totalTarget > 0
                          ? Math.round(
                              (st.totalOutput / st.schedule.totalTarget) * 100,
                            )
                          : 0;
                      const isComplete = pct >= 100;
                      const isBehind = pct < 50 && st.totalOutput > 0;
                      const statusColor = isComplete
                        ? "bg-status-green"
                        : isBehind
                          ? "bg-status-amber"
                          : "bg-accent";
                      const statusLabel = isComplete
                        ? "Complete"
                        : isBehind
                          ? "Behind"
                          : "Nominal";
                      const statusTextColor = isComplete
                        ? "text-status-green"
                        : isBehind
                          ? "text-status-amber"
                          : "text-accent";

                      return (
                        <div
                          key={id}
                          className="bg-surface-low p-5 rounded-sm border border-border/5 hover:border-accent/20 transition-all group relative"
                        >
                          <div
                            className={`absolute top-0 left-0 w-1 h-full ${statusColor}`}
                          />
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="font-['Space_Grotesk',sans-serif] font-bold leading-none mb-1">
                                {valueStream} · {name}
                              </h4>
                              <p className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest">
                                Order: {st.currentOrder ?? "Complete"}
                              </p>
                              {st.completedOrders > 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-[9px] text-[#e1e2ec]/35 uppercase tracking-widest">
                                    Changeovers
                                  </span>
                                  <div className="flex items-end gap-1">
                                    {Array.from({
                                      length: Math.min(st.completedOrders, 8),
                                    }).map((_, idx) => (
                                      <span
                                        key={idx}
                                        className="h-3 border-l border-dotted border-status-amber/80"
                                      />
                                    ))}
                                  </div>
                                  <span className="text-[10px] font-mono text-status-amber/80">
                                    {st.completedOrders}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span
                              className={`${statusTextColor} bg-current/10 text-[10px] font-black px-2 py-0.5 border rounded uppercase`}
                              style={{
                                borderColor: "currentColor",
                                backgroundColor: "transparent",
                              }}
                            >
                              <span className={statusTextColor}>
                                {statusLabel}
                              </span>
                            </span>
                          </div>
                          <div className="space-y-3 mb-4">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-[#e1e2ec]/40">
                                Progress
                              </span>
                              <span>
                                {st.totalOutput} / {st.schedule.totalTarget}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-surface-highest rounded-full overflow-hidden">
                              <div
                                className={`h-full ${statusColor} transition-all duration-500`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                          {st.remainingOnOrder > 0 && (
                            <div className="text-[10px] text-[#e1e2ec]/30 font-mono">
                              {st.remainingOnOrder} remaining on order ·{" "}
                              {st.remainingOnRunSheet} on sheet
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Scan Log (hourly output summary) */}
                <div className="bg-surface-low rounded-sm overflow-hidden border border-border/10">
                  <div className="bg-surface-highest px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-accent">
                        analytics
                      </span>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em]">
                        Hourly Output Summary
                      </h3>
                    </div>
                    <div className="flex gap-4">
                      {running && (
                        <span className="text-[10px] font-mono text-status-green uppercase">
                          Scanning...
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-[#e1e2ec]/40 uppercase">
                        {totalOutput} total scans
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <HourlyTable states={states} lineLabels={LINE_LABELS} />
                  </div>
                </div>
              </div>

              {/* Right: Hourly Production Bars + Sim Info */}
              <div className="col-span-12 xl:col-span-4 space-y-6">
                {/* Hourly Production Bars */}
                <div className="bg-surface rounded-sm p-6 border border-border/10">
                  <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-bold uppercase tracking-widest mb-6">
                    Hourly Production
                  </h3>
                  <div className="space-y-4">
                    {hourlyBars.hours.length === 0 ? (
                      <p className="text-[10px] text-[#e1e2ec]/30 text-center py-4">
                        No output yet — start the simulation.
                      </p>
                    ) : (
                      hourlyBars.hours.map((hour, i) => {
                        const actual = hourlyBars.hourMap[hour];
                        const pct = Math.round(
                          (actual / hourlyBars.maxHourly) * 100,
                        );
                        const nextHour =
                          String((parseInt(hour) + 1) % 24).padStart(2, "0") +
                          ":00";
                        const isCurrent =
                          i === hourlyBars.hours.length - 1 && running;

                        return (
                          <div key={hour} className="relative">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-2">
                              <span className="text-[#e1e2ec]/40">
                                {hour} – {nextHour}
                                {isCurrent && " (Current)"}
                              </span>
                              <span
                                className={
                                  isCurrent
                                    ? "text-accent"
                                    : "text-status-green"
                                }
                              >
                                Actual: {actual}
                              </span>
                            </div>
                            <div className="w-full h-8 bg-surface-low rounded-sm overflow-hidden flex items-center px-1">
                              <div
                                className={`h-6 ${isCurrent ? "bg-accent/20 border-r-2 border-accent" : "bg-status-green/20 border-r-2 border-status-green"} flex items-center px-3 transition-all duration-500`}
                                style={{ width: `${Math.max(pct, 5)}%` }}
                              >
                                <span
                                  className={`text-[10px] font-mono ${isCurrent ? "text-accent" : "text-status-green"}`}
                                >
                                  {isCurrent ? "IN PROGRESS" : "COMPLETE"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {totalTarget > 0 && (
                    <div className="mt-8 pt-6 border-t border-border/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase text-[#e1e2ec]/40">
                          Output vs Target
                        </span>
                        <span className="text-xs font-mono">{efficiency}%</span>
                      </div>
                      <div className="w-full h-1 bg-surface-low rounded-full overflow-hidden">
                        <div
                          className="h-full bg-status-green transition-all duration-500"
                          style={{
                            width: `${Math.min(efficiency, 100)}%`,
                            boxShadow: "0 0 10px rgba(34,197,94,0.5)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulation Info Card */}
                <div className="glass-panel rounded-sm p-6 border border-white/5 relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-5">
                    <span className="material-symbols-outlined text-[120px]">
                      science
                    </span>
                  </div>
                  <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-sm uppercase tracking-widest mb-2">
                    Simulation Details
                  </h4>
                  <p className="text-xs text-[#e1e2ec]/50 leading-relaxed mb-4">
                    Running MES Simulation. Speed:{" "}
                    <span className="text-accent font-mono">{speedLabel}</span>.{" "}
                    {scheduledLines} line{scheduledLines !== 1 ? "s" : ""} with
                    active schedules.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 p-3 rounded-sm">
                      <p className="text-[9px] uppercase text-[#e1e2ec]/40 font-bold mb-1">
                        Speed
                      </p>
                      <p className="text-sm font-mono">{speedDesc}</p>
                    </div>
                    <div className="bg-black/20 p-3 rounded-sm">
                      <p className="text-[9px] uppercase text-[#e1e2ec]/40 font-bold mb-1">
                        Tick Rate
                      </p>
                      <p className="text-sm font-mono">
                        {unitsForSpeed(speed).toFixed(1)} units/tick
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick link to Admin */}
                <Link
                  href="/admin"
                  className="block bg-surface-low rounded-sm p-5 border border-border/10 hover:border-accent/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-accent/40 group-hover:text-accent transition-colors">
                      upload_file
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest">
                        Admin Panel
                      </p>
                      <p className="text-[10px] text-[#e1e2ec]/30">
                        Upload run sheets & configure lines
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[#e1e2ec]/20 ml-auto text-sm">
                      arrow_forward
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
