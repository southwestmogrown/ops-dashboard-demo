"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Line as LineData } from "@/lib/types/core";
import type { AdminLineConfig, LineState } from "@/lib/types/mes";
import type { DowntimeEntry } from "@/lib/types/downtime";
import { DOWNTIME_REASON_LABELS } from "@/lib/types/downtime";
import type { ShiftProgress } from "@/lib/shiftTime";
import { getHourlyTargets } from "@/lib/shiftBreaks";
import {
  getFpyColor,
  getHpuColor,
  getPaceColor,
  getOeeColor,
  getStatusReasons,
  calcLinePace,
} from "@/lib/status";
import type { ShiftName } from "@/lib/types/core";

interface LineDrawerProps {
  line: LineData | null;
  mesState: LineState | null;
  shiftProgress: ShiftProgress;
  onClose: () => void;
  /** Override clock time (from sim clock); falls back to real time */
  nowOverride?: Date | null;
  adminConfig?: Record<string, AdminLineConfig>;
  shift: ShiftName;
}

type DrawerTab = "output" | "oee" | "hpu" | "downtime";

function buildMesHourlyData(hourlyOutput: Record<string, number>) {
  return Object.entries(hourlyOutput)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, output]) => ({ time, output }));
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#131720",
    border: "1px solid #1e2433",
    borderRadius: "4px",
    fontSize: "12px",
  },
  labelStyle: { color: "#e1e2ec", opacity: 0.5 },
  itemStyle: { color: "#e1e2ec" },
};

const DOWNTIME_BADGE_COLORS: Record<string, string> = {
  "machine-failure": "bg-status-red/20 text-status-red border-status-red/30",
  "material-shortage":
    "bg-status-amber/20 text-status-amber border-status-amber/30",
  "quality-hold": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "planned-maintenance": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "operator-break": "bg-[#e1e2ec]/10 text-[#e1e2ec]/60 border-[#e1e2ec]/20",
  "safety-stop": "bg-status-red/20 text-status-red border-status-red/30",
  changeover: "bg-vs2/20 text-vs2 border-vs2/30",
  other: "bg-[#e1e2ec]/10 text-[#e1e2ec]/40 border-[#e1e2ec]/20",
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function DowntimeTimeline({ entries }: { entries: DowntimeEntry[] }) {
  const [now, setNow] = useState(() => new Date());

  // Tick live elapsed time for ongoing events
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(interval);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="material-symbols-outlined text-[#e1e2ec]/10 text-4xl mb-2">
          event_busy
        </span>
        <p className="text-xs text-[#e1e2ec]/30">
          No downtime logged this shift
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const isOngoing = entry.endTime === null;
        const start = new Date(entry.startTime);
        const end = isOngoing ? now : new Date(entry.endTime!);
        const elapsedMs = end.getTime() - start.getTime();
        const durationMin = Math.floor(elapsedMs / 60000);

        return (
          <div
            key={entry.id}
            className={`relative pl-4 border-l-2 ${
              isOngoing ? "border-status-red" : "border-border"
            }`}
          >
            {isOngoing && (
              <span className="absolute top-0 -left-[9px] w-2 h-2 rounded-full bg-status-red animate-pulse" />
            )}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex flex-col gap-1">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-bold uppercase tracking-widest ${DOWNTIME_BADGE_COLORS[entry.reason] ?? DOWNTIME_BADGE_COLORS["other"]}`}
                >
                  {DOWNTIME_REASON_LABELS[entry.reason] ?? entry.reason}
                </span>
                {entry.notes && (
                  <p className="text-[10px] text-[#e1e2ec]/50 italic">
                    {entry.notes}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                {isOngoing ? (
                  <span className="text-[10px] font-bold text-status-red animate-pulse">
                    ONGOING
                  </span>
                ) : (
                  <span className="text-[10px] text-[#e1e2ec]/40">
                    {formatDuration(durationMin)}
                  </span>
                )}
              </div>
            </div>

            {/* Time range */}
            <p className="text-[10px] font-mono text-[#e1e2ec]/40">
              {start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" → "}
              {isOngoing ? (
                <span className="text-status-red/60">ongoing</span>
              ) : (
                end.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              )}
            </p>

            {/* Duration bar */}
            <div className="mt-1.5 w-full bg-surface-highest rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isOngoing ? "bg-status-red/60 animate-pulse" : "bg-accent/60"}`}
                style={{
                  width: isOngoing
                    ? "100%"
                    : `${Math.min(100, (durationMin / 120) * 100)}%`,
                }}
              />
            </div>

            {entry.unitsLost > 0 && (
              <p className="text-[9px] text-status-amber/70 mt-0.5">
                {entry.unitsLost} units lost
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LineDrawer({
  line,
  mesState,
  shiftProgress,
  onClose,
  nowOverride,
  adminConfig,
  shift,
}: LineDrawerProps) {
  const isOpen = line !== null;
  const [activeTab, setActiveTab] = useState<DrawerTab>("output");
  const [downtimeEntries, setDowntimeEntries] = useState<DowntimeEntry[]>([]);

  // ─── Dynamic status label ─────────────────────────────────────────────────────
  const statusLabel = (() => {
    if (!line) return null;
    const isRunning = adminConfig?.[line.id]?.isRunning;
    const plannedHc = adminConfig?.[line.id]?.headcount;

    const reasons = getStatusReasons(
      line,
      mesState ?? undefined,
      shiftProgress,
      plannedHc,
      false,
      isRunning,
    );

    const pace = calcLinePace(
      mesState?.schedule ? mesState.totalOutput : line.output,
      shiftProgress.elapsedHours,
      shiftProgress.totalHours,
    );
    const paceRatio = pace !== null ? pace / line.target : null;

    if (!mesState?.schedule) {
      return {
        text: "NO SCHEDULE",
        bg: "bg-slate-500/20",
        textColor: "text-slate-400",
        border: "border-slate-500/30",
      };
    }
    if (paceRatio !== null && paceRatio < 0.75) {
      const primary = reasons[0] ?? "Behind pace";
      return {
        text: `STOPPED — ${primary}`,
        bg: "bg-status-red/20",
        textColor: "text-status-red",
        border: "border-status-red/30",
      };
    }
    if (reasons.length > 0) {
      const primary = reasons[0] ?? "At risk";
      return {
        text: `AT RISK — ${primary}`,
        bg: "bg-status-amber/20",
        textColor: "text-status-amber",
        border: "border-status-amber/30",
      };
    }
    return {
      text: "ON TRACK",
      bg: "bg-status-green/20",
      textColor: "text-status-green",
      border: "border-status-green/30",
    };
  })();

  // ─── Contact info ────────────────────────────────────────────────────────────
  const supervisorName = line
    ? adminConfig?.[line.id]?.supervisorName
    : undefined;
  const hasContact = Boolean(supervisorName);

  // ─── Downtime fetch (when tab is active) ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || activeTab !== "downtime" || !line) return;
    fetch(`/api/downtime?lineId=${line.id}&shift=${shift}`)
      .then((r) => r.json())
      .then((data: DowntimeEntry[]) => setDowntimeEntries(data))
      .catch(() => setDowntimeEntries([]));
  }, [isOpen, activeTab, line?.id, shift]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Only show charts when MES has actual data
  const hasMesData = mesState && mesState.schedule !== null;
  const hasMesHourly =
    mesState && Object.keys(mesState.hourlyOutput).length > 0;
  const hourlyBarData = useMemo(
    () => (hasMesHourly ? buildMesHourlyData(mesState!.hourlyOutput) : []),
    [hasMesHourly, mesState?.hourlyOutput],
  );

  // Hourly target reference line value
  const hourlyTargetValue = useMemo(() => {
    if (!line || !hasMesHourly) return null;
    const rows = getHourlyTargets(
      line.target,
      shift,
      mesState?.hourlyOutput ?? {},
    );
    const nonBreakRows = rows.filter((r) => !r.isBreak && r.planned > 0);
    if (nonBreakRows.length === 0) return null;
    return Math.round(
      nonBreakRows.reduce((s, r) => s + r.planned, 0) / nonBreakRows.length,
    );
  }, [line, hasMesHourly, mesState?.hourlyOutput, shift]);

  const linePace =
    shiftProgress.elapsedHours >= 0.25
      ? Math.round(
          ((mesState?.schedule ? mesState.totalOutput : (line?.output ?? 0)) /
            shiftProgress.elapsedHours) *
            shiftProgress.totalHours,
        )
      : null;

  const etaInfo = (() => {
    if (
      !mesState ||
      mesState.remainingOnOrder <= 0 ||
      shiftProgress.elapsedHours < 0.25
    )
      return null;
    const output = mesState.schedule
      ? mesState.totalOutput
      : (line?.output ?? 0);
    if (output === 0) return null;
    const uph = output / shiftProgress.elapsedHours;
    if (uph === 0) return null;
    const minutesLeft = Math.ceil((mesState.remainingOnOrder / uph) * 60);
    const now = nowOverride ?? new Date();
    const etaTime = new Date(now.getTime() + minutesLeft * 60_000);
    return { etaTime, minutesLeft };
  })();

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: "output", label: "Output" },
    { id: "oee", label: "OEE" },
    { id: "hpu", label: "HPU" },
    { id: "downtime", label: "Downtime" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out glass panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-[480px] glass-panel overflow-hidden z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={
          line ? `${line.valueStream} ${line.name} details` : "Line details"
        }
      >
        {line && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <p className="text-[10px] text-[#e1e2ec]/40 uppercase tracking-widest font-bold">
                  {line.valueStream}
                </p>
                <h2 className="text-xl font-bold font-['Space_Grotesk',sans-serif] uppercase text-accent">
                  {line.valueStream} · {line.name}
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5">
                  {statusLabel && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[9px] font-bold tracking-widest ${statusLabel.bg} ${statusLabel.textColor} ${statusLabel.border}`}
                    >
                      {statusLabel.text}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-[#e1e2ec]/40 hover:text-[#e1e2ec] transition-colors p-1 rounded-sm"
                aria-label="Close drawer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Contact strip */}
            {hasContact && (
              <div className="flex gap-4 px-5 py-2 border-b border-border/50 bg-background/50 shrink-0">
                {supervisorName && (
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#e1e2ec]/30 text-sm">
                      person
                    </span>
                    <span className="text-[10px] text-[#e1e2ec]/50">
                      {supervisorName}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Metric summary strip */}
            <div className="grid grid-cols-5 gap-3 p-5 border-b border-border shrink-0">
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  Output
                </p>
                <p className="text-xl font-semibold font-['Space_Grotesk',sans-serif]">
                  {line.output}
                </p>
                <p className="text-xs text-[#e1e2ec]/40">/ {line.target}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  OEE
                </p>
                <p
                  className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getOeeColor(line.oee * 100)}`}
                >
                  {(line.oee * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  HPU
                </p>
                <p
                  className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getHpuColor(line.hpu)}`}
                >
                  {line.hpu.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  C/O
                </p>
                <p className="text-xl font-semibold font-['Space_Grotesk',sans-serif]">
                  {line.changeovers}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-1 font-bold">
                  Pace
                </p>
                {linePace !== null ? (
                  <>
                    <p
                      className={`text-xl font-semibold font-['Space_Grotesk',sans-serif] ${getPaceColor(linePace, line.target)}`}
                    >
                      {linePace}
                    </p>
                    <p className="text-xs text-[#e1e2ec]/40">proj.</p>
                  </>
                ) : (
                  <p className="text-xl font-semibold text-[#e1e2ec]/20">—</p>
                )}
              </div>
            </div>

            {/* Active order strip */}
            {mesState?.schedule && (
              <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-background border-b border-border shrink-0">
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Active Order
                  </p>
                  <p className="text-sm font-mono text-[#e1e2ec] truncate">
                    {mesState.currentOrder ?? (
                      <span className="text-status-green">All complete</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Rem. on Order
                  </p>
                  <p className="text-sm text-[#e1e2ec]">
                    {mesState.remainingOnOrder}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    ETA
                  </p>
                  {etaInfo ? (
                    <p className="text-sm text-[#e1e2ec] font-semibold">
                      {etaInfo.etaTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-[#e1e2ec]/20">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] text-[#e1e2ec]/40 uppercase tracking-widest mb-0.5 font-bold">
                    Rem. on Sheet
                  </p>
                  <p className="text-sm text-[#e1e2ec]">
                    {mesState.remainingOnRunSheet}
                  </p>
                </div>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex border-b border-border shrink-0 px-5 bg-background/30">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-accent text-accent"
                      : "border-transparent text-[#e1e2ec]/40 hover:text-[#e1e2ec]/70"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {hasMesData ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-5 space-y-6">
                  {/* OUTPUT TAB */}
                  {activeTab === "output" && (
                    <>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                          Hourly Output
                          {hasMesHourly ? (
                            <span className="ml-2 text-accent/70 normal-case font-normal">
                              · live MES
                            </span>
                          ) : (
                            <span className="ml-2 text-[#e1e2ec]/20 normal-case font-normal">
                              · waiting for output...
                            </span>
                          )}
                        </p>
                        {hourlyBarData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart
                              data={hourlyBarData}
                              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#1e2433"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="time"
                                tick={{
                                  fill: "#e1e2ec",
                                  fillOpacity: 0.4,
                                  fontSize: 10,
                                }}
                                axisLine={{ stroke: "#1e2433" }}
                                tickLine={false}
                                interval={0}
                              />
                              <YAxis
                                tick={{
                                  fill: "#e1e2ec",
                                  fillOpacity: 0.4,
                                  fontSize: 10,
                                }}
                                axisLine={false}
                                tickLine={false}
                                width={28}
                              />
                              <Tooltip
                                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                                {...tooltipStyle}
                              />
                              {hourlyTargetValue !== null && (
                                <ReferenceLine
                                  y={hourlyTargetValue}
                                  stroke="#f97316"
                                  strokeDasharray="4 3"
                                  strokeOpacity={0.35}
                                  strokeWidth={1}
                                  label={{
                                    value: `${hourlyTargetValue}/hr`,
                                    position: "insideTopRight",
                                    fill: "#f97316",
                                    fillOpacity: 0.5,
                                    fontSize: 9,
                                  }}
                                />
                              )}
                              <Bar
                                dataKey="output"
                                name="Output"
                                fill="#f97316"
                                radius={[2, 2, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-40 flex items-center justify-center text-[#e1e2ec]/20 text-xs italic">
                            No hourly output recorded yet
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* OEE TAB */}
                  {activeTab === "oee" && line && (
                    <div className="space-y-6">
                      {/* Overall OEE */}
                      <div className="bg-surface-high rounded-sm p-4 flex flex-col items-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-1">
                          Overall Equipment Effectiveness
                        </p>
                        <p
                          className={`text-5xl font-bold font-['Space_Grotesk',sans-serif] ${getOeeColor(line.oee)}`}
                        >
                          {line.oee.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-[#e1e2ec]/30 mt-1">
                          A × P × Q
                        </p>
                      </div>

                      {/* Three-factor breakdown */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-surface-high rounded-sm p-3 flex flex-col items-center">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-2">
                            Availability
                          </p>
                          <p
                            className={`text-2xl font-bold font-['Space_Grotesk',sans-serif] ${line.availability >= 90 ? "text-status-green" : line.availability >= 80 ? "text-status-amber" : "text-status-red"}`}
                          >
                            {line.availability.toFixed(1)}%
                          </p>
                          <p className="text-[9px] text-[#e1e2ec]/30 mt-1 text-center">
                            {line.availability >= 90
                              ? "Good uptime"
                              : "Downtime losses"}
                          </p>
                        </div>
                        <div className="bg-surface-high rounded-sm p-3 flex flex-col items-center">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-2">
                            Performance
                          </p>
                          <p
                            className={`text-2xl font-bold font-['Space_Grotesk',sans-serif] ${line.performance >= 90 ? "text-status-green" : line.performance >= 80 ? "text-status-amber" : "text-status-red"}`}
                          >
                            {line.performance.toFixed(1)}%
                          </p>
                          <p className="text-[9px] text-[#e1e2ec]/30 mt-1 text-center">
                            {line.performance >= 90
                              ? "At full speed"
                              : "Speed losses"}
                          </p>
                        </div>
                        <div className="bg-surface-high rounded-sm p-3 flex flex-col items-center">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-2">
                            Quality
                          </p>
                          <p
                            className={`text-2xl font-bold font-['Space_Grotesk',sans-serif] ${getFpyColor(line.fpy)}`}
                          >
                            {line.quality.toFixed(1)}%
                          </p>
                          <p className="text-[9px] text-[#e1e2ec]/30 mt-1 text-center">
                            First-pass yield
                          </p>
                        </div>
                      </div>

                      {/* Breakdown explanation */}
                      <div className="space-y-1.5 text-[10px] text-[#e1e2ec]/30 leading-relaxed">
                        <p>
                          <span className="text-[#e1e2ec]/50 font-medium">
                            Availability
                          </span>{" "}
                          — ratio of run time vs planned shift time. Accounts
                          for downtime logged in M8.
                        </p>
                        <p>
                          <span className="text-[#e1e2ec]/50 font-medium">
                            Performance
                          </span>{" "}
                          — actual UPH vs standard rate (target ÷ shift hours).
                          Capped at 100%.
                        </p>
                        <p>
                          <span className="text-[#e1e2ec]/50 font-medium">
                            Quality
                          </span>{" "}
                          — first-pass yield from scrap log. Kicked lids reduce
                          FPY; scrapped panels do not.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* HPU TAB */}
                  {activeTab === "hpu" && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                        HPU Trend
                        <span className="ml-2 text-vs2/60 normal-case font-normal">
                          · from scan log
                        </span>
                      </p>
                      <div className="h-8 flex items-center justify-center text-[#e1e2ec]/20 text-xs italic">
                        Trend tracking — coming soon
                      </div>
                    </div>
                  )}

                  {/* DOWNTIME TAB */}
                  {activeTab === "downtime" && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#e1e2ec]/40 mb-3">
                        Downtime Log
                        <span className="ml-2 text-vs2/60 normal-case font-normal">
                          · this shift
                        </span>
                        {downtimeEntries.some((e) => e.endTime === null) && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold text-status-red normal-case font-normal">
                            <span className="w-1.5 h-1.5 rounded-full bg-status-red animate-pulse" />
                            ongoing
                          </span>
                        )}
                      </p>
                      <DowntimeTimeline entries={downtimeEntries} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-8 items-center justify-center text-center">
                <span className="material-symbols-outlined text-[#e1e2ec]/10 text-5xl">
                  radio_button_unchecked
                </span>
                <p className="text-sm text-[#e1e2ec]/30 max-w-xs">
                  No MES schedule loaded. Start the simulator to see live
                  production data.
                </p>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
